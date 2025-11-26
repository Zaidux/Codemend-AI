import { GoogleGenAI, Type } from "@google/genai";
import { FixRequest, FixResponse, ToolCall, LLMConfig, Attachment, KnowledgeEntry, FileDiff, TodoItem, ProjectFile, SearchResult } from '../types';

// Import the new services
import { contextService } from './contextService';
import { modelSwitchService } from './modelSwitchService';

// --- TOOL DEFINITIONS ---

// Gemini-compatible tool definitions
const GEMINI_TOOL_DEFINITIONS = [
  {
    name: 'create_file',
    description: 'Create a new file in the project workspace.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'The name of the file (e.g., utils.js, styles.css)' },
        content: { type: Type.STRING, description: 'The content of the file' },
        language: { type: Type.STRING, description: 'The programming language of the file' }
      },
      required: ['name', 'content']
    }
  },
  {
    name: 'update_file',
    description: 'Update the content of an existing file. Use this to apply fixes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'The name of the file to update' },
        content: { type: Type.STRING, description: 'The new full content of the file' }
      },
      required: ['name', 'content']
    }
  },
  {
    name: 'save_knowledge',
    description: 'Save a learned concept, pattern, or preference.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Tags to retrieve this info later' },
        content: { type: Type.STRING, description: 'The knowledge or pattern to save.' }
      },
      required: ['tags', 'content']
    }
  },
  {
    name: 'manage_tasks',
    description: 'Manage the project To-Do list.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['add', 'update', 'complete', 'delete'], description: 'The action to perform' },
        task: { type: Type.STRING, description: 'The task description' },
        phase: { type: Type.STRING, description: 'The phase' },
        taskId: { type: Type.STRING, description: 'The ID of the task' },
        status: { type: Type.STRING, enum: ['pending', 'in_progress', 'completed'], description: 'Status' }
      },
      required: ['action']
    }
  },
  {
    name: 'search_files',
    description: 'Search for a string or pattern across all files in the project. Returns file names and lines.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'The string or simple regex to search for.' }
      },
      required: ['query']
    }
  },
  {
    name: 'read_file',
    description: 'Read the full content of a specific file. Use this when you only have the file name.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'The name of the file to read.' }
      },
      required: ['fileName']
    }
  }
];

// OpenAI-compatible tool definitions
const OPENAI_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_file',
      description: 'Create a new file in the project workspace.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the file (e.g., utils.js, styles.css)' },
          content: { type: 'string', description: 'The content of the file' },
          language: { type: 'string', description: 'The programming language of the file' }
        },
        required: ['name', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_file',
      description: 'Update the content of an existing file. Use this to apply fixes.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the file to update' },
          content: { type: 'string', description: 'The new full content of the file' }
        },
        required: ['name', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_knowledge',
      description: 'Save a learned concept, pattern, or preference.',
      parameters: {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags to retrieve this info later' },
          content: { type: 'string', description: 'The knowledge or pattern to save.' }
        },
        required: ['tags', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'manage_tasks',
      description: 'Manage the project To-Do list.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'update', 'complete', 'delete'], description: 'The action to perform' },
          task: { type: 'string', description: 'The task description' },
          phase: { type: 'string', description: 'The phase' },
          taskId: { type: 'string', description: 'The ID of the task' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Status' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_files',
      description: 'Search for a string or pattern across all files in the project. Returns file names and lines.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The string or simple regex to search for.' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the full content of a specific file. Use this when you only have the file name.',
      parameters: {
        type: 'object',
        properties: {
          fileName: { type: 'string', description: 'The name of the file to read.' }
        },
        required: ['fileName']
      }
    }
  }
];

// --- HELPERS ---
const estimateTokens = (text: string) => Math.ceil(text.length / 4);
const LAZY_LOAD_THRESHOLD = 30000;

// --- API CLIENTS ---

const callGemini = async (model: string, parts: any[], apiKey: string, tools: boolean = false, useInternet: boolean = false): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey });
  const config: any = {
    thinkingConfig: { thinkingBudget: 0 }
  };

  const activeTools: any[] = [];

  if (tools) {
    activeTools.push({ functionDeclarations: GEMINI_TOOL_DEFINITIONS });
  }

  if (useInternet) {
    activeTools.push({ googleSearch: {} });
  }

  if (activeTools.length > 0) {
    config.tools = activeTools;
  }

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: parts } as any,
      config
    });
    return response;
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    throw new Error(`Gemini API Error: ${error.message}`);
  }
};

