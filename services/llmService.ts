
import { GoogleGenAI, Type } from "@google/genai";
import { FixRequest, FixResponse, ToolCall, LLMConfig, Attachment, KnowledgeEntry } from '../types';

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
    description: 'Update the content of an existing file.',
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
    description: 'Save a learned concept, pattern, or preference to the knowledge base for future reference.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Tags to retrieve this info later (e.g., #auth, #react-pattern)' },
        content: { type: Type.STRING, description: 'The knowledge or pattern to save.' }
      },
      required: ['tags', 'content']
    }
  }
];

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

// --- ORCHESTRATOR ---

export const fixCodeWithGemini = async (request: FixRequest): Promise<FixResponse> => {
  const { llmConfig, history, currentMessage, allFiles, activeFile, mode, attachments, roles, knowledgeBase, useInternet } = request;

  const isGemini = llmConfig.provider === 'gemini';
  const apiKey = llmConfig.apiKey || (isGemini ? process.env.API_KEY : '');
  const baseUrl = llmConfig.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : (llmConfig.baseUrl || 'https://api.openai.com/v1');

  if (!apiKey) {
    return { response: "", error: "Missing API Key. Please configure it in settings." };
  }

  // --- KNOWLEDGE RETRIEVAL ---
  const tagsInMessage: string[] = currentMessage.match(/#[\w-]+/g) || [];
  const relevantKnowledge = knowledgeBase.filter(entry => 
      entry.tags.some(tag => tagsInMessage.includes(tag)) || 
      entry.tags.includes('#global')
  );
  
  const knowledgeContext = relevantKnowledge.length > 0 
      ? `\n\n**RELEVANT KNOWLEDGE / LEARNED PATTERNS:**\n${relevantKnowledge.map(k => `- [${k.tags.join(', ')}]: ${k.content}`).join('\n')}`
      : "";

  const plannerRole = roles.find(r => r.id === llmConfig.plannerRoleId) || roles[0];
  const coderRole = roles.find(r => r.id === llmConfig.coderRoleId) || roles[1];

  // --- STEP 1: PLANNER (FIX Mode Only) ---
  let plan = "";
  if (mode === 'FIX') {
    const plannerPrompt = `
      ${plannerRole.systemPrompt}
      ${knowledgeContext}
      
      User Request: "${currentMessage}"
      Active File: ${activeFile.name}
      Project Files: ${allFiles.map(f => f.name).join(', ')}
    `;
    
    try {
      if (isGemini) {
        const res = await callGemini(llmConfig.activeModelId, [{ text: plannerPrompt }], apiKey, false, false);
        plan = res.text || "";
      } else {
        const res = await callOpenAICompatible(baseUrl, apiKey, llmConfig.activeModelId, [{role: 'user', content: plannerPrompt}]);
        plan = res.choices[0]?.message?.content || "";
      }
    } catch (e: any) {
      console.warn("Planner failed, proceeding directly.", e);
      plan = "Proceeding with direct implementation.";
    }
  }

  // --- STEP 2: EXECUTOR / CHAT ---
  
  const fileContext = allFiles.map(f => `File: ${f.name} (${f.language})\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');
  
  let systemInstruction = "";

  if (mode === 'NORMAL') {
      systemInstruction = `
        You are a helpful, intelligent AI assistant. 
        You have access to the internet if requested (Grounding).
        You can also learn from the user by using the 'save_knowledge' tool when you encounter new preferences or facts worth remembering.
        
        ${knowledgeContext}

        Current Date: ${new Date().toLocaleDateString()}
      `;
  } else {
      systemInstruction = `
        ${coderRole.systemPrompt}
        Task: ${mode === 'FIX' ? 'Execute the following plan to fix/improve the code.' : 'Explain the code or answer the question.'}
        
        ${mode === 'FIX' ? `**ARCHITECT PLAN:**\n${plan}` : ''}

        **PROJECT FILES:**
        ${fileContext}
        
        ${knowledgeContext}

        **USER REQUEST:** ${currentMessage}

        ${mode === 'FIX' ? 'Use the available tools (create_file, update_file) to apply changes.' : ''}
        You can also use 'save_knowledge' if the user explicitly teaches you a pattern or preference.
      `;
  }

  try {
    let responseText = "";
    let toolCalls: ToolCall[] = [];

    const contentParts: any[] = [];
    
    if (attachments && attachments.length > 0 && isGemini) {
       attachments.forEach(att => {
          contentParts.push({
             inlineData: {
                mimeType: att.mimeType,
                data: att.content
             }
          });
       });
    }
    
    contentParts.push({ text: mode === 'FIX' ? `Execute this request based on the plan.` : currentMessage });
    
    let openAIMessages: any[] = [
      { role: 'system', content: systemInstruction },
    ];
    
    history.slice(-6).forEach(h => {
        openAIMessages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content });
    });

    if (!isGemini) {
        const userContent: any[] = [{ type: 'text', text: currentMessage }];
        if (attachments) {
            attachments.forEach(att => {
                if(att.type === 'image') {
                    userContent.push({
                        type: 'image_url',
                        image_url: { url: `data:${att.mimeType};base64,${att.content}` }
                    });
                }
            });
        }
        openAIMessages.push({ role: 'user', content: userContent });
    }

    if (isGemini) {
      const fullParts = [{ text: systemInstruction }, ...contentParts];
      // Use internet only if requested and model is gemini (supports search tool)
      const res = await callGemini(llmConfig.activeModelId, fullParts as any, apiKey, true, useInternet);
      
      if (res.functionCalls) {
        res.functionCalls.forEach((fc: any) => {
          toolCalls.push({
             id: 'call_' + Math.random().toString(36).substr(2, 9),
             name: fc.name,
             args: fc.args
          });
        });
      }
      
      // Grounding Metadata handling
      let groundingText = "";
      if (res.candidates?.[0]?.groundingMetadata?.groundingChunks) {
          const chunks = res.candidates[0].groundingMetadata.groundingChunks;
          const links = chunks
            .map((c: any) => c.web?.uri ? `[${c.web.title || 'Source'}](${c.web.uri})` : null)
            .filter(Boolean)
            .join('  ');
          if (links) groundingText = `\n\n**Sources:** ${links}`;
      }

      responseText = (res.text || (toolCalls.length > 0 ? `Executing operations...` : "No response.")) + groundingText;

    } else {
      const res = await callOpenAICompatible(baseUrl, apiKey, llmConfig.activeModelId, openAIMessages, true);
      const choice = res.choices[0];
      responseText = choice.message?.content || "";

      if (choice.message?.tool_calls) {
        choice.message.tool_calls.forEach((tc: any) => {
           toolCalls.push({
             id: tc.id,
             name: tc.function.name,
             args: JSON.parse(tc.function.arguments)
           });
        });
        if (!responseText) responseText = "Executing tool operations...";
      }
    }

    return {
      response: mode === 'FIX' && plan ? `**Plan:**\n${plan}\n\n---\n\n${responseText}` : responseText,
      toolCalls,
      contextSummarized: false
    };

  } catch (error: any) {
    console.error("LLM Service Error:", error);
    return {
      response: "",
      error: error.message || "An unexpected error occurred in the LLM service."
    };
  }
};
