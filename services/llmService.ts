import { FixRequest, FixResponse, ToolCall, LLMConfig, Attachment, KnowledgeEntry, FileDiff, ProjectFile, SearchResult } from '../types';
import { contextService } from './contextService';
import { callGemini, callOpenAICompatible, callOpenAICompatibleStream } from './llmClient';
import { ToolUsageLogger, KnowledgeManager } from './llmTools';

// --- HELPERS ---
const estimateTokens = (text: string) => Math.ceil(text.length / 4);
const LAZY_LOAD_THRESHOLD = 30000;
const MAX_AGENT_TURNS = 5; // Prevent infinite loops
const PROTECTED_FILES = ['.env', '.git', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store'];

// Generate UUID for tool calls and changes
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Security Check
const isFileProtected = (fileName: string): boolean => {
  return PROTECTED_FILES.some(protectedStr => fileName.includes(protectedStr));
};

// Robust JSON Parser for Local Models
const safeJsonParse = (jsonStr: string): any => {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Attempt simple fix for common local model errors (trailing commas)
    try {
      const fixed = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      return JSON.parse(fixed);
    } catch (e2) {
      throw new Error(`Invalid JSON format: ${jsonStr.substring(0, 50)}...`);
    }
  }
};

// --- LOCAL MODEL SUPPORT ---
interface LocalProviderConfig {
  name: string;
  baseUrl: string;
  models: string[];
  requiresAuth: boolean;
  customHeaders?: Record<string, string>;
}

const LOCAL_PROVIDERS: Record<string, LocalProviderConfig> = {
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434',
    models: ['codellama:7b', 'llama2:7b', 'mistral:7b', 'phi3:latest'],
    requiresAuth: false
  },
  lmstudio: {
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234',
    models: ['local-model'],
    requiresAuth: false
  },
  textwebui: {
    name: 'Text Generation WebUI',
    baseUrl: 'http://localhost:5000',
    models: ['local-model'],
    requiresAuth: false
  },
  huggingface: {
    name: 'Hugging Face Inference',
    baseUrl: 'https://api-inference.huggingface.co',
    models: ['mistralai/Mistral-7B-Instruct-v0.2', 'codellama/CodeLlama-7b-Instruct-hf'],
    requiresAuth: true
  },
  custom: {
    name: 'Custom Endpoint',
    baseUrl: '',
    models: ['custom-model'],
    requiresAuth: false
  }
};

const getLocalProviderConfig = (provider: string, customUrl?: string): LocalProviderConfig => {
  const config = LOCAL_PROVIDERS[provider] || LOCAL_PROVIDERS.custom;
  if (provider === 'custom' && customUrl) {
    return { ...config, baseUrl: customUrl };
  }
  return config;
};

// --- SEARCH LOGIC ---
const performSearch = (query: string, files: ProjectFile[]): SearchResult[] => {
  const results: SearchResult[] = [];
  const safeFiles = files || [];
  const lowerQuery = query.toLowerCase();

  safeFiles.forEach(f => {
    if (!f || !f.content) return;

    const lines = f.content.split('\n');
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(lowerQuery)) {
        results.push({
          fileId: f.id || generateUUID(),
          fileName: f.name || 'unknown',
          line: index + 1,
          content: line.trim()
        });
      }
    });
  });
  return results.slice(0, 20);
};

// --- STREAMING INTERFACE ---
interface StreamingCallbacks {
  onContent: (content: string) => void;
  onToolCalls?: (toolCalls: ToolCall[]) => void;
  onProposedChanges?: (changes: FileDiff[]) => void;
  onStatusUpdate?: (status: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: string) => void;
}

