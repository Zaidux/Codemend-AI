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
    description: `SAVE IMPORTANT INFORMATION, PATTERNS, OR LEARNINGS FOR FUTURE PROJECTS AND SESSIONS.
    
USE THIS WHEN:
- User teaches you something new (programming concepts, patterns, preferences)
- You discover a useful pattern or solution
- User has specific coding preferences or style guidelines
- You learn about project-specific architecture or conventions
- There are important dependencies or setup instructions
- User shares personal coding habits or workflow preferences

EXAMPLES:
- "User prefers functional programming over OOP"
- "Project uses MongoDB with Mongoose for database"
- "User likes to use async/await instead of promises"
- "This codebase follows the Airbnb JavaScript style guide"
- "User wants error handling in all API calls"
- "Project requires Python 3.9+ with type hints"

TAG WITH: #global for cross-project knowledge, #project for current project, #user for personal preferences`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        tags: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING }, 
          description: 'Tags to categorize this knowledge (e.g., #global, #project, #user, #python, #react, #style)' 
        },
        content: { 
          type: Type.STRING, 
          description: 'The knowledge content to save. Be specific and actionable.' 
        }
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

// Enhanced Knowledge Management System
export class KnowledgeManager {
  private static instance: KnowledgeManager;
  private knowledgeBase: KnowledgeEntry[] = [];

  static getInstance(): KnowledgeManager {
    if (!KnowledgeManager.instance) {
      KnowledgeManager.instance = new KnowledgeManager();
    }
    return KnowledgeManager.instance;
  }

  saveKnowledge(tags: string[], content: string, scope: string = 'global'): KnowledgeEntry {
    const entry: KnowledgeEntry = {
      id: this.generateId(),
      tags,
      content,
      scope,
      timestamp: Date.now(),
      usageCount: 0
    };
    
    this.knowledgeBase.push(entry);
    this.persistKnowledge();
    
    console.log(`💾 KNOWLEDGE SAVED: ${tags.join(', ')} - ${content.substring(0, 100)}...`);
    return entry;
  }

  getRelevantKnowledge(query: string, currentTags: string[] = []): KnowledgeEntry[] {
    const queryLower = query.toLowerCase();
    const relevant: KnowledgeEntry[] = [];
    
    this.knowledgeBase.forEach(entry => {
      let score = 0;
      
      // Score by tag matching
      entry.tags.forEach(tag => {
        if (currentTags.includes(tag)) score += 3;
        if (queryLower.includes(tag.toLowerCase().replace('#', ''))) score += 2;
      });
      
      // Score by content relevance
      if (entry.content.toLowerCase().includes(queryLower)) score += 1;
      
      // Always include global knowledge with moderate score
      if (entry.scope === 'global') score += 1;
      
      if (score > 0) {
        entry.usageCount = (entry.usageCount || 0) + 1;
        relevant.push({ ...entry, relevanceScore: score });
      }
    });
    
    // Sort by relevance score and usage count
    return relevant
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, 10); // Limit to most relevant
  }

  getKnowledgeByTags(tags: string[]): KnowledgeEntry[] {
    return this.knowledgeBase.filter(entry => 
      entry.tags.some(tag => tags.includes(tag))
    );
  }

  loadKnowledge(entries: KnowledgeEntry[]) {
    this.knowledgeBase = entries;
  }

  getAllKnowledge(): KnowledgeEntry[] {
    return [...this.knowledgeBase];
  }

  clearKnowledge() {
    this.knowledgeBase = [];
    this.persistKnowledge();
  }

  private generateId(): string {
    return 'know_' + Math.random().toString(36).substr(2, 9);
  }

  private persistKnowledge() {
    try {
      localStorage.setItem('cm_knowledge_enhanced', JSON.stringify(this.knowledgeBase));
    } catch (e) {
      console.warn('Failed to persist knowledge:', e);
    }
  }

  loadFromStorage() {
    try {
      const saved = localStorage.getItem('cm_knowledge_enhanced');
      if (saved) {
        this.knowledgeBase = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load knowledge from storage:', e);
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
    
    const status = success ? '✅ SUCCESS' : '❌ FAILED';
    console.log(`🔧 TOOL ${status}: ${tool}`, error || '');
    
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