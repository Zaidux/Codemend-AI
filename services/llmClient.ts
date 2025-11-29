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
      const text = chunk.text();
      if (text) {
        fullText += text;
        onContent(text);
      }

      const calls = chunk.functionCalls(); 
      if (calls && calls.length > 0 && onToolCall) {
        const mappedCalls = calls.map((c: any) => ({
          name: c.name,
          args: JSON.stringify(c.args) 
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
      temperature: 0.2, 
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
    let buffer = ''; 
    const completedToolCalls = new Set<string>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split('\n');
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
          // Ignore parse errors from partial chunks
        }
      }
    }

    return fullContent;
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    logger.logToolCall('openai_stream_call', false, error.message);
    return ""; 
  }
};