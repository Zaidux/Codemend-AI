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
  apply_multi_patch: {
    name: 'apply_multi_patch',
    description: 'Apply multiple file updates in a single atomic operation. More efficient than multiple update_file calls. All changes succeed or all fail (rollback). Use this when you need to modify 2+ files simultaneously.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        patches: {
          type: Type.ARRAY,
          description: 'Array of file patches to apply',
          items: {
            type: Type.OBJECT,
            properties: {
              file: { type: Type.STRING, description: 'File path to update' },
              content: { type: Type.STRING, description: 'NEW COMPLETE content of the file (not a diff)' }
            },
            required: ['file', 'content']
          }
        },
        description: { type: Type.STRING, description: 'Brief description of what this multi-patch accomplishes' }
      },
      required: ['patches']
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
  read_multiple_files: {
    name: 'read_multiple_files',
    description: 'Read multiple files simultaneously (max 3) formatted side-by-side for easy comparison. Ideal for comparing similar functions, analyzing cross-file dependencies, or reviewing related code. Files are displayed with line numbers and aligned for visual comparison.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        files: {
          type: Type.ARRAY,
          description: 'Array of file paths to read (max 3)',
          items: { type: Type.STRING }
        },
        startLines: {
          type: Type.ARRAY,
          description: 'Optional: Starting line numbers for each file (1-indexed). If omitted, reads from line 1.',
          items: { type: Type.NUMBER }
        },
        endLines: {
          type: Type.ARRAY,
          description: 'Optional: Ending line numbers for each file. If omitted, reads entire file.',
          items: { type: Type.NUMBER }
        },
        reason: {
          type: Type.STRING,
          description: 'Brief explanation of why you are comparing these files (e.g., "Comparing authentication implementations")'
        }
      },
      required: ['files']
    }
  },
  read_file_section: {
    name: 'read_file_section',
    description: 'Read a specific section of a file by line numbers. Useful for large files to avoid context overload.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'The file path to read' },
        startLine: { type: Type.NUMBER, description: 'Starting line number (1-indexed)' },
        endLine: { type: Type.NUMBER, description: 'Ending line number (1-indexed)' }
      },
      required: ['fileName', 'startLine', 'endLine']
    }
  },  replace_section: {
    name: 'replace_section',
    description: 'Replace a specific section of a file by line numbers. CRITICAL: Provide COMPLETE replacement content for those lines only.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'The file path to modify' },
        startLine: { type: Type.NUMBER, description: 'Starting line number to replace (1-based)' },
        endLine: { type: Type.NUMBER, description: 'Ending line number to replace (inclusive)' },
        newContent: { type: Type.STRING, description: 'The COMPLETE new content for this section' }
      },
      required: ['fileName', 'startLine', 'endLine', 'newContent']
    }
  },
  codebase_search: {
    name: 'codebase_search',
    description: 'Advanced search across entire codebase with regex support and context. Returns matches with surrounding lines.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        pattern: { type: Type.STRING, description: 'Search pattern (supports regex)' },
        isRegex: { type: Type.BOOLEAN, description: 'Whether pattern is regex (default: false)' },
        filePattern: { type: Type.STRING, description: 'Optional: Filter by file pattern (e.g., "*.ts", "src/**")' },
        caseSensitive: { type: Type.BOOLEAN, description: 'Case sensitive search (default: false)' },
        contextLines: { type: Type.NUMBER, description: 'Number of context lines before/after match (default: 2)' }
      },
      required: ['pattern']
    }
  },
  run_command: {
    name: 'run_command',
    description: 'Execute a terminal command. USE WITH CAUTION. Only for safe operations like npm install, npm test, git status, etc.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: { type: Type.STRING, description: 'The command to execute' },
        workingDir: { type: Type.STRING, description: 'Optional working directory' }
      },
      required: ['command']
    }
  },
  git_operations: {
    name: 'git_operations',
    description: 'Perform git operations: status, diff, log, or create commits.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: { type: Type.STRING, enum: ['status', 'diff', 'log', 'commit'], description: 'Git operation to perform' },
        message: { type: Type.STRING, description: 'Commit message (required for commit operation)' },
        files: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Files to stage (for commit)' }
      },
      required: ['operation']
    }
  },
  refactor_code: {
    name: 'refactor_code',
    description: 'Suggest or apply code refactoring: rename variable/function, extract function, inline variable, etc.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'File to refactor' },
        refactorType: { type: Type.STRING, enum: ['rename', 'extract_function', 'inline', 'move'], description: 'Type of refactoring' },
        target: { type: Type.STRING, description: 'What to refactor (variable/function name)' },
        newName: { type: Type.STRING, description: 'New name (for rename)' },
        startLine: { type: Type.NUMBER, description: 'Start line for extraction' },
        endLine: { type: Type.NUMBER, description: 'End line for extraction' }
      },
      required: ['fileName', 'refactorType', 'target']
    }
  },
  generate_tests: {
    name: 'generate_tests',
    description: 'Generate comprehensive unit/integration tests for functions, components, or files. Uses Jest/Vitest syntax.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'File to generate tests for' },
        testType: { type: Type.STRING, enum: ['unit', 'integration', 'e2e'], description: 'Type of tests to generate' },
        framework: { type: Type.STRING, enum: ['jest', 'vitest', 'mocha'], description: 'Test framework (default: vitest)' },
        coverage: { type: Type.STRING, enum: ['basic', 'comprehensive', 'edge_cases'], description: 'Test coverage level' }
      },
      required: ['fileName']
    }
  },
  security_scan: {
    name: 'security_scan',
    description: 'Scan code for security vulnerabilities: SQL injection, XSS, secrets, insecure dependencies, etc.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        scope: { type: Type.STRING, enum: ['file', 'project'], description: 'Scan scope (default: project)' },
        fileName: { type: Type.STRING, description: 'Specific file to scan (required if scope=file)' },
        checkTypes: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: 'Specific checks: sql_injection, xss, secrets, deps, cors, auth' 
        }
      }
    }
  },
  analyze_dependencies: {
    name: 'analyze_dependencies',
    description: 'Analyze project dependencies: outdated packages, security issues, bundle size, upgrade paths.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        analysisType: { type: Type.STRING, enum: ['outdated', 'security', 'size', 'all'], description: 'Type of analysis' },
        autofix: { type: Type.BOOLEAN, description: 'Automatically update package.json with fixes (default: false)' }
      }
    }
  },
  code_review: {
    name: 'code_review',
    description: 'Perform automated code review: best practices, bugs, performance, accessibility, documentation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'File to review (omit for full project review)' },
        focus: { 
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Focus areas: style, performance, security, accessibility, tests, docs'
        },
        severity: { type: Type.STRING, enum: ['critical', 'warning', 'suggestion', 'all'], description: 'Minimum severity to report' }
      }
    }
  },
  performance_profile: {
    name: 'performance_profile',
    description: 'Analyze code for performance issues: complexity, memory leaks, render optimization, bundle size.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'File to analyze (omit for project-wide analysis)' },
        metrics: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Metrics: complexity, memory, renders, bundle, async'
        }
      }
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
    description: 'Manage project task list. Add, update, complete or delete tasks to keep project organized.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['add', 'update', 'complete', 'delete', 'list'], description: 'Action to perform' },
        task: { type: Type.STRING, description: 'Task description (required for add)' },
        taskId: { type: Type.STRING, description: 'Task ID (required for update, complete, delete)' },
        status: { type: Type.STRING, enum: ['pending', 'in_progress', 'completed'], description: 'Task status (for update)' },
        phase: { type: Type.STRING, description: 'Project phase/category (for add)' }
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
    
    // Auto-detect additional tags from content
    const autoTags = this.extractAutoTags(content);
    const allTags = [...new Set([...normalizedTags, ...autoTags])];

    const entry: KnowledgeEntry = {
      id: this.generateId(),
      tags: allTags,
      content,
      scope,
      timestamp: Date.now(),
      usageCount: 0
    };

    this.knowledgeBase.push(entry);
    this.persistKnowledge();

    console.log(`💾 MEMORY STORED: [${allTags.join(', ')}] - ${content.slice(0, 50)}...`);
    return entry;
  }

  private extractAutoTags(content: string): string[] {
    const autoTags: string[] = [];
    const lowerContent = content.toLowerCase();
    
    // Framework detection
    if (lowerContent.match(/\breact\b/)) autoTags.push('#react');
    if (lowerContent.match(/\bvue\b/)) autoTags.push('#vue');
    if (lowerContent.match(/\bangular\b/)) autoTags.push('#angular');
    if (lowerContent.match(/\bnode\.?js\b/)) autoTags.push('#nodejs');
    if (lowerContent.match(/\bexpress\b/)) autoTags.push('#express');
    
    // Language detection
    if (lowerContent.match(/\btypescript\b/)) autoTags.push('#typescript');
    if (lowerContent.match(/\bpython\b/)) autoTags.push('#python');
    if (lowerContent.match(/\bjava\b/)) autoTags.push('#java');
    
    // Common patterns
    if (lowerContent.match(/\bapi\b|\bendpoint\b/)) autoTags.push('#api');
    if (lowerContent.match(/\bauth\b|\bauthentication\b/)) autoTags.push('#auth');
    if (lowerContent.match(/\bdatabase\b|\bdb\b/)) autoTags.push('#database');
    if (lowerContent.match(/\btest\b|\btesting\b/)) autoTags.push('#testing');
    if (lowerContent.match(/\bbug\b|\berror\b|\bfix\b/)) autoTags.push('#bug-fix');
    if (lowerContent.match(/\bperformance\b|\boptimiz/)) autoTags.push('#performance');
    
    return autoTags;
  }

  getRelevantKnowledge(query: string, contextFiles?: string[]): KnowledgeEntry[] {
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/[\s,.]+/).filter(t => t.length > 2);

    return this.knowledgeBase
      .map(entry => {
        let score = 0;

        // 1. Exact Tag Match in Query (High Priority)
        entry.tags.forEach(tag => {
          const cleanTag = tag.replace('#', '');
          if (queryLower.includes(tag)) score += 15; // Explicit hashtag usage
          else if (queryTokens.includes(cleanTag)) score += 8; // Keyword usage
          
          // Context awareness - boost if tag matches file extensions
          if (contextFiles) {
            contextFiles.forEach(fileName => {
              if (fileName.toLowerCase().includes(cleanTag)) score += 5;
            });
          }
        });

        // 2. Content Semantic Overlap
        const contentLower = entry.content.toLowerCase();
        queryTokens.forEach(token => {
          if (contentLower.includes(token)) score += 2;
        });
        
        // Exact phrase match (very high score)
        if (contentLower.includes(queryLower)) score += 10;

        // 3. Global Scope Boost
        if (entry.scope === 'global') score += 2;

        // 4. Usage Boost (Frequently accessed knowledge is likely important)
        score += (entry.usageCount || 0) * 0.5;
        
        // 5. Recency Boost (newer knowledge might be more relevant)
        const daysSinceCreation = (Date.now() - entry.timestamp) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 7) score += 3; // Week old
        else if (daysSinceCreation < 30) score += 1; // Month old

        // Update usage count when retrieved
        if (score > 0) {
          entry.usageCount = (entry.usageCount || 0) + 1;
        }

        return { ...entry, relevanceScore: score };
      })
      .filter(e => e.relevanceScore! > 0)
      .sort((a, b) => b.relevanceScore! - a.relevanceScore!)
      .slice(0, 10); // Return top 10 results
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