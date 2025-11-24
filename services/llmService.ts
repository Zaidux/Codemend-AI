
import { GoogleGenAI, Type } from "@google/genai";
import { FixRequest, FixResponse, ToolCall, LLMConfig, Attachment, KnowledgeEntry, FileDiff, TodoItem, ProjectFile, SearchResult } from '../types';

// --- TOOL DEFINITIONS ---

const TOOL_DEFINITIONS = [
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

// --- HELPERS ---

// Token estimator (rough char count / 4)
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

// Threshold where we switch from "Full Context" to "Lazy Loading"
const LAZY_LOAD_THRESHOLD = 30000; // ~7500 tokens

// --- API CLIENTS ---

const callGemini = async (model: string, parts: any[], apiKey: string, tools: boolean = false, useInternet: boolean = false): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey });
  const config: any = {
    thinkingConfig: { thinkingBudget: 0 }
  };
  
  const activeTools: any[] = [];
  
  if (tools) {
    activeTools.push({ functionDeclarations: TOOL_DEFINITIONS });
  }
  
  if (useInternet) {
    activeTools.push({ googleSearch: {} });
  }

  if (activeTools.length > 0) {
    config.tools = activeTools;
  }

  const response = await ai.models.generateContent({
    model: model,
    contents: { parts: parts } as any,
    config
  });

  return response;
};

const callOpenAICompatible = async (
  baseUrl: string, 
  apiKey: string, 
  model: string, 
  messages: any[], 
  tools: boolean = false
): Promise<any> => {
  const body: any = {
    model: model,
    messages: messages,
    temperature: 0.1,
  };

  if (tools) {
    body.tools = TOOL_DEFINITIONS.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://codemend.ai',
      'X-Title': 'CodeMend AI'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API Error ${response.status}: ${err}`);
  }

  return await response.json();
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

// --- ORCHESTRATOR ---

export const fixCodeWithGemini = async (request: FixRequest): Promise<FixResponse> => {
  const { llmConfig, history, currentMessage, allFiles, activeFile, mode, attachments, roles, knowledgeBase, useInternet, currentTodos } = request;

  const isGemini = llmConfig.provider === 'gemini';
  const apiKey = llmConfig.apiKey || (isGemini ? process.env.API_KEY : '');
  const baseUrl = llmConfig.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : (llmConfig.baseUrl || 'https://api.openai.com/v1');

  if (!apiKey) {
    return { response: "", error: "Missing API Key. Please configure it in settings." };
  }

  // Calculate Context Size
  const totalChars = allFiles.reduce((acc, f) => acc + f.content.length, 0);
  const useLazyLoading = totalChars > LAZY_LOAD_THRESHOLD && !request.useHighCapacity;

  // Build File Context
  let fileContext = "";
  
  if (useLazyLoading) {
      // Lazy Load Mode: Send only file names and the active file
      fileContext = `
        **PROJECT FILE INDEX (Content Hidden to Save Tokens):**
        ${allFiles.map(f => `- ${f.name} (${f.language})`).join('\n')}

        **ACTIVE FILE (Full Content):**
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
      ? `\n\n**RELEVANT KNOWLEDGE:**\n${relevantKnowledge.map(k => `- [${k.tags.join(', ')}]: ${k.content}`).join('\n')}`
      : "";

  const plannerRole = roles.find(r => r.id === llmConfig.plannerRoleId) || roles[0];
  const coderRole = roles.find(r => r.id === llmConfig.coderRoleId) || roles[1];
  const todoContext = currentTodos.length > 0 
      ? `\n**TO-DO LIST:**\n${currentTodos.map(t => `- [${t.status}] ${t.task} (Phase: ${t.phase})`).join('\n')}`
      : "";

  // --- STEP 1: PLANNER ---
  let plan = "";
  if (mode === 'FIX') {
    const plannerPrompt = `
      ${plannerRole.systemPrompt}
      ${knowledgeContext}
      ${todoContext}
      
      User Request: "${currentMessage}"
      Active File: ${activeFile.name}
      Project Structure: ${allFiles.map(f => f.name).join(', ')}

      Analyze the request. Provide a concise execution plan.
    `;
    
    try {
      const plannerModel = llmConfig.plannerModelId || llmConfig.activeModelId;
      if (isGemini) {
        const res = await callGemini(plannerModel, [{ text: plannerPrompt }], apiKey, true, false); 
        plan = res.text || "";
      } else {
        const res = await callOpenAICompatible(baseUrl, apiKey, plannerModel, [{role: 'user', content: plannerPrompt}], true);
        plan = res.choices[0]?.message?.content || "";
      }
    } catch (e) {
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
      `;
  } else {
      systemInstruction = `
        ${coderRole.systemPrompt}
        Task: ${mode === 'FIX' ? 'Execute the plan.' : 'Explain/Answer.'}
        
        ${mode === 'FIX' ? `**PLAN:**\n${plan}` : ''}

        ${fileContext}
        ${todoContext}
        ${knowledgeContext}

        **USER REQUEST:** ${currentMessage}

        ${mode === 'FIX' ? 'Use tools to apply changes.' : ''}
        ${useLazyLoading ? 'REMINDER: You are in Low-Token mode. Use search_files or read_file to see code not listed above.' : ''}
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
    
    history.slice(-6).forEach(h => {
        openAIMessages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content });
    });

    if (!isGemini) {
        openAIMessages.push({ role: 'user', content: contentParts[0].text }); // Simplification for brevity
    }

    const processToolCalls = (rawCalls: any[]) => {
        rawCalls.forEach((fc: any) => {
             const args = fc.args; 
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
                 // We append this to the response text so the user sees it, 
                 // and typically we'd feed it back to the model in a second turn, 
                 // but for this single-turn implementation, we display it.
                 responseText += `\n\n**Search Results for '${toolCall.args.query}':**\n` + results.map(r => `- ${r.fileName}:${r.line} | ${r.content}`).slice(0, 5).join('\n');
             } else if (toolCall.name === 'read_file') {
                 const f = allFiles.find(file => file.name === toolCall.args.fileName);
                 if(f) {
                     responseText += `\n\n**Content of ${f.name}:**\n\`\`\`${f.language}\n${f.content}\n\`\`\``;
                 } else {
                     responseText += `\n\nFile ${toolCall.args.fileName} not found.`;
                 }
             }
        });
    };

    if (isGemini) {
      const fullParts = [{ text: systemInstruction }, ...contentParts];
      const res = await callGemini(activeAgentModel, fullParts as any, apiKey, true, useInternet);
      if (res.functionCalls) processToolCalls(res.functionCalls);
      responseText = (res.text || "") + responseText; // Append local tool results
    } else {
      const res = await callOpenAICompatible(baseUrl, apiKey, activeAgentModel, openAIMessages, true);
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
      response: mode === 'FIX' && plan ? `**Plan:**\n${plan}\n\n---\n\n${responseText}` : responseText,
      toolCalls,
      proposedChanges,
      contextSummarized: false
    };

  } catch (error: any) {
    return { response: "", error: error.message };
  }
};
