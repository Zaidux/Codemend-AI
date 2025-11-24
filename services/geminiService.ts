
import { GoogleGenAI } from "@google/genai";
import { FixRequest, FixResponse, ChatMessage } from '../types';
import { CONTEXT_THRESHOLD_CHARS } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Function to compress history into a summary
const summarizeHistory = async (history: ChatMessage[], language: string): Promise<string> => {
  try {
    const transcript = history.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    
    const prompt = `
      You are a specialized system optimizer.
      Read the following technical conversation regarding ${language} code.
      Create a concise but technically accurate summary of the problems discussed, solutions proposed, and key decisions made.
      This summary will be used to prime your future self so you can forget the raw message history.
      
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
      // Logic: Summarize everything except the last 2 messages (to keep flow)
      const messagesToSummarize = request.history.slice(0, -2);
      const recentMessages = request.history.slice(-2);
      
      const summary = await summarizeHistory(messagesToSummarize, request.language);
      
      // We inject a "System Memory" message
      const systemMessage: ChatMessage = {
        id: 'system-summary',
        role: 'model',
        content: `**SYSTEM NOTIFICATION:** *Memory Optimization Triggered.*\n\n**Previous Session Summary:**\n${summary}\n\n*The model has reset its context window using this summary to maintain performance.*`,
        timestamp: Date.now()
      };
      
      finalHistory = [systemMessage, ...recentMessages];
      contextSummarized = true;
    }

    // 2. Build the current prompt
    const historyContext = finalHistory.map(msg => 
      `${msg.role === 'user' ? 'User' : 'Model'}: ${msg.content}`
    ).join('\n\n');

    let systemPrompt = '';
    
    if (request.mode === 'EXPLAIN') {
      systemPrompt = `
        You are an expert senior software engineer and technical educator.
        Focus: EXPLAINING code and logs.
        
        Context - The User is working on this code in ${request.language}:
        \`\`\`${request.language}
        ${request.code}
        \`\`\`
        
        Chat History:
        ${historyContext}
        
        Current User Request: "${request.currentMessage}"

        Instructions:
        1. Answer the user's request based on the code provided.
        2. Use Markdown formatting (bolding, lists, code blocks).
        3. Be educational and clear.
      `;
    } else {
      systemPrompt = `
        You are an expert senior software engineer.
        Focus: FIXING and OPTIMIZING code.
        
        Context - The User is working on this code in ${request.language}:
        \`\`\`${request.language}
        ${request.code}
        \`\`\`
        
        Chat History:
        ${historyContext}
        
        Current User Request: "${request.currentMessage}"

        Instructions:
        1. Provide the fixed code or answer the technical question.
        2. If providing code, explain *why* changes were made.
        3. Use Markdown.
      `;
    }

    const config: any = {
       thinkingConfig: { thinkingBudget: 0 }
    };

    if (request.useHighCapacity) {
      config.maxOutputTokens = 65536; 
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
      config: config
    });

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
