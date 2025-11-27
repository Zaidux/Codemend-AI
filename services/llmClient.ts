import { GoogleGenAI } from "@google/genai";
import { GEMINI_TOOL_DEFINITIONS, OPENAI_TOOL_DEFINITIONS } from './llmTools';

export const callGemini = async (model: string, parts: any[], apiKey: string, tools: boolean = false, useInternet: boolean = false): Promise<any> => {
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

export const callOpenAICompatible = async (
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
      const errorText = await response.text();
      let errorMessage = `API Error ${response.status}: ${errorText}`;
      if (response.status === 401) errorMessage = 'Invalid API Key.';
      if (response.status === 429) errorMessage = 'Rate limit exceeded.';
      if (response.status === 404) errorMessage = 'Model not found.';
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    console.error('OpenAI API Error:', error);
    throw new Error(`API Error: ${error.message}`);
  }
};

// Streaming version
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
              }
            } catch (e) {
              // Ignore partial JSON parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Ensure we return the full content
    return fullContent;
  } catch (error: any) {
    if (error.name === 'AbortError') throw error;
    console.error('OpenAI Stream Error:', error);
    throw new Error(`Stream Error: ${error.message}`);
  }
};