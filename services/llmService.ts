import { FixRequest, FixResponse, ToolCall, LLMConfig, Attachment, KnowledgeEntry, FileDiff, ProjectFile, SearchResult } from '../types';

// Import new services
import { contextService } from './contextService';
import { callGemini, callOpenAICompatible, callOpenAICompatibleStream } from './llmClient';
import { GEMINI_TOOL_DEFINITIONS } from './llmTools';

// --- HELPERS ---
const estimateTokens = (text: string) => Math.ceil(text.length / 4);
const LAZY_LOAD_THRESHOLD = 30000;

// Generate UUID for tool calls and changes
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
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
  return results.slice(0, 20); // Limit results
};

// --- STREAMING INTERFACE ---
interface StreamingCallbacks {
  onContent: (content: string) => void;
  onToolCalls?: (toolCalls: ToolCall[]) => void;
  onProposedChanges?: (changes: FileDiff[]) => void;
  onStatusUpdate?: (status: string) => void; // <--- ADDED THIS
  onComplete: (fullResponse: string) => void;
  onError: (error: string) => void;
}

// --- ORCHESTRATOR ---
export const fixCodeWithGemini = async (request: FixRequest): Promise<FixResponse> => {
  const { 
    llmConfig, history, currentMessage, allFiles, activeFile, mode, attachments, 
    roles, knowledgeBase, useInternet, currentTodos, projectSummary, useCompression, contextTransfer 
  } = request;

  // ... (Validation logic stays the same) ...
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

  // Calculate Context and Compression
  const totalChars = safeAllFiles.reduce((acc, f) => acc + (f.content?.length || 0), 0);
  const shouldCompress = useCompression || (totalChars > LAZY_LOAD_THRESHOLD && !request.useHighCapacity);

  let fileContext = "";
  let usedCompression = false;

  // ... (Context building logic stays the same) ...
  if (shouldCompress && projectSummary) {
    usedCompression = true;
    const compressionConfig = llmConfig.compression || { enabled: true, maxFiles: 15, maxFileSize: 50000, autoSummarize: true, preserveStructure: true };
    const relevantFiles = contextService.filterRelevantFiles(safeAllFiles, currentMessage, safeActiveFile, compressionConfig);
    fileContext = `COMPRESSED PROJECT CONTEXT:\n${projectSummary.summary || 'No summary available'}\n\nKEY FILES:\n${relevantFiles.map(f => `- ${f.name}`).join('\n')}\n\nACTIVE FILE:\n${safeActiveFile.content}`;
  } else {
    fileContext = safeAllFiles.map(f => `File: ${f.name} (${f.language})\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');
  }

  const tagsInMessage: string[] = currentMessage.match(/#[\w-]+/g) || [];
  const relevantKnowledge = (knowledgeBase || []).filter(entry => 
    entry && entry.tags && (entry.tags.some(tag => tagsInMessage.includes(tag)) || entry.tags.includes('#global'))
  );

  const knowledgeContext = relevantKnowledge.length > 0 ? `\nRELEVANT KNOWLEDGE:\n${relevantKnowledge.map(k => `- ${k.content}`).join('\n')}` : "";
  const coderRole = (roles || []).find(r => r.id === llmConfig.coderRoleId) || (roles || [])[1];

  // EXECUTION STEP
  let activeAgentModel = llmConfig.chatModelId || llmConfig.coderModelId || llmConfig.activeModelId;
  if (!activeAgentModel) return { response: "", error: "No active model configured." };

  let systemInstruction = `
${coderRole?.systemPrompt || 'You are a helpful AI assistant.'}
Task: ${mode === 'FIX' ? 'Execute the plan and apply fixes.' : 'Explain/Answer.'}
${fileContext}
${knowledgeContext}

USER REQUEST: ${currentMessage}

IMPORTANT: If you need to create or update files, YOU MUST USE THE PROVIDED TOOLS. 
Do not just say "I will create the file". CALL THE FUNCTION 'create_file' or 'update_file'.
`;

  try {
    let responseText = "";
    let toolCalls: ToolCall[] = [];
    const proposedChanges: FileDiff[] = [];

    const processToolCalls = (rawCalls: any[]) => {
      rawCalls.forEach((fc: any) => {
        try {
          const args = typeof fc.args === 'string' ? JSON.parse(fc.args) : (fc.args || {});
          const toolCall: ToolCall = {
            id: 'call_' + Math.random().toString(36).substr(2, 9),
            name: fc.name,
            args: args
          };
          toolCalls.push(toolCall);

          if (toolCall.name === 'update_file') {
             // Validate file exists before update
             const existing = safeAllFiles.find(f => f.name === toolCall.args.name);
             if(existing) {
                proposedChanges.push({ id: generateUUID(), fileName: toolCall.args.name, originalContent: existing.content, newContent: toolCall.args.content, type: 'update' });
             }
          } else if (toolCall.name === 'create_file') {
            proposedChanges.push({ id: generateUUID(), fileName: toolCall.args.name, originalContent: '', newContent: toolCall.args.content, type: 'create' });
          } else if (toolCall.name === 'search_files') {
            const results = performSearch(toolCall.args.query, safeAllFiles);
            responseText += `\n\nSearch Results: ${results.length} found.`;
          } else if (toolCall.name === 'read_file') {
            const f = safeAllFiles.find(file => file.name === toolCall.args.fileName);
            responseText += f ? `\n\nRead content of ${f.name}` : `\n\nFile not found.`;
          }
        } catch (error) { console.error('Tool Error', error); }
      });
    };

    if (isGemini) {
      const parts = [{ text: systemInstruction }, { text: currentMessage }];
      const res = await callGemini(activeAgentModel, parts, apiKey, true, useInternet);
      if (res.functionCalls) processToolCalls(res.functionCalls);
      responseText = (res.text || "") + responseText;
    } else {
      const messages = [{ role: 'system', content: systemInstruction }, ...safeHistory.slice(-4).map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content })), { role: 'user', content: currentMessage }];
      const res = await callOpenAICompatible(baseUrl, apiKey, activeAgentModel, messages, true, (isLocal ? getLocalProviderConfig('custom', baseUrl).customHeaders : {}));

      responseText = (res.choices?.[0]?.message?.content || "") + responseText;
      const tools = res.choices?.[0]?.message?.tool_calls;
      if (tools) {
        processToolCalls(tools.map((tc: any) => ({ name: tc.function.name, args: tc.function.arguments })));
      }
    }

    return { response: responseText.trim(), toolCalls: toolCalls.length > 0 ? toolCalls : undefined, proposedChanges, contextSummarized: usedCompression };
  } catch (error: any) {
    return { response: "", error: `Error: ${error.message}` };
  }
};

// --- STREAMING ORCHESTRATOR (FIXED) ---
export const streamFixCodeWithGemini = async (
  request: FixRequest,
  callbacks: StreamingCallbacks,
  signal?: AbortSignal
): Promise<void> => {
  const { 
    llmConfig, history, currentMessage, allFiles, activeFile, mode, 
    roles, knowledgeBase, useCompression, projectSummary
  } = request;

  // 1. Validation
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

  if (isGemini) {
    callbacks.onError('Streaming with tools is not fully supported for Gemini in this version. Disable streaming.');
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
    // 2. Context Building (Condensed for brevity)
    let fileContext = "";
    if (useCompression && projectSummary) {
      // Logic same as non-streaming...
      fileContext = `CONTEXT:\n${projectSummary.summary}\nACTIVE:\n${safeActiveFile.content}`;
    } else {
      fileContext = safeAllFiles.map(f => `File: ${f.name}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');
    }

    const systemInstruction = `
      You are an expert coding assistant.
      ${fileContext}
      USER REQUEST: ${currentMessage}
      
      CRITICAL: You have access to tools. 
      IF THE USER ASKS TO CREATE OR UPDATE A FILE, YOU MUST CALL THE TOOLS 'create_file' or 'update_file'.
      DO NOT just describe the code. Execute the tool immediately.
    `;

    const messages = [
      { role: 'system', content: systemInstruction },
      ...(history || []).slice(-4).map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content })),
      { role: 'user', content: currentMessage }
    ];

    let activeAgentModel = llmConfig.chatModelId || llmConfig.activeModelId;

    // --- THE FIX: ACCUMULATE TOOL CALLS ---
    let accumulatedToolCalls: Record<number, { name: string, args: string, id: string }> = {};

    await callOpenAICompatibleStream(
      baseUrl, 
      apiKey, 
      activeAgentModel, 
      messages, 
      true, // Tools enabled
      (isLocal ? getLocalProviderConfig('custom', baseUrl).customHeaders : {}),
      callbacks.onContent,
      // Handle Tool Call Chunks - WITH STATUS UPDATES
      (toolCallChunks) => {
        toolCallChunks.forEach((chunk) => {
          const index = chunk.index;
          if (!accumulatedToolCalls[index]) {
            accumulatedToolCalls[index] = { name: '', args: '', id: '' };
          }
          if (chunk.id) accumulatedToolCalls[index].id = chunk.id;
          if (chunk.function?.name) accumulatedToolCalls[index].name += chunk.function.name;
          if (chunk.function?.arguments) accumulatedToolCalls[index].args += chunk.function.arguments;

          // ADDED: Detect intent and emit status updates
          if (chunk.function?.name && callbacks.onStatusUpdate) {
            const toolName = chunk.function.name;
            if (toolName === 'search_files') callbacks.onStatusUpdate("🔍 Searching project files...");
            if (toolName === 'create_file') callbacks.onStatusUpdate("📝 Creating new file...");
            if (toolName === 'update_file') callbacks.onStatusUpdate("🔨 Applying fixes to file...");
            if (toolName === 'read_file') callbacks.onStatusUpdate("📖 Reading file content...");
          }
        });
      },
      signal
    );

    // 3. Process Accumulated Tools after Stream
    const finalToolCalls: ToolCall[] = [];
    const proposedChanges: FileDiff[] = [];

    Object.values(accumulatedToolCalls).forEach((tc) => {
      try {
        if (!tc.name) return;
        const args = tc.args ? JSON.parse(tc.args) : {};

        // Push to tool calls list (for UI display)
        finalToolCalls.push({ id: tc.id || generateUUID(), name: tc.name, args });

        // Logic to Generate FileDiffs
        if (tc.name === 'create_file') {
          proposedChanges.push({
            id: generateUUID(),
            fileName: args.name,
            originalContent: '',
            newContent: args.content,
            type: 'create'
          });
        } else if (tc.name === 'update_file') {
          const existing = safeAllFiles.find(f => f.name === args.name);
          if (existing) {
            proposedChanges.push({
              id: generateUUID(),
              fileName: args.name,
              originalContent: existing.content,
              newContent: args.content,
              type: 'update'
            });
          }
        }
      } catch (e) {
        console.error("Failed to parse accumulated tool call:", e);
        callbacks.onContent(`\n[Error executing tool: ${e}]`);
      }
    });

    // 4. Trigger Callbacks
    if (finalToolCalls.length > 0 && callbacks.onToolCalls) {
      callbacks.onToolCalls(finalToolCalls);
    }

    if (proposedChanges.length > 0 && callbacks.onProposedChanges) {
      callbacks.onProposedChanges(proposedChanges);
      callbacks.onContent(`\n\n[SUCCESS] I have prepared ${proposedChanges.length} file changes. Please review and apply them.`);
    }

    callbacks.onComplete("");

  } catch (error: any) {
    if (error.name !== 'AbortError') callbacks.onError(error.message);
  }
};