const callOpenAICompatible = async (
  baseUrl: string, 
  apiKey: string, 
  model: string, 
  messages: any[], 
  tools: boolean = false,
  customHeaders: Record<string, string> = {},
  signal?: AbortSignal
): Promise<any> => {
  const body: any = {
    model: model,
    messages: messages,
    temperature: 0.1,
    stream: false,
  };

  if (tools) {
    body.tools = OPENAI_TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  if (baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://codemend.ai';
    headers['X-Title'] = 'CodeMend AI';
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error ${response.status}: ${err}`);
    }

    return await response.json();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw error;
    }
    console.error('OpenAI API Error:', error);
    throw new Error(`OpenAI API Error: ${error.message}`);
  }
};

// Streaming version for OpenAI-compatible APIs
const callOpenAICompatibleStream = async (
  baseUrl: string, 
  apiKey: string, 
  model: string, 
  messages: any[], 
  tools: boolean = false,
  customHeaders: Record<string, string> = {},
  onContent: (content: string) => void,
  onToolCall?: (toolCall: any) => void,
  signal?: AbortSignal
): Promise<string> => {
  const body: any = {
    model: model,
    messages: messages,
    temperature: 0.1,
    stream: true,
  };

  if (tools) {
    body.tools = OPENAI_TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  if (baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://codemend.ai';
    headers['X-Title'] = 'CodeMend AI';
  }

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API Error ${response.status}: ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    let fullContent = '';
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('data: [DONE]')) {
            try {
              const data = JSON.parse(line.slice(6));
              const content = data.choices[0]?.delta?.content;
              if (content) {
                fullContent += content;
                onContent(content);
              }

              // Handle tool calls in streaming
              const toolCalls = data.choices[0]?.delta?.tool_calls;
              if (toolCalls && onToolCall) {
                onToolCall(toolCalls);
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw error;
    }
    console.error('OpenAI Stream Error:', error);
    throw new Error(`OpenAI Stream Error: ${error.message}`);
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
  const lowerQuery = query.toLowerCase();

  files.forEach(f => {
    const lines = f.content.split('\n');
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(lowerQuery)) {
        results.push({
          fileId: f.id,
          fileName: f.name,
          line: index + 1,
          content: line.trim()
        });
      }
    });
  });
  return results;
};

// --- STREAMING INTERFACE ---
interface StreamingCallbacks {
  onContent: (content: string) => void;
  onToolCalls?: (toolCalls: ToolCall[]) => void;
  onProposedChanges?: (changes: FileDiff[]) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: string) => void;
}

// --- ORCHESTRATOR ---
export const fixCodeWithGemini = async (request: FixRequest): Promise<FixResponse> => {
  const { 
    llmConfig, history, currentMessage, allFiles, activeFile, mode, attachments, 
    roles, knowledgeBase, useInternet, currentTodos, projectSummary, useCompression, contextTransfer 
  } = request;

  const isGemini = llmConfig.provider === 'gemini';
  const isLocal = llmConfig.provider === 'local';

  let apiKey = llmConfig.apiKey;
  let baseUrl = llmConfig.baseUrl;

  // Handle local provider configuration
  if (isLocal) {
    const localConfig = getLocalProviderConfig('custom', baseUrl);
    baseUrl = localConfig.baseUrl || baseUrl;

    if (localConfig.requiresAuth && !apiKey) {
      return { response: "", error: `API Key required for ${localConfig.name}` };
    }
  } else if (llmConfig.provider === 'openrouter') {
    baseUrl = 'https://openrouter.ai/api/v1';
  } else if (llmConfig.provider === 'openai') {
    baseUrl = baseUrl || 'https://api.openai.com/v1';
  }

  // Validate API key
  if ((llmConfig.provider === 'openai' || llmConfig.provider === 'openrouter') && !apiKey) {
    return { response: "", error: "Missing API Key. Please configure it in settings." };
  }

  if (isGemini && !apiKey) {
    apiKey = process.env.API_KEY || '';
    if (!apiKey) {
      return { response: "", error: "Missing Gemini API Key. Please configure it in settings." };
    }
  }

  // Calculate Context Size and apply compression if needed
  const totalChars = allFiles.reduce((acc, f) => acc + f.content.length, 0);
  const shouldCompress = useCompression || (totalChars > LAZY_LOAD_THRESHOLD && !request.useHighCapacity);

  let fileContext = "";
  let usedCompression = false;

  if (shouldCompress && projectSummary) {
    // Use compressed context
    usedCompression = true;
    
    // Filter relevant files
    const compressionConfig = llmConfig.compression || {
      enabled: true,
      maxFiles: 15,
      maxFileSize: 50000,
      autoSummarize: true,
      preserveStructure: true
    };
    
    const relevantFiles = contextService.filterRelevantFiles(
      allFiles, 
      currentMessage, 
      activeFile, 
      compressionConfig
    );

    fileContext = `
COMPRESSED PROJECT CONTEXT:
${projectSummary.summary}

KEY FILES (${relevantFiles.length} of ${allFiles.length} files shown):
${relevantFiles.map(f => `- ${f.name} (${f.language})`).join('\n')}

ACTIVE FILE (Full Content):
File: ${activeFile.name}
\`\`\`${activeFile.language}
${activeFile.content}
\`\`\`

NOTE: You are seeing a compressed view. Use tools to read other files if needed.
    `.trim();
  } else if (shouldCompress) {
    // Lazy Load Mode (existing behavior)
    usedCompression = true;
    fileContext = `
PROJECT FILE INDEX (Content Hidden to Save Tokens):
${allFiles.map(f => `- ${f.name} (${f.language})`).join('\n')}

ACTIVE FILE (Full Content):
File: ${activeFile.name}
\`\`\`${activeFile.language}
${activeFile.content}
\`\`\`

NOTE: You do not see the full content of other files. 
Use the 'read_file' tool to get the content of a specific file if needed.
Use 'search_files' to find specific code patterns.
    `.trim();
  } else {
    // Full Context Mode
    fileContext = allFiles.map(f => `File: ${f.name} (${f.language})\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');
  }

  const tagsInMessage: string[] = currentMessage.match(/#[\w-]+/g) || [];
  const relevantKnowledge = knowledgeBase.filter(entry => 
    entry.tags.some(tag => tagsInMessage.includes(tag)) || 
    entry.tags.includes('#global')
  );

  const knowledgeContext = relevantKnowledge.length > 0 
    ? `\n\nRELEVANT KNOWLEDGE:\n${relevantKnowledge.map(k => `- [${k.tags.join(', ')}]: ${k.content}`).join('\n')}`
    : "";

  const plannerRole = roles.find(r => r.id === llmConfig.plannerRoleId) || roles[0];
  const coderRole = roles.find(r => r.id === llmConfig.coderRoleId) || roles[1];
  const todoContext = currentTodos.length > 0 
    ? `\nTO-DO LIST:\n${currentTodos.map(t => `- [${t.status}] ${t.task} (Phase: ${t.phase})`).join('\n')}`
    : "";

  // Handle context transfer if provided
  let contextTransferInfo = "";
  if (contextTransfer) {
    contextTransferInfo = `
CONTEXT TRANSFER:
- Previous Model: ${contextTransfer.sourceModel}
- Current Task: ${contextTransfer.currentTask}
- Completed Steps: ${contextTransfer.completedSteps.join(', ')}
- Pending Steps: ${contextTransfer.pendingSteps.join(', ')}
- Previous Context: ${contextTransfer.conversationContext}
    `.trim();
  }

  // --- STEP 1: PLANNER ---
  let plan = "";
  if (mode === 'FIX') {
    const plannerPrompt = `
${plannerRole.systemPrompt}
${knowledgeContext}
${todoContext}
${contextTransferInfo}

User Request: "${currentMessage}"
Active File: ${activeFile.name}
Project Structure: ${allFiles.map(f => f.name).join(', ')}

Analyze the request. Provide a concise execution plan.
    `;

    try {
      const plannerModel = llmConfig.plannerModelId || llmConfig.activeModelId;
      if (isGemini) {
        const res = await callGemini(plannerModel, [{ text: plannerPrompt }], apiKey!, false, false);
        plan = res.text || "";
      } else {
        const localConfig = isLocal ? getLocalProviderConfig('custom', baseUrl) : null;
        const customHeaders = localConfig?.customHeaders || {};

        const res = await callOpenAICompatible(
          baseUrl!, 
          apiKey!, 
          plannerModel, 
          [{role: 'user', content: plannerPrompt}], 
          false,
          customHeaders
        );
        plan = res.choices[0]?.message?.content || "";
      }
    } catch (e) {
      console.warn('Planner failed, proceeding directly:', e);
      plan = "Proceeding directly.";
    }
  }

  // --- STEP 2: EXECUTOR ---
  let activeAgentModel = llmConfig.chatModelId;
  if (mode === 'FIX') activeAgentModel = llmConfig.coderModelId;
  if (!activeAgentModel) activeAgentModel = llmConfig.activeModelId;

  let systemInstruction = "";

  if (mode === 'NORMAL') {
    systemInstruction = `
You are a helpful AI assistant. 
${knowledgeContext}
${contextTransferInfo}
    `;
  } else {
    systemInstruction = `
${coderRole.systemPrompt}
Task: ${mode === 'FIX' ? 'Execute the plan.' : 'Explain/Answer.'}

${mode === 'FIX' ? `PLAN:\n${plan}` : ''}

${fileContext}
${todoContext}
${knowledgeContext}
${contextTransferInfo}

USER REQUEST: ${currentMessage}

${mode === 'FIX' ? 'Use tools to apply changes.' : ''}
${usedCompression ? 'REMINDER: You are in Compressed Context mode. Use search_files or read_file to see code not listed above.' : ''}
    `;
  }

  try {
    let responseText = "";
    let toolCalls: ToolCall[] = [];
    const proposedChanges: FileDiff[] = [];

    const contentParts: any[] = [];

    if (attachments && attachments.length > 0 && isGemini) {
      attachments.forEach(att => {
        contentParts.push({ inlineData: { mimeType: att.mimeType, data: att.content } });
      });
    }

    contentParts.push({ text: currentMessage });

    let openAIMessages: any[] = [
      { role: 'system', content: systemInstruction },
    ];

    // Add recent history (last 4 messages to save tokens)
    history.slice(-4).forEach(h => {
      openAIMessages.push({ 
        role: h.role === 'model' ? 'assistant' : 'user', 
        content: h.content 
      });
    });

    if (!isGemini) {
      openAIMessages.push({ role: 'user', content: currentMessage });
    }

    const processToolCalls = (rawCalls: any[]) => {
      rawCalls.forEach((fc: any) => {
        const args = typeof fc.args === 'string' ? JSON.parse(fc.args) : fc.args;
        const toolCall: ToolCall = {
          id: 'call_' + Math.random().toString(36).substr(2, 9),
          name: fc.name,
          args: args
        };
        toolCalls.push(toolCall);

        // Handle Tool Logic Internally where possible
        if (toolCall.name === 'update_file') {
          const existingFile = allFiles.find(f => f.name === toolCall.args.name);
          if (existingFile) {
            proposedChanges.push({
              id: crypto.randomUUID(),
              fileName: toolCall.args.name,
              originalContent: existingFile.content,
              newContent: toolCall.args.content,
              type: 'update'
            });
          } else {
            responseText += `\n\nNote: File "${toolCall.args.name}" not found for update.`;
          }
        } else if (toolCall.name === 'create_file') {
          proposedChanges.push({
            id: crypto.randomUUID(),
            fileName: toolCall.args.name,
            originalContent: '',
            newContent: toolCall.args.content,
            type: 'create'
          });
        } else if (toolCall.name === 'search_files') {
          const results = performSearch(toolCall.args.query, allFiles);
          if (results.length > 0) {
            responseText += `\n\nSearch Results for '${toolCall.args.query}':\n` + 
              results.slice(0, 8).map(r => `- ${r.fileName}:${r.line} | ${r.content}`).join('\n');
          } else {
            responseText += `\n\nNo results found for '${toolCall.args.query}'`;
          }
        } else if (toolCall.name === 'read_file') {
          const f = allFiles.find(file => file.name === toolCall.args.fileName);
          if (f) {
            responseText += `\n\nContent of ${f.name}:\n\`\`\`${f.language}\n${f.content}\n\`\`\``;
          } else {
            responseText += `\n\nFile "${toolCall.args.fileName}" not found.`;
          }
        }
      });
    };

    if (isGemini) {
      const fullParts = [{ text: systemInstruction }, ...contentParts];
      const res = await callGemini(activeAgentModel, fullParts, apiKey!, true, useInternet);

      if (res.functionCalls && res.functionCalls.length > 0) {
        processToolCalls(res.functionCalls);
      }
      responseText = (res.text || "") + responseText;
    } else {
      const localConfig = isLocal ? getLocalProviderConfig('custom', baseUrl) : null;
      const customHeaders = localConfig?.customHeaders || {};

      const res = await callOpenAICompatible(
        baseUrl!, 
        apiKey!, 
        activeAgentModel, 
        openAIMessages, 
        true,
        customHeaders
      );

      const choice = res.choices[0];
      responseText = (choice.message?.content || "") + responseText;

      if (choice.message?.tool_calls) {
        const calls = choice.message.tool_calls.map((tc: any) => ({
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments)
        }));
        processToolCalls(calls);
      }
    }

    return {
      response: responseText.trim(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      proposedChanges: proposedChanges.length > 0 ? proposedChanges : undefined,
      contextSummarized: usedCompression
    };

  } catch (error: any) {
    console.error('LLM Error:', error);
    return { 
      response: "", 
      error: `AI Service Error: ${error.message}. Please check your API key and try again.` 
    };
  }
};

