import { GoogleGenAI } from "@google/genai";
import { GEMINI_TOOL_DEFINITIONS, OPENAI_TOOL_DEFINITIONS, ToolUsageLogger } from './llmTools';

export const callGemini = async (
  model: string, 
  parts: any[], 
  apiKey: string, 
  tools: boolean = false, 
  useInternet: boolean = false
): Promise<any> => {
  const ai = new GoogleGenAI({ apiKey });
  const logger = ToolUsageLogger.getInstance();
  const config: any = {
    thinkingConfig: { thinkingBudget: 1 } // Increased for better tool usage
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

    // Log tool usage
    if (response.functionCalls && response.functionCalls.length > 0) {
      response.functionCalls.forEach((call: any) => {
        logger.logToolCall(call.name, true);
      });
    }

    return response;
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    logger.logToolCall('gemini_api_call', false, error.message);
    throw new Error(`Gemini API Error: ${error.message}`);
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
  const logger = ToolUsageLogger.getInstance();
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
      const errorText = await response.text();
      let errorMessage = `API Error ${response.status}: ${errorText}`;
      if (response.status === 401) errorMessage = 'Invalid API Key.';
      if (response.status === 429) errorMessage = 'Rate limit exceeded.';
      if (response.status === 404) errorMessage = 'Model not found.';
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Log tool usage
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      toolCalls.forEach((call: any) => {
        logger.logToolCall(call.function.name, true);
      });
    }

    return data;
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    console.error('OpenAI API Error:', error);
    logger.logToolCall('openai_api_call', false, error.message);
    throw new Error(`API Error: ${error.message}`);
  }
};

// Enhanced streaming version with better tool handling
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
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    let fullContent = '';
    const decoder = new TextDecoder();

    // Timeout logic for stalled streams
    const STREAM_TIMEOUT_MS = 30000;
    let lastActivity = Date.now();

    const timeoutInterval = setInterval(() => {
      if (Date.now() - lastActivity > STREAM_TIMEOUT_MS) {
        console.warn('Stream timed out due to inactivity');
        reader.cancel('Timeout');
        clearInterval(timeoutInterval);
      }
    }, 5000);

    // Track tool calls for logging
    const completedToolCalls = new Set<string>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        lastActivity = Date.now();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ') && !line.includes('data: [DONE]')) {
            try {
              const data = JSON.parse(line.slice(6));

              // Handle content
              const content = data.choices[0]?.delta?.content;
              if (content) {
                fullContent += content;
                onContent(content);
              }

              // Handle tool calls in streaming
              const toolCalls = data.choices[0]?.delta?.tool_calls;
              if (toolCalls && onToolCall) {
                onToolCall(toolCalls);
                
                // Log completed tool calls
                toolCalls.forEach((chunk: any) => {
                  if (chunk.function?.name && !completedToolCalls.has(chunk.index)) {
                    logger.logToolCall(chunk.function.name, true);
                    completedToolCalls.add(chunk.index);
                  }
                });
              }
            } catch (e) {
              // Ignore partial JSON parse errors
            }
          }
        }
      }
    } finally {
      clearInterval(timeoutInterval);
      reader.releaseLock();
    }

    return fullContent;
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    console.error('OpenAI Stream Error:', error);
    logger.logToolCall('openai_stream_call', false, error.message);
    return fullContent; // Return what we have so far
  }
};