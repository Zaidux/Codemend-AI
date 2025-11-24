
import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { FixRequest, FixResponse, ChatMessage, ToolCall } from '../types';
import { CONTEXT_THRESHOLD_CHARS } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- TOOL DEFINITIONS ---

const createFileTool: FunctionDeclaration = {
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
};

const updateFileTool: FunctionDeclaration = {
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
};

// --- LOGIC ---

// Function to compress history into a summary
const summarizeHistory = async (history: ChatMessage[], language: string): Promise<string> => {
  try {
    const transcript = history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    
    const prompt = `
      You are a specialized system optimizer.
      Read the following technical conversation.
      Create a concise but technically accurate summary of the problems discussed, solutions proposed, and key decisions made.
      
      Conversation:
      ${transcript}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "Summary unavailable.";
  } catch (e) {
    console.error("Summarization failed", e);
    return "Previous context was too long to summarize effectively. Continuing with partial context.";
  }
};

export const fixCodeWithGemini = async (request: FixRequest): Promise<FixResponse> => {
  try {
    let finalHistory = request.history;
    let contextSummarized = false;

    // 1. Check if we need to optimize context (Smart Reset)
    const historyCharCount = JSON.stringify(request.history).length;
    
    if (historyCharCount > CONTEXT_THRESHOLD_CHARS) {
      const messagesToSummarize = request.history.slice(0, -2);
      const recentMessages = request.history.slice(-2);
      const summary = await summarizeHistory(messagesToSummarize, request.activeFile.language);
      
      const systemMessage: ChatMessage = {
        id: 'system-summary',
        role: 'model',
        content: `**SYSTEM NOTIFICATION:** *Memory Optimization Triggered.*\n\n**Previous Session Summary:**\n${summary}`,
        timestamp: Date.now()
      };
      
      finalHistory = [systemMessage, ...recentMessages];
      contextSummarized = true;
    }

    // 2. Build the Context
    const fileList = request.allFiles.map(f => `- ${f.name} (${f.language})`).join('\n');
    const otherFilesContext = request.allFiles
      .filter(f => f.id !== request.activeFile.id)
      .map(f => `File: ${f.name}\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
      .join('\n\n');

    const historyContext = finalHistory.map(msg => 
      msg.isToolCall 
        ? `System Tool Execution: ${msg.content}`
        : `${msg.role === 'user' ? 'User' : 'Model'}: ${msg.content}`
    ).join('\n\n');

    const modePrompt = request.mode === 'EXPLAIN' 
      ? "Focus: EXPLAINING code and logs. Be educational." 
      : "Focus: FIXING and OPTIMIZING code. You can create/update files if needed.";

    const systemPrompt = `
      You are an expert senior software engineer and technical educator.
      ${modePrompt}
      
      **Project Context:**
      You have access to a virtual file system.
      Current Active File: '${request.activeFile.name}'
      
      **Active File Content:**
      \`\`\`${request.activeFile.language}
      ${request.activeFile.content}
      \`\`\`

      **Other Files in Project:**
      ${fileList}
      ${otherFilesContext}
      
      **Chat History:**
      ${historyContext}
      
      **Current User Request:** "${request.currentMessage}"

      Instructions:
      1. Address the user's request.
      2. If you need to fix code or create new modules, USE THE AVAILABLE TOOLS (update_file, create_file).
      3. Do not ask for permission to fix it, just use the tools to perform the fix, then explain what you did.
      4. Use Markdown for text responses.
    `;

    const config: any = {
       thinkingConfig: { thinkingBudget: 0 },
       tools: [{ functionDeclarations: [createFileTool, updateFileTool] }]
    };

    if (request.useHighCapacity) {
      config.maxOutputTokens = 65536; 
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
      config: config
    });

    // Check for function calls
    const toolCalls: ToolCall[] = [];
    
    // The SDK returns tool calls in response.functionCalls
    if (response.functionCalls && response.functionCalls.length > 0) {
       response.functionCalls.forEach(fc => {
         toolCalls.push({
           id: 'call_' + Math.random().toString(36).substr(2, 9), // Gemini 2.5 flash might not return IDs, generate one
           name: fc.name,
           args: fc.args
         });
       });
       
       // If tools are called, the text might be empty or instructional. 
       // We return the tools so the App can execute them.
       return {
         response: response.text || "Executing file operations...",
         toolCalls,
         contextSummarized
       };
    }

    const text = response.text;

    if (!text) {
      throw new Error("No response received from Gemini.");
    }

    return {
      response: text,
      contextSummarized
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      response: "",
      error: error instanceof Error ? error.message : "An unexpected error occurred."
    };
  }
};