// Streaming version (updated with compression support)
export const streamFixCodeWithGemini = async (
  request: FixRequest,
  callbacks: StreamingCallbacks,
  signal?: AbortSignal
): Promise<void> => {
  const { 
    llmConfig, history, currentMessage, allFiles, activeFile, mode, attachments, 
    roles, knowledgeBase, useInternet, currentTodos, projectSummary, useCompression, contextTransfer 
  } = request;

  const isGemini = llmConfig.provider === 'gemini';
  const isLocal = llmConfig.provider === 'local';

  // Gemini doesn't support streaming with tools yet
  if (isGemini) {
    callbacks.onError('Streaming is not supported for Gemini with tools. Please disable streaming or use another provider.');
    return;
  }

  let apiKey = llmConfig.apiKey;
  let baseUrl = llmConfig.baseUrl;

  // Handle local provider configuration
  if (isLocal) {
    const localConfig = getLocalProviderConfig('custom', baseUrl);
    baseUrl = localConfig.baseUrl || baseUrl;

    if (localConfig.requiresAuth && !apiKey) {
      callbacks.onError(`API Key required for ${localConfig.name}`);
      return;
    }
  } else if (llmConfig.provider === 'openrouter') {
    baseUrl = 'https://openrouter.ai/api/v1';
  } else if (llmConfig.provider === 'openai') {
    baseUrl = baseUrl || 'https://api.openai.com/v1';
  }

  // Validate API key
  if ((llmConfig.provider === 'openai' || llmConfig.provider === 'openrouter') && !apiKey) {
    callbacks.onError("Missing API Key. Please configure it in settings.");
    return;
  }

  try {
    // Calculate Context Size and apply compression if needed
    const totalChars = allFiles.reduce((acc, f) => acc + f.content.length, 0);
    const shouldCompress = useCompression || (totalChars > LAZY_LOAD_THRESHOLD && !request.useHighCapacity);

    let fileContext = "";
    let usedCompression = false;

    if (shouldCompress && projectSummary) {
      // Use compressed context
      usedCompression = true;
      
      const compressionConfig = llmConfig.compression || {
        enabled: true,
        maxFiles: 15,
        maxFileSize: 50000,
        autoSummarize: true,
        preserveStructure: true
      };
      
      const relevantFiles = contextService.filterRelevantFiles(
        allFiles, 
        currentMessage, 
        activeFile, 
        compressionConfig
      );

      fileContext = `
COMPRESSED PROJECT CONTEXT:
${projectSummary.summary}

KEY FILES (${relevantFiles.length} of ${allFiles.length} files shown):
${relevantFiles.map(f => `- ${f.name} (${f.language})`).join('\n')}

ACTIVE FILE (Full Content):
File: ${activeFile.name}
\`\`\`${activeFile.language}
${activeFile.content}
\`\`\`

NOTE: You are seeing a compressed view. Use tools to read other files if needed.
      `.trim();
    } else if (shouldCompress) {
      // Lazy Load Mode
      usedCompression = true;
      fileContext = `
PROJECT FILE INDEX (Content Hidden to Save Tokens):
${allFiles.map(f => `- ${f.name} (${f.language})`).join('\n')}

ACTIVE FILE (Full Content):
File: ${activeFile.name}
\`\`\`${activeFile.language}
${activeFile.content}
\`\`\`

NOTE: You do not see the full content of other files. 
Use the 'read_file' tool to get the content of a specific file if needed.
Use 'search_files' to find specific code patterns.
      `;
    } else {
      // Full Context Mode
      fileContext = allFiles.map(f => `File: ${f.name} (${f.language})\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');
    }

    const tagsInMessage: string[] = currentMessage.match(/#[\w-]+/g) || [];
    const relevantKnowledge = knowledgeBase.filter(entry => 
      entry.tags.some(tag => tagsInMessage.includes(tag)) || 
      entry.tags.includes('#global')
    );

    const knowledgeContext = relevantKnowledge.length > 0 
      ? `\n\nRELEVANT KNOWLEDGE:\n${relevantKnowledge.map(k => `- [${k.tags.join(', ')}]: ${k.content}`).join('\n')}`
      : "";

    const plannerRole = roles.find(r => r.id === llmConfig.plannerRoleId) || roles[0];
    const coderRole = roles.find(r => r.id === llmConfig.coderRoleId) || roles[1];
    const todoContext = currentTodos.length > 0 
      ? `\nTO-DO LIST:\n${currentTodos.map(t => `- [${t.status}] ${t.task} (Phase: ${t.phase})`).join('\n')}`
      : "";

    // Handle context transfer if provided
    let contextTransferInfo = "";
    if (contextTransfer) {
      contextTransferInfo = `
CONTEXT TRANSFER:
- Previous Model: ${contextTransfer.sourceModel}
- Current Task: ${contextTransfer.currentTask}
- Completed Steps: ${contextTransfer.completedSteps.join(', ')}
- Pending Steps: ${contextTransfer.pendingSteps.join(', ')}
- Previous Context: ${contextTransfer.conversationContext}
      `.trim();
    }

    // --- STEP 1: PLANNER ---
    let plan = "";
    if (mode === 'FIX') {
      const plannerPrompt = `
${plannerRole.systemPrompt}
${knowledgeContext}
${todoContext}
${contextTransferInfo}

User Request: "${currentMessage}"
Active File: ${activeFile.name}
Project Structure: ${allFiles.map(f => f.name).join(', ')}

Analyze the request. Provide a concise execution plan.
      `;

      try {
        const plannerModel = llmConfig.plannerModelId || llmConfig.activeModelId;
        const localConfig = isLocal ? getLocalProviderConfig('custom', baseUrl) : null;
        const customHeaders = localConfig?.customHeaders || {};

        const res = await callOpenAICompatible(
          baseUrl!, 
          apiKey!, 
          plannerModel, 
          [{role: 'user', content: plannerPrompt}], 
          false,
          customHeaders,
          signal
        );
        plan = res.choices[0]?.message?.content || "";
      } catch (e) {
        console.warn('Planner failed, proceeding directly:', e);
        plan = "Proceeding directly.";
      }
    }

    // --- STEP 2: EXECUTOR ---
    let activeAgentModel = llmConfig.chatModelId;
    if (mode === 'FIX') activeAgentModel = llmConfig.coderModelId;
    if (!activeAgentModel) activeAgentModel = llmConfig.activeModelId;

    let systemInstruction = "";

    if (mode === 'NORMAL') {
      systemInstruction = `
You are a helpful AI assistant. 
${knowledgeContext}
${contextTransferInfo}
      `;
    } else {
      systemInstruction = `
${coderRole.systemPrompt}
Task: ${mode === 'FIX' ? 'Execute the plan.' : 'Explain/Answer.'}

${mode === 'FIX' ? `PLAN:\n${plan}` : ''}

${fileContext}
${todoContext}
${knowledgeContext}
${contextTransferInfo}

USER REQUEST: ${currentMessage}

${mode === 'FIX' ? 'Use tools to apply changes.' : ''}
${usedCompression ? 'REMINDER: You are in Compressed Context mode. Use search_files or read_file to see code not listed above.' : ''}
      `;
    }

    let openAIMessages: any[] = [
      { role: 'system', content: systemInstruction },
    ];

    // Add recent history (last 4 messages to save tokens)
    history.slice(-4).forEach(h => {
      openAIMessages.push({ 
        role: h.role === 'model' ? 'assistant' : 'user', 
        content: h.content 
      });
    });

    openAIMessages.push({ role: 'user', content: currentMessage });

    const localConfig = isLocal ? getLocalProviderConfig('custom', baseUrl) : null;
    const customHeaders = localConfig?.customHeaders || {};

    const fullContent = await callOpenAICompatibleStream(
      baseUrl!, 
      apiKey!, 
      activeAgentModel, 
      openAIMessages, 
      true,
      customHeaders,
      callbacks.onContent,
      undefined, // Tool calls not supported in streaming yet
      signal
    );

    callbacks.onComplete(fullContent);

  } catch (error: any) {
    if (error.name === 'AbortError') {
      return; // Silent abort
    }
    console.error('Streaming LLM Error:', error);
    callbacks.onError(`AI Service Error: ${error.message}. Please check your API key and try again.`);
  }
};