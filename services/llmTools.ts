import { Type } from "@google/genai";

// Universal tool definitions that work across all AI providers
export const UNIVERSAL_TOOL_DEFINITIONS = {
  create_file: {
    name: 'create_file',
    description: 'Create a new file. REQUIRED: Provide full content. Do not use placeholders.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'File path/name (e.g. src/components/Button.tsx)' },
        content: { type: Type.STRING, description: 'The COMPLETE content of the file.' },
        language: { type: Type.STRING, description: 'Programming language (e.g. typescript)' }
      },
      required: ['name', 'content']
    }
  },
  update_file: {
    name: 'update_file',
    description: 'Overwrite an existing file. WARNING: You must provide the FULL file content. Do NOT use "// ... existing code" or lazy formatting. This tool REPLACES the file.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'The file path to update' },
        content: { type: Type.STRING, description: 'The NEW COMPLETE content of the file.' }
      },
      required: ['name', 'content']
    }
  },
  delete_file: {
    name: 'delete_file',
    description: 'Delete a file from the project. Use carefully.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'The file path to delete' }
      },
      required: ['name']
    }
  },
  list_files: {
    name: 'list_files',
    description: 'List all files in the project structure to understand the directory layout.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: 'Optional subdirectory to list (defaults to root)' }
      }
    }
  },
  search_files: {
    name: 'search_files',
    description: 'Search for code patterns or text across the project.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Regex or text to search for' }
      },
      required: ['query']
    }
  },
  read_file: {
    name: 'read_file',
    description: 'Read the contents of a file. If the file is not found, the tool will return a list of valid files.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'The file path to read' }
      },
      required: ['fileName']
    }
  },
  save_knowledge: {
    name: 'save_knowledge',
    description: `Persist useful information for future reference. 
    Use this when:
    1. User states a preference (style, libs, patterns).
    2. You solve a complex bug and want to remember the fix.
    3. You learn project architecture details.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        tags: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING }, 
          description: 'Tags for retrieval (e.g. #react, #user-preference, #auth)' 
        },
        content: { type: Type.STRING, description: 'Concise summary of the knowledge.' }
      },
      required: ['tags', 'content']
    }
  },
  manage_tasks: {
    name: 'manage_tasks',
    description: 'Update the project task list/status.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['add', 'update', 'complete', 'delete'] },
        task: { type: Type.STRING },
        status: { type: Type.STRING, enum: ['pending', 'in_progress', 'completed'] }
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

// Types for knowledge management
interface KnowledgeEntry {
  id: string;
  tags: string[];
  content: string;
  scope: string;
  timestamp: number;
  usageCount?: number;
  relevanceScore?: number;
}

// Enhanced Knowledge Management System
export class KnowledgeManager {
  private static instance: KnowledgeManager;
  private knowledgeBase: KnowledgeEntry[] = [];
  private readonly STORAGE_KEY = 'cm_knowledge_v2';

  static getInstance(): KnowledgeManager {
    if (!KnowledgeManager.instance) {
      KnowledgeManager.instance = new KnowledgeManager();
      KnowledgeManager.instance.loadFromStorage();
    }
    return KnowledgeManager.instance;
  }

  saveKnowledge(tags: string[], content: string, scope: string = 'global'): KnowledgeEntry {
    // Normalize tags
    const normalizedTags = tags.map(t => t.startsWith('#') ? t.toLowerCase() : '#' + t.toLowerCase());

    const entry: KnowledgeEntry = {
      id: this.generateId(),
      tags: normalizedTags,
      content,
      scope,
      timestamp: Date.now(),
      usageCount: 0
    };

    this.knowledgeBase.push(entry);
    this.persistKnowledge();

    console.log(`💾 MEMORY STORED: [${normalizedTags.join(', ')}]`);
    return entry;
  }

  getRelevantKnowledge(query: string): KnowledgeEntry[] {
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/[\s,.]+/);

    return this.knowledgeBase
      .map(entry => {
        let score = 0;

        // 1. Exact Tag Match in Query (High Priority)
        entry.tags.forEach(tag => {
          const cleanTag = tag.replace('#', '');
          if (queryLower.includes(tag)) score += 10; // Explicit hashtag usage
          else if (queryTokens.includes(cleanTag)) score += 5; // Keyword usage
        });

        // 2. Content Semantic Overlap (Basic)
        if (entry.content.toLowerCase().includes(queryLower)) score += 3;

        // 3. Global Scope Boost
        if (entry.scope === 'global') score += 1;

        // 4. Usage Boost (Frequently accessed knowledge is likely important)
        score += (entry.usageCount || 0) * 0.1;

        return { ...entry, relevanceScore: score };
      })
      .filter(e => e.relevanceScore! > 0)
      .sort((a, b) => b.relevanceScore! - a.relevanceScore!)
      .slice(0, 8); // Return top 8 results
  }

  loadKnowledge(entries: KnowledgeEntry[]) {
    // Merge provided entries with existing ones, avoiding duplicates by ID
    const existingIds = new Set(this.knowledgeBase.map(k => k.id));
    entries.forEach(e => {
      if (!existingIds.has(e.id)) {
        this.knowledgeBase.push(e);
      }
    });
  }

  private generateId(): string {
    return 'mem_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  private persistKnowledge() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.knowledgeBase));
    } catch (e) {
      console.warn('Knowledge persistence failed (Quota exceeded?):', e);
    }
  }

  private loadFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        this.knowledgeBase = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Corrupt knowledge base reset:', e);
      this.knowledgeBase = [];
    }
  }
}

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

    // Console visibility for debugging
    const icon = success ? '🟢' : '🔴';
    console.log(`${icon} Tool: ${tool} | ${error ? error : 'Success'}`);

    // Rolling log buffer (Max 50)
    if (this.toolCalls.length > 50) {
      this.toolCalls.shift();
    }
  }
}