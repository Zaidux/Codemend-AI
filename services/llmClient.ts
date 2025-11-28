import { GoogleGenAI } from "@google/genai";
import { GEMINI_TOOL_DEFINITIONS, OPENAI_TOOL_DEFINITIONS, ToolUsageLogger } from './llmTools';

// Helper for Exponential Backoff Retry
const attemptWithRetry = async <T>(
  fn: () => Promise<T>, 
  retries = 3, 
  delay = 1000
): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (retries <= 0) throw error;
    // Retry on Rate Limit (429) or Server Error (5xx)
    const isRetryable = error.message.includes('429') || error.message.includes('50') || error.message.includes('fetch failed');
    if (!isRetryable) throw error;

    console.warn(`⚠️ Request failed. Retrying in ${delay}ms... (${retries} left)`);
    await new Promise(r => setTimeout(r, delay));
    return attemptWithRetry(fn, retries - 1, delay * 2);
  }
};

export const callGemini = async (
  model: string, 
  parts: any[], 
  apiKey: string, 
  tools: boolean = false, 
  useInternet: boolean = false
): Promise<any> => {
  return attemptWithRetry(async () => {
    const ai = new GoogleGenAI({ apiKey });
    const logger = ToolUsageLogger.getInstance();
    
    // Configurable thinking budget could be passed here in future
    const config: any = {
      thinkingConfig: { thinkingBudget: 2 } 
    };

    const activeTools: any[] = [];
    if (tools) activeTools.push({ functionDeclarations: GEMINI_TOOL_DEFINITIONS });
    if (useInternet) activeTools.push({ googleSearch: {} }); // Grounding

    if (activeTools.length > 0) config.tools = activeTools;

    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: { parts: parts } as any,
        config
      });

      // Log tool usage
      if (response.functionCalls && response.functionCalls.length > 0) {
        response.functionCalls.forEach((call: any) => logger.logToolCall(call.name, true));
      }

      return response;
    } catch (error: any) {
      console.error('Gemini API Error:', error);
      logger.logToolCall('gemini_api_call', false, error.message);
      throw new Error(`Gemini API Error: ${error.message}`);
    }
  });
};

// NEW: Gemini Streaming Support
export const callGeminiStream = async (
  model: string,
  parts: any[],
  apiKey: string,
  tools: boolean = false,
  onContent: (content: string) => void,
  onToolCall?: (toolCalls: any[]) => void
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  const config: any = {};
  
  const activeTools: any[] = [];
  if (tools) activeTools.push({ functionDeclarations: GEMINI_TOOL_DEFINITIONS });
  if (activeTools.length > 0) config.tools = activeTools;

  try {
    const result = await ai.models.generateContentStream({
      model,
      contents: { parts } as any,
      config
    });

    let fullText = "";

    for await (const chunk of result.stream) {
      // 1. Handle Text
      const text = chunk.text();
      if (text) {
        fullText += text;
        onContent(text);
      }

      // 2. Handle Function Calls in Stream
      // Note: Google SDK usually sends function calls at the end or in a specific chunk type
      const calls = chunk.functionCalls(); 
      if (calls && calls.length > 0 && onToolCall) {
        // Map Google's structure to a generic structure
        const mappedCalls = calls.map((c: any) => ({
          name: c.name,
          args: JSON.stringify(c.args) // Normalize args to string for consistency
        }));
        onToolCall(mappedCalls);
      }
    }
    return fullText;
  } catch (error: any) {
    console.error("Gemini Stream Error:", error);
    throw error;
  }
};

export const callOpenAICompatible = async (
  baseUrl: string, 
  apiKey: string, 
  model: string, 
  messages: any[], 
  tools: boolean = false,
  customHeaders: Record<string, string> = {},
  signal?: AbortSignal
): Promise<any> => {
  return attemptWithRetry(async () => {
    const logger = ToolUsageLogger.getInstance();
    const body: any = {
      model,
      messages,
      temperature: 0.2, // Slightly higher for creativity but still focused
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

    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    if (baseUrl.includes('openrouter.ai')) {
      headers['HTTP-Referer'] = 'https://codemend.ai';
      headers['X-Title'] = 'CodeMend AI';
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // Log tools
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (toolCalls?.length) {
      toolCalls.forEach((call: any) => logger.logToolCall(call.function.name, true));
    }

    return data;
  });
};

export const callOpenAICompatibleStream = async (
  baseUrl: string, 
  apiKey: string, 
  model: string, 
  messages: any[], 
  tools: boolean = false,
  customHeaders: Record<string, string> = {},
  onContent: (content: string) => void,
  onToolCall?: (toolCallChunks: any[]) => void,
  signal?: AbortSignal
): Promise<string> => {
  const logger = ToolUsageLogger.getInstance();
  const body: any = {
    model,
    messages,
    temperature: 0.1,
    stream: true,
  };

  if (tools) {
    body.tools = OPENAI_TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  const headers: HeadersInit = { 'Content-Type': 'application/json', ...customHeaders };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
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

    if (!response.ok) throw new Error(await response.text());
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = ''; // Buffer for incomplete chunks
    const completedToolCalls = new Set<string>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // Append new chunk to buffer and split by double newline or data prefix
      buffer += chunk;
      
      const lines = buffer.split('\n');
      // Keep the last line in buffer if it's incomplete
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        if (trimmed.includes('[DONE]')) continue;

        try {
          const jsonStr = trimmed.slice(6);
          const data = JSON.parse(jsonStr);

          // 1. Content Handling
          const content = data.choices[0]?.delta?.content;
          if (content) {
            fullContent += content;
            onContent(content);
          }

          // 2. Tool Handling
          const toolCalls = data.choices[0]?.delta?.tool_calls;
          if (toolCalls && onToolCall) {
            onToolCall(toolCalls);
            // Logging
            toolCalls.forEach((tc: any) => {
              if (tc.function?.name && !completedToolCalls.has(tc.index)) {
                logger.logToolCall(tc.function.name, true);
                completedToolCalls.add(tc.index);
              }
            });
          }
        } catch (e) {
          // If JSON parse fails, it might be a split chunk. 
          // In a more advanced implementation, we would add this line back to buffer.
          // For now, we ignore minor glitches common in local models.
        }
      }
    }

    return fullContent;
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    logger.logToolCall('openai_stream_call', false, error.message);
    return ""; // Return empty on hard fail
  }
};