import { Type } from "@google/genai";

// Universal tool definitions that work across all AI providers
export const UNIVERSAL_TOOL_DEFINITIONS = {
  create_file: {
    name: 'create_file',
    description: 'Create a new file in the project workspace. USE THIS WHEN USER ASKS TO CREATE A FILE.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'The name of the file (e.g., utils.js, styles.css)' },
        content: { type: Type.STRING, description: 'The full content of the file' },
        language: { type: Type.STRING, description: 'The programming language of the file' }
      },
      required: ['name', 'content']
    }
  },
  update_file: {
    name: 'update_file',
    description: 'Update the content of an existing file. USE THIS WHEN USER ASKS TO MODIFY, FIX, OR UPDATE CODE.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'The name of the file to update' },
        content: { type: Type.STRING, description: 'The new full content of the file' }
      },
      required: ['name', 'content']
    }
  },
  search_files: {
    name: 'search_files',
    description: 'Search for a string or pattern across all files in the project.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'The string or pattern to search for' }
      },
      required: ['query']
    }
  },
  read_file: {
    name: 'read_file',
    description: 'Read the full content of a specific file.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'The name of the file to read' }
      },
      required: ['fileName']
    }
  },
  save_knowledge: {
    name: 'save_knowledge',
    description: 'Save important information, patterns, or learnings for future reference.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Tags to categorize this knowledge' },
        content: { type: Type.STRING, description: 'The knowledge content to save' }
      },
      required: ['tags', 'content']
    }
  },
  manage_tasks: {
    name: 'manage_tasks',
    description: 'Manage the project task list.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['add', 'update', 'complete', 'delete'], description: 'The action to perform' },
        task: { type: Type.STRING, description: 'The task description' },
        phase: { type: Type.STRING, description: 'The project phase' },
        taskId: { type: Type.STRING, description: 'The ID of the task to update/delete' },
        status: { type: Type.STRING, enum: ['pending', 'in_progress', 'completed'], description: 'Task status' }
      },
      required: ['action']
    }
  }
};

// Gemini-compatible tool definitions
export const GEMINI_TOOL_DEFINITIONS = Object.values(UNIVERSAL_TOOL_DEFINITIONS).map(tool => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters
}));

// OpenAI-compatible tool definitions
export const OPENAI_TOOL_DEFINITIONS = Object.values(UNIVERSAL_TOOL_DEFINITIONS).map(tool => ({
  type: 'function' as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }
}));

// Tool usage tracking and logging
export class ToolUsageLogger {
  private static instance: ToolUsageLogger;
  private toolCalls: Array<{timestamp: Date; tool: string; success: boolean; error?: string}> = [];

  static getInstance(): ToolUsageLogger {
    if (!ToolUsageLogger.instance) {
      ToolUsageLogger.instance = new ToolUsageLogger();
    }
    return ToolUsageLogger.instance;
  }

  logToolCall(tool: string, success: boolean, error?: string) {
    const call = { timestamp: new Date(), tool, success, error };
    this.toolCalls.push(call);
    console.log(`🔧 TOOL ${success ? 'SUCCESS' : 'FAILED'}: ${tool}`, error || '');
    
    // Keep only last 100 calls
    if (this.toolCalls.length > 100) {
      this.toolCalls = this.toolCalls.slice(-100);
    }
  }

  getRecentToolCalls() {
    return [...this.toolCalls];
  }

  getToolUsageStats() {
    const stats: Record<string, { total: number; success: number }> = {};
    this.toolCalls.forEach(call => {
      if (!stats[call.tool]) {
        stats[call.tool] = { total: 0, success: 0 };
      }
      stats[call.tool].total++;
      if (call.success) stats[call.tool].success++;
    });
    return stats;
  }
}