// --- ENHANCED PROMPT ENGINEERING WITH KNOWLEDGE INTEGRATION ---
const buildSystemPrompt = (
  mode: string,
  fileContext: string,
  knowledgeContext: string,
  currentMessage: string,
  coderRole: any,
  hasTools: boolean,
  knowledgeManager: KnowledgeManager
): string => {
  const toolInstructions = hasTools ? `
CRITICAL TOOL USAGE RULES:
1. When user asks to CREATE a file → IMMEDIATELY call create_file tool
2. When user asks to MODIFY/UPDATE/FIX code → IMMEDIATELY call update_file tool  
3. When user asks to SEARCH code → call search_files tool
4. When you need to READ a specific file → call read_file tool
5. When user teaches you something NEW or you discover useful patterns → call save_knowledge tool
6. NEVER describe what you will do - EXECUTE the tools directly
7. If tool fails, try again with corrected parameters

AVAILABLE TOOLS: create_file, update_file, search_files, read_file, save_knowledge, manage_tasks

KNOWLEDGE SAVING GUIDELINES:
- Save user preferences (coding style, architecture choices, tool preferences)
- Save project-specific patterns and conventions
- Save learned concepts and best practices
- Save technical decisions and their reasoning
- Use #global tag for cross-project knowledge
- Use #project tag for current project specifics
- Use #user tag for personal preferences
` : '';

  return `
${coderRole?.systemPrompt || 'You are an expert AI coding assistant that learns and remembers across sessions.'}

MODE: ${mode === 'FIX' ? 'Execute code changes and fixes' : 'Explain and answer questions'}
${fileContext}
${knowledgeContext}

USER REQUEST: ${currentMessage}

${toolInstructions}

RESPONSE GUIDELINES:
- Be direct and action-oriented
- If changes are needed, USE THE TOOLS immediately
- Save important learnings using save_knowledge tool
- Reference previous knowledge when relevant
- Provide clear explanations only after executing actions
- When fixing code, show the complete fixed file content
- If unsure, ask clarifying questions
`;
};

// --- SHARED TOOL EXECUTION LOGIC ---
// Extracts the logic to ensure consistency between Streaming and Non-Streaming
const executeToolAction = (
  toolName: string, 
  args: any, 
  files: ProjectFile[], 
  logger: ToolUsageLogger,
  knowledgeManager: KnowledgeManager
): { output: string; change?: FileDiff } => {
  
  let toolOutput = "";
  let change: FileDiff | undefined;

  try {
    if (toolName === 'update_file') {
      if (isFileProtected(args.name)) {
        toolOutput = `Error: Cannot modify protected file "${args.name}" for security reasons.`;
        logger.logToolCall('update_file', false, `Blocked write to ${args.name}`);
      } else {
        const existing = files.find(f => f.name === args.name);
        if (existing) {
          change = {
            id: generateUUID(),
            fileName: args.name,
            originalContent: existing.content,
            newContent: args.content,
            type: 'update'
          };
          toolOutput = `Success: Prepared update for ${args.name}.`;
          logger.logToolCall('update_file', true, `Updated ${args.name}`);
        } else {
          toolOutput = `Error: File "${args.name}" not found. Please use create_file or check the name.`;
          logger.logToolCall('update_file', false, `File not found: ${args.name}`);
        }
      }

    } else if (toolName === 'create_file') {
      if (isFileProtected(args.name)) {
        toolOutput = `Error: Cannot create protected file "${args.name}".`;
      } else {
        change = {
          id: generateUUID(),
          fileName: args.name,
          originalContent: '',
          newContent: args.content,
          type: 'create'
        };
        toolOutput = `Success: Prepared creation of ${args.name}.`;
        logger.logToolCall('create_file', true, `Created ${args.name}`);
      }

    } else if (toolName === 'search_files') {
      const results = performSearch(args.query, files);
      toolOutput = `Search Results for "${args.query}":\n${results.map(r => `- ${r.fileName}:${r.line} ${r.content}`).join('\n')}`;
      if (results.length === 0) toolOutput = "No matches found.";
      logger.logToolCall('search_files', true, `Found ${results.length} results`);

    } else if (toolName === 'read_file') {
      const f = files.find(file => file.name === args.fileName);
      if (f) {
        toolOutput = `Content of ${f.name}:\n\`\`\`${f.language}\n${f.content}\n\`\`\``;
        logger.logToolCall('read_file', true, `Read ${f.name}`);
      } else {
        toolOutput = `Error: File "${args.fileName}" not found.`;
        logger.logToolCall('read_file', false, `File not found: ${args.fileName}`);
      }

    } else if (toolName === 'save_knowledge') {
      knowledgeManager.saveKnowledge(
        args.tags,
        args.content,
        args.tags.includes('#global') ? 'global' : 'project'
      );
      toolOutput = `Saved knowledge: ${args.content}`;
      logger.logToolCall('save_knowledge', true, `Saved knowledge`);
    } else {
      toolOutput = `Error: Unknown tool "${toolName}"`;
    }
  } catch (err: any) {
    toolOutput = `Error executing ${toolName}: ${err.message}`;
    logger.logToolCall(toolName, false, err.message);
  }

  return { output: toolOutput, change };
};

// --- ORCHESTRATOR (NON-STREAMING) ---
export const fixCodeWithGemini = async (request: FixRequest): Promise<FixResponse> => {
  const { 
    llmConfig, history, currentMessage, allFiles, activeFile, mode, attachments, 
    roles, knowledgeBase, useInternet, currentTodos, projectSummary, useCompression, contextTransfer 
  } = request;

  const logger = ToolUsageLogger.getInstance();
  const knowledgeManager = KnowledgeManager.getInstance();

  if (knowledgeBase) knowledgeManager.loadKnowledge(knowledgeBase);
  if (!llmConfig) return { response: "", error: "Missing LLM configuration" };
  if (!currentMessage?.trim()) return { response: "", error: "Empty message" };

  const safeAllFiles = allFiles || [];
  const safeActiveFile = activeFile || safeAllFiles[0];
  const safeHistory = history || [];

  if (!safeActiveFile) return { response: "", error: "No active file available" };

  const isGemini = llmConfig.provider === 'gemini';
  const isLocal = llmConfig.provider === 'local';

  let apiKey = llmConfig.apiKey || '';
  let baseUrl = llmConfig.baseUrl || '';

  if (isLocal) {
    const localConfig = getLocalProviderConfig('custom', baseUrl);
    baseUrl = localConfig.baseUrl || baseUrl;
    if (localConfig.requiresAuth && !apiKey) return { response: "", error: `API Key required for ${localConfig.name}` };
  } else if (llmConfig.provider === 'openrouter') {
    baseUrl = 'https://openrouter.ai/api/v1';
  } else if (llmConfig.provider === 'openai') {
    baseUrl = baseUrl || 'https://api.openai.com/v1';
  }

  // Context and Compression
  const totalChars = safeAllFiles.reduce((acc, f) => acc + (f.content?.length || 0), 0);
  const shouldCompress = useCompression || (totalChars > LAZY_LOAD_THRESHOLD && !request.useHighCapacity);
  let fileContext = "";
  let usedCompression = false;

  if (shouldCompress && projectSummary) {
    usedCompression = true;
    const compressionConfig = llmConfig.compression || { enabled: true, maxFiles: 15, maxFileSize: 50000, autoSummarize: true, preserveStructure: true };
    const relevantFiles = contextService.filterRelevantFiles(safeAllFiles, currentMessage, safeActiveFile, compressionConfig);
    fileContext = `PROJECT CONTEXT:\n${projectSummary.summary || 'No summary available'}\n\nKEY FILES:\n${relevantFiles.map(f => `- ${f.name}`).join('\n')}\n\nACTIVE FILE (${safeActiveFile.name}):\n\`\`\`${safeActiveFile.language}\n${safeActiveFile.content}\n\`\`\``;
  } else {
    fileContext = `ALL PROJECT FILES:\n${safeAllFiles.map(f => `File: ${f.name} (${f.language})\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n')}`;
  }

  // Knowledge Retrieval
  const messageTokens = currentMessage.toLowerCase().split(/[\s,.]+/);
  const tagsInMessage: string[] = currentMessage.match(/#[\w-]+/g) || [];

  const relevantKnowledge = (knowledgeBase || []).filter(entry => {
    if (!entry.tags) return false;
    if (entry.tags.some(tag => tagsInMessage.includes(tag))) return true;
    if (entry.tags.includes('#global')) return true;
    return entry.tags.some(tag => {
      const bareTag = tag.replace('#', '').toLowerCase();
      return messageTokens.includes(bareTag) || bareTag.split('-').every(part => messageTokens.includes(part));
    });
  });

  const knowledgeContext = relevantKnowledge.length > 0 ? 
    `\nRELEVANT KNOWLEDGE/PREFERENCES:\n${relevantKnowledge.map(k => `- ${k.content} [${k.tags.join(', ')}]`).join('\n')}` : "";

  const coderRole = (roles || []).find(r => r.id === llmConfig.coderRoleId) || (roles || [])[1];

  let activeAgentModel = llmConfig.chatModelId || llmConfig.coderModelId || llmConfig.activeModelId;
  if (!activeAgentModel) return { response: "", error: "No active model configured." };

  const systemInstruction = buildSystemPrompt(
    mode, 
    fileContext, 
    knowledgeContext, 
    currentMessage, 
    coderRole, 
    true,
    knowledgeManager
  );

  let finalResponseText = "";
  const allProposedChanges: FileDiff[] = [];
  const allToolCalls: ToolCall[] = [];

  let conversationMessages: any[] = [];

  if (isGemini) {
    conversationMessages = [
        { text: systemInstruction },
        ...safeHistory.slice(-4).map(msg => ({ text: `${msg.role === 'user' ? 'USER' : 'ASSISTANT'}: ${msg.content}` })),
        { text: `USER: ${currentMessage}` }
    ];
  } else {
    conversationMessages = [
      { role: 'system', content: systemInstruction }, 
      ...safeHistory.slice(-4).map(h => ({ 
        role: h.role === 'model' ? 'assistant' : 'user', 
        content: h.content 
      })), 
      { role: 'user', content: currentMessage }
    ];
  }

  let turnCount = 0;
  let keepGoing = true;

  try {
    while (keepGoing && turnCount < MAX_AGENT_TURNS) {
      turnCount++;
      let currentResponseText = "";
      let currentToolCalls: any[] = [];

      // 1. CALL LLM
      if (isGemini) {
        const res = await callGemini(activeAgentModel, conversationMessages, apiKey, true, useInternet);
        currentResponseText = res.text || "";
        if (res.functionCalls) currentToolCalls = res.functionCalls;
      } else {
        const res = await callOpenAICompatible(
          baseUrl, apiKey, activeAgentModel, conversationMessages, true, 
          (isLocal ? getLocalProviderConfig('custom', baseUrl).customHeaders : {})
        );
        const message = res.choices?.[0]?.message;
        currentResponseText = message?.content || "";
        if (message?.tool_calls) {
          currentToolCalls = message.tool_calls.map((tc: any) => ({
            name: tc.function.name,
            args: tc.function.arguments
          }));
        }
      }

      finalResponseText += currentResponseText;

      if (currentToolCalls.length === 0) {
        keepGoing = false;
        break;
      }

      if (isGemini) {
        conversationMessages.push({ text: `ASSISTANT: ${currentResponseText}` });
      } else {
        conversationMessages.push({ role: 'assistant', content: currentResponseText });
      }

      // 2. EXECUTE TOOLS (Refactored to use shared logic)
      for (const fc of currentToolCalls) {
        const args = typeof fc.args === 'string' ? safeJsonParse(fc.args) : (fc.args || {});
        const toolCall: ToolCall = {
            id: 'call_' + Math.random().toString(36).substr(2, 9),
            name: fc.name,
            args: args
        };
        allToolCalls.push(toolCall);

        const { output, change } = executeToolAction(fc.name, args, safeAllFiles, logger, knowledgeManager);
        
        if (change) allProposedChanges.push(change);

        // Add Tool Result to History
        if (isGemini) {
            conversationMessages.push({ text: `TOOL_OUTPUT (${fc.name}): ${output}` });
        } else {
            conversationMessages.push({ role: 'user', content: `[System Tool Output for ${fc.name}]: ${output}` });
        }
      } 
    }

    return { 
      response: finalResponseText.trim(), 
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined, 
      proposedChanges: allProposedChanges, 
      contextSummarized: usedCompression 
    };
  } catch (error: any) {
    logger.logToolCall('llm_service', false, error.message);
    return { response: "", error: `Service Error: ${error.message}` };
  }
};

// --- ENHANCED STREAMING ORCHESTRATOR WITH AGENT LOOP ---
export const streamFixCodeWithGemini = async (
  request: FixRequest,
  callbacks: StreamingCallbacks,
  signal?: AbortSignal
): Promise<void> => {
  const { 
    llmConfig, history, currentMessage, allFiles, activeFile, mode, 
    roles, knowledgeBase, useCompression, projectSummary
  } = request;

  const logger = ToolUsageLogger.getInstance();
  const knowledgeManager = KnowledgeManager.getInstance();

  if (knowledgeBase) knowledgeManager.loadKnowledge(knowledgeBase);
  if (!llmConfig || !currentMessage) {
    callbacks.onError("Configuration or message missing.");
    return;
  }

  const safeAllFiles = allFiles || [];
  const safeActiveFile = activeFile || safeAllFiles[0];

  const isGemini = llmConfig.provider === 'gemini';
  const isLocal = llmConfig.provider === 'local';
  let apiKey = llmConfig.apiKey || '';
  let baseUrl = llmConfig.baseUrl || '';

  // Currently, the multi-turn logic below is optimized for OpenAI/Local compatible streams.
  // Gemini streaming has a different SDK signature.
  if (isGemini) {
    callbacks.onError('Streaming with multi-turn tools is not fully supported for Gemini in this version. Please use non-streaming mode.');
    return;
  }

  if (isLocal) {
    const localConfig = getLocalProviderConfig('custom', baseUrl);
    baseUrl = localConfig.baseUrl || baseUrl;
  } else if (llmConfig.provider === 'openrouter') {
    baseUrl = 'https://openrouter.ai/api/v1';
  } else if (llmConfig.provider === 'openai') {
    baseUrl = baseUrl || 'https://api.openai.com/v1';
  }

  try {
    // 2. Context Building
    let fileContext = "";
    if (useCompression && projectSummary) {
      fileContext = `PROJECT CONTEXT:\n${projectSummary.summary}\n\nACTIVE FILE (${safeActiveFile.name}):\n\`\`\`${safeActiveFile.language}\n${safeActiveFile.content}\n\`\`\``;
    } else {
      fileContext = `ALL PROJECT FILES:\n${safeAllFiles.map(f => `File: ${f.name} (${f.language})\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n')}`;
    }

    const messageTokens = currentMessage.toLowerCase().split(/[\s,.]+/);
    const tagsInMessage: string[] = currentMessage.match(/#[\w-]+/g) || [];
    const relevantKnowledge = (knowledgeBase || []).filter(entry => {
        if (!entry.tags) return false;
        if (entry.tags.some(tag => tagsInMessage.includes(tag))) return true;
        if (entry.tags.includes('#global')) return true;
        return entry.tags.some(tag => {
            const bareTag = tag.replace('#', '').toLowerCase();
            return messageTokens.includes(bareTag) || bareTag.split('-').every(part => messageTokens.includes(part));
        });
    });

    const knowledgeContext = relevantKnowledge.length > 0 ? `\nRELEVANT KNOWLEDGE:\n${relevantKnowledge.map(k => `- ${k.content}`).join('\n')}` : "";
    const coderRole = (roles || []).find(r => r.id === llmConfig.coderRoleId) || (roles || [])[1];

    const systemInstruction = buildSystemPrompt(
      mode, fileContext, knowledgeContext, currentMessage, coderRole, true, knowledgeManager
    );

    // Initialize Conversation History
    const messages = [
      { role: 'system', content: systemInstruction },
      ...(history || []).slice(-4).map(h => ({ 
        role: h.role === 'model' ? 'assistant' : 'user', 
        content: h.content 
      })),
      { role: 'user', content: currentMessage }
    ];

    let activeAgentModel = llmConfig.chatModelId || llmConfig.activeModelId;
    let turnCount = 0;
    let keepGoing = true;
    let fullTextResponse = "";

    // --- AGENT STREAMING LOOP ---
    while (keepGoing && turnCount < MAX_AGENT_TURNS) {
      turnCount++;
      let turnTextResponse = "";
      let accumulatedToolCalls: Record<number, { name: string, args: string, id: string }> = {};

      // 1. Call Stream for current turn
      await callOpenAICompatibleStream(
        baseUrl, 
        apiKey, 
        activeAgentModel, 
        messages, 
        true, // Tools enabled
        (isLocal ? getLocalProviderConfig('custom', baseUrl).customHeaders : {}),
        (content) => {
          turnTextResponse += content;
          fullTextResponse += content;
          callbacks.onContent(content); // Stream text to UI immediately
        },
        (toolCallChunks) => {
          // Accumulate tool fragments
          toolCallChunks.forEach((chunk) => {
            const index = chunk.index;
            if (!accumulatedToolCalls[index]) {
              accumulatedToolCalls[index] = { name: '', args: '', id: '' };
            }
            if (chunk.id) accumulatedToolCalls[index].id = chunk.id;
            if (chunk.function?.name) accumulatedToolCalls[index].name += chunk.function.name;
            if (chunk.function?.arguments) accumulatedToolCalls[index].args += chunk.function.arguments;

            if (chunk.function?.name && callbacks.onStatusUpdate) {
               // Only update status on first detection of name to avoid flicker
               const toolName = chunk.function.name;
               if (!accumulatedToolCalls[index].name.includes(toolName.slice(0, -1))) {
                 if (toolName === 'search_files') callbacks.onStatusUpdate("🔍 Searching...");
                 if (toolName === 'create_file') callbacks.onStatusUpdate("📝 Creating...");
                 if (toolName === 'update_file') callbacks.onStatusUpdate("🔨 Fix applied...");
                 if (toolName === 'read_file') callbacks.onStatusUpdate("📖 Reading...");
               }
            }
          });
        },
        signal
      );

      // 2. Process Tools for this turn
      const toolCallsInThisTurn = Object.values(accumulatedToolCalls);

      if (toolCallsInThisTurn.length === 0) {
        keepGoing = false; // No tools called, Agent is done
      } else {
        // Add Assistant's thoughts/calls to history so it remembers what it did
        messages.push({ role: 'assistant', content: turnTextResponse }); // Note: Strict OpenAI requires tool_calls object here too, but generic locals often tolerate just content.

        // Execute Tools
        for (const tc of toolCallsInThisTurn) {
          try {
             if (!tc.name) continue;
             const args = tc.args ? safeJsonParse(tc.args) : {};
             
             // Emit parsed tool call for UI tracking
             if (callbacks.onToolCalls) {
               callbacks.onToolCalls([{ id: tc.id || generateUUID(), name: tc.name, args }]);
             }

             // Execute logic
             const { output, change } = executeToolAction(tc.name, args, safeAllFiles, logger, knowledgeManager);

             // Emit changes if any
             if (change && callbacks.onProposedChanges) {
                callbacks.onProposedChanges([change]);
                // Visual feedback in stream
                callbacks.onContent(`\n\n✅ [Action]: ${tc.name} executed successfully.\n`);
             }

             // 3. Feed result back to LLM
             // For generic compatibility, we often use user role with a system prefix.
             messages.push({ 
               role: 'user', 
               content: `[Tool Result for ${tc.name}]: ${output}` 
             });

          } catch (e: any) {
            console.error("Tool execution failed in stream:", e);
            messages.push({ role: 'user', content: `[Tool Error]: ${e.message}` });
          }
        }
        // Loop continues to next turn to let LLM see the tool output and decide next steps
      }
    }

    callbacks.onComplete(fullTextResponse);

  } catch (error: any) {
    logger.logToolCall('stream_service', false, error.message);
    if (error.name !== 'AbortError') callbacks.onError(error.message);
  }
};

export { ToolUsageLogger };