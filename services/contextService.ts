import { Project, ProjectFile, ProjectSummary, FileSummary, CompressionConfig } from '../types';

// ==========================================
// CONTEXT CACHE - Performance Optimization
// ==========================================
class ContextCache {
  private cache = new Map<string, {data: any, timestamp: number}>();
  private TTL = 5 * 60 * 1000; // 5 minutes

  get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }
  
  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  invalidate(projectId: string): void {
    // Clear all cache entries for a project
    for (const key of this.cache.keys()) {
      if (key.startsWith(projectId)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { entries: number, oldestEntry: number | null } {
    if (this.cache.size === 0) {
      return { entries: 0, oldestEntry: null };
    }
    
    let oldest = Date.now();
    for (const entry of this.cache.values()) {
      if (entry.timestamp < oldest) {
        oldest = entry.timestamp;
      }
    }
    
    return {
      entries: this.cache.size,
      oldestEntry: oldest
    };
  }
}

// ==========================================
// INCREMENTAL CONTEXT TRACKER
// ==========================================
class ConversationContextTracker {
  private seenFiles = new Map<string, Set<string>>(); // projectId -> Set of file paths
  private taskHistory = new Map<string, string[]>(); // projectId -> task descriptions
  
  /**
   * Track which files have been sent to the model
   */
  markFilesSeen(projectId: string, filePaths: string[]): void {
    if (!this.seenFiles.has(projectId)) {
      this.seenFiles.set(projectId, new Set());
    }
    const seen = this.seenFiles.get(projectId)!;
    filePaths.forEach(path => seen.add(path));
    
    console.log(`📝 Tracked ${filePaths.length} files for project ${projectId}`);
  }
  
  /**
   * Get files that haven't been sent to model yet
   */
  getNewFiles(projectId: string, allFiles: ProjectFile[]): ProjectFile[] {
    const seen = this.seenFiles.get(projectId) || new Set();
    const newFiles = allFiles.filter(f => !seen.has(f.name));
    
    console.log(`🆕 Found ${newFiles.length} new files out of ${allFiles.length} total`);
    return newFiles;
  }
  
  /**
   * Determine if we should send full context or just incremental
   */
  shouldSendFullContext(
    projectId: string, 
    currentTask: string,
    threshold: number = 0.7
  ): boolean {
    // Always send full context on first interaction
    if (!this.taskHistory.has(projectId)) {
      return true;
    }
    
    // Check if task changed significantly
    const previousTasks = this.taskHistory.get(projectId)!;
    const taskChanged = this.taskChangedSignificantly(currentTask, previousTasks, threshold);
    
    console.log(`🔍 Task change analysis:`, {
      currentTask: currentTask.slice(0, 50),
      previousCount: previousTasks.length,
      significantChange: taskChanged
    });
    
    return taskChanged;
  }
  
  /**
   * Track task for future comparison
   */
  trackTask(projectId: string, task: string): void {
    if (!this.taskHistory.has(projectId)) {
      this.taskHistory.set(projectId, []);
    }
    const history = this.taskHistory.get(projectId)!;
    history.push(task);
    
    // Keep only last 5 tasks
    if (history.length > 5) {
      history.shift();
    }
  }
  
  /**
   * Determine if task changed significantly using keyword overlap
   */
  private taskChangedSignificantly(
    currentTask: string, 
    previousTasks: string[],
    threshold: number
  ): boolean {
    const currentWords = this.extractKeywords(currentTask);
    
    // Compare with most recent task
    const lastTask = previousTasks[previousTasks.length - 1];
    const lastWords = this.extractKeywords(lastTask);
    
    // Calculate overlap (Jaccard similarity)
    const intersection = currentWords.filter(w => lastWords.includes(w));
    const union = [...new Set([...currentWords, ...lastWords])];
    const similarity = intersection.length / union.length;
    
    console.log(`📊 Task similarity: ${(similarity * 100).toFixed(1)}%`, {
      threshold: threshold * 100,
      currentWords: currentWords.slice(0, 5),
      lastWords: lastWords.slice(0, 5),
      overlap: intersection.length
    });
    
    // If similarity is low, task changed significantly
    return similarity < threshold;
  }
  
  /**
   * Extract meaningful keywords from task
   */
  private extractKeywords(task: string): string[] {
    const words = task.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3) // Filter short words
      .filter(w => !this.isStopWord(w)); // Filter common words
    
    return [...new Set(words)]; // Remove duplicates
  }
  
  /**
   * Check if word is a stop word (common English words)
   */
  private isStopWord(word: string): boolean {
    const stopWords = [
      'this', 'that', 'with', 'from', 'have', 'been', 'were', 'they',
      'what', 'when', 'where', 'which', 'while', 'would', 'could', 'should'
    ];
    return stopWords.includes(word);
  }
  
  /**
   * Reset tracking for a project (e.g., on new session)
   */
  reset(projectId: string): void {
    this.seenFiles.delete(projectId);
    this.taskHistory.delete(projectId);
    console.log(`🔄 Reset context tracking for project ${projectId}`);
  }
  
  /**
   * Get incremental context: only new/changed files + summary of already-seen context
   */
  getIncrementalContext(
    projectId: string,
    allFiles: ProjectFile[],
    currentTask: string
  ): { newFiles: ProjectFile[], contextSummary: string } {
    const newFiles = this.getNewFiles(projectId, allFiles);
    const seenPaths = Array.from(this.seenFiles.get(projectId) || []);
    
    const contextSummary = seenPaths.length > 0
      ? `You have already seen ${seenPaths.length} files in this project, including:\n${seenPaths.slice(0, 10).join('\n')}\n${seenPaths.length > 10 ? `...and ${seenPaths.length - 10} more` : ''}`
      : 'This is your first interaction with this project.';
    
    return { newFiles, contextSummary };
  }
}

// ==========================================
// TYPE DEFINITIONS
// ==========================================

interface FileNode {
  file: ProjectFile;
  imports: string[];
  importedBy: string[];
  relatedFiles: string[];
}

interface FrameworkTemplate {
  name: string;
  indicators: string[];
  detector?: (files: ProjectFile[]) => boolean;
  keyFiles?: string[];
  contextPriority?: string[];
  commonPatterns: string[];
  bestPractices: string[];
}

// Context compression and summarization service
export class ContextService {
  private static instance: ContextService;
  private cache: ContextCache;
  private contextTracker: ConversationContextTracker;

  public static getInstance(): ContextService {
    if (!ContextService.instance) {
      ContextService.instance = new ContextService();
    }
    return ContextService.instance;
  }

  private constructor() {
    this.cache = new ContextCache();
    this.contextTracker = new ConversationContextTracker();
  }

  // Generate project summary - Enhanced with caching
  async generateProjectSummary(
    project: Project, 
    files: ProjectFile[], 
    llmConfig: any
  ): Promise<ProjectSummary> {
    // Check cache first
    const cacheKey = `${project.id}:summary:${files.length}`;
    const cached = this.cache.get<ProjectSummary>(cacheKey);
    if (cached) {
      console.log('📦 Using cached project summary');
      return cached;
    }

    try {
      // Validate inputs
      if (!files || !Array.isArray(files)) {
        console.warn('No files provided for project summary');
        return this.createFallbackSummary(project.id, []);
      }

      // Analyze project structure with safe array handling
      const structure = this.analyzeProjectStructure(files);
      const keyFiles = this.identifyKeyFiles(files);
      const dependencies = this.extractDependencies(files);
      const entryPoints = this.findEntryPoints(files);

      // Create a concise summary
      const summary = this.createProjectSummary(structure, keyFiles, dependencies, entryPoints);

      const projectSummary: ProjectSummary = {
        id: this.generateUUID(),
        projectId: project.id,
        summary,
        keyFiles: keyFiles.map(f => f.name),
        architecture: structure.architecture,
        dependencies,
        entryPoints,
        timestamp: Date.now()
      };

      // Cache the result
      this.cache.set(cacheKey, projectSummary);

      return projectSummary;
    } catch (error) {
      console.error('Error generating project summary:', error);
      return this.createFallbackSummary(project.id, files);
    }
  }

  // Invalidate cache when project changes
  invalidateProjectCache(projectId: string): void {
    this.cache.invalidate(projectId);
    console.log('🗑️ Cleared cache for project:', projectId);
  }

  // ==========================================
  // LLM-POWERED INTELLIGENT SUMMARIES
  // ==========================================
  
  /**
   * Generate an intelligent project summary using the LLM itself
   * This provides much better context than regex-based analysis
   */
  async generateIntelligentSummary(
    project: Project,
    files: ProjectFile[],
    llmGenerateFunction: (prompt: string) => Promise<string>
  ): Promise<string> {
    // Check cache first
    const cacheKey = `${project.id}:intelligent-summary:${files.length}`;
    const cached = this.cache.get<string>(cacheKey);
    if (cached) {
      console.log('📦 Using cached intelligent summary');
      return cached;
    }

    try {
      // Select most important files (max 10 to avoid token overflow)
      const keyFiles = this.identifyKeyFiles(files).slice(0, 10);
      
      // Build file list with line counts
      const fileList = keyFiles.map(f => {
        const lines = f.content.split('\n').length;
        const size = f.content.length;
        return `- ${f.name} (${lines} lines, ${Math.round(size / 1024)}KB)`;
      }).join('\n');

      // Get sample content from the main entry point
      const mainFile = keyFiles.find(f => 
        f.name.includes('index.') || 
        f.name.includes('main.') || 
        f.name.includes('App.')
      ) || keyFiles[0];

      const sampleContent = mainFile ? mainFile.content.slice(0, 2000) : '';

      const prompt = `Analyze this software project and provide a concise 4-sentence summary:

PROJECT NAME: ${project.name}

KEY FILES:
${fileList}

SAMPLE CODE from ${mainFile?.name || 'main file'}:
\`\`\`
${sampleContent}
\`\`\`

Please provide:
1. What this project does (1 sentence)
2. Key technologies/frameworks used (1 sentence)
3. Architecture pattern (e.g., MVC, component-based, microservices) (1 sentence)
4. Notable features or complexity (1 sentence)

Keep it concise and technical.`;

      const summary = await llmGenerateFunction(prompt);
      
      // Cache the result
      this.cache.set(cacheKey, summary);
      
      console.log('✨ Generated intelligent project summary');
      return summary;
    } catch (error) {
      console.error('Error generating intelligent summary:', error);
      // Fallback to traditional summary
      const structure = this.analyzeProjectStructure(files);
      const keyFiles = this.identifyKeyFiles(files);
      const dependencies = this.extractDependencies(files);
      const entryPoints = this.findEntryPoints(files);
      return this.createProjectSummary(structure, keyFiles, dependencies, entryPoints);
    }
  }

  /**
   * Generate intelligent file purpose descriptions using LLM
   */
  async generateIntelligentFileSummary(
    file: ProjectFile,
    llmGenerateFunction: (prompt: string) => Promise<string>
  ): Promise<string> {
    const cacheKey = `file-summary:${file.id}:${file.content.length}`;
    const cached = this.cache.get<string>(cacheKey);
    if (cached) return cached;

    try {
      // Take first 1000 chars for analysis
      const sample = file.content.slice(0, 1000);
      
      const prompt = `Analyze this code file and describe its purpose in ONE sentence:

FILE: ${file.name}
CODE SAMPLE:
\`\`\`
${sample}
\`\`\`

Respond with only one clear sentence describing what this file does.`;

      const summary = await llmGenerateFunction(prompt);
      this.cache.set(cacheKey, summary);
      return summary;
    } catch (error) {
      console.error('Error generating file summary:', error);
      return this.determineFilePurpose(file.name, file.content);
    }
  }

  // ==========================================
  // DEPENDENCY GRAPH - File Relationships
  // ==========================================

  /**
   * Build a complete dependency graph of the project
   * This helps the model understand file relationships
   */
  buildDependencyGraph(files: ProjectFile[]): Map<string, FileNode> {
    const cacheKey = `dep-graph:${files.length}:${files.map(f => f.name).join(',')}`;
    const cached = this.cache.get<Map<string, any>>(cacheKey);
    if (cached) {
      console.log('📦 Using cached dependency graph');
      return cached;
    }

    const graph = new Map<string, any>();
    
    // First pass: extract imports from each file
    files.forEach(file => {
      const imports = this.extractImportsFromFile(file);
      graph.set(file.name, {
        file,
        imports,
        importedBy: [],
        relatedFiles: []
      });
    });
    
    // Second pass: build reverse relationships (who imports this file)
    graph.forEach((node, fileName) => {
      node.imports.forEach((importPath: string) => {
        const imported = this.resolveImportPath(importPath, files);
        if (imported && graph.has(imported.name)) {
          const importedNode = graph.get(imported.name);
          if (!importedNode.importedBy.includes(fileName)) {
            importedNode.importedBy.push(fileName);
          }
        }
      });
    });

    // Third pass: identify related files (files that share dependencies)
    graph.forEach((node, fileName) => {
      const related = new Set<string>();
      
      // Files that import the same things as this file
      node.imports.forEach((imp: string) => {
        graph.forEach((otherNode, otherFileName) => {
          if (otherFileName !== fileName && otherNode.imports.includes(imp)) {
            related.add(otherFileName);
          }
        });
      });
      
      node.relatedFiles = Array.from(related);
    });

    this.cache.set(cacheKey, graph);
    console.log('📊 Built dependency graph:', {
      files: graph.size,
      totalImports: Array.from(graph.values()).reduce((sum: number, node: any) => sum + node.imports.length, 0)
    });

    return graph;
  }

  /**
   * Extract import statements from a file
   */
  private extractImportsFromFile(file: ProjectFile): string[] {
    if (!file || !file.content) return [];

    const imports: string[] = [];
    const content = file.content;

    // JavaScript/TypeScript imports
    const esImportRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    
    // Python imports
    const pythonImportRegex = /(?:from\s+([^\s]+)\s+import|import\s+([^\s]+))/g;
    
    let match;
    
    // Extract ES6/CommonJS imports
    while ((match = esImportRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    // Extract Python imports
    while ((match = pythonImportRegex.exec(content)) !== null) {
      imports.push(match[1] || match[2]);
    }

    return [...new Set(imports)]; // Remove duplicates
  }

  /**
   * Resolve an import path to an actual file in the project
   */
  private resolveImportPath(importPath: string, files: ProjectFile[]): ProjectFile | null {
    // Skip external packages (no ./ or ../)
    if (!importPath.startsWith('.')) {
      return null;
    }

    // Clean up the import path
    let cleanPath = importPath.replace(/^\.\//, '').replace(/^\.\.\//, '');
    
    // Try with common extensions if no extension provided
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.py', '.vue'];
    
    for (const ext of extensions) {
      const testPath = cleanPath + ext;
      const found = files.find(f => 
        f.name === testPath || 
        f.name.endsWith('/' + testPath) ||
        f.name === `src/${testPath}`
      );
      if (found) return found;
    }

    // Try index files
    for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
      const indexPath = `${cleanPath}/index${ext}`;
      const found = files.find(f => 
        f.name === indexPath || 
        f.name.endsWith('/' + indexPath)
      );
      if (found) return found;
    }

    return null;
  }

  /**
   * Get all files related to a specific file (within N degrees of separation)
   */
  getRelatedFiles(
    fileName: string, 
    graph: Map<string, any>, 
    depth: number = 2
  ): ProjectFile[] {
    const related = new Set<string>();
    const queue: {name: string, currentDepth: number}[] = [{name: fileName, currentDepth: 0}];
    const visited = new Set<string>();
    
    while (queue.length > 0) {
      const {name, currentDepth} = queue.shift()!;
      
      if (currentDepth >= depth || visited.has(name)) continue;
      visited.add(name);
      
      const node = graph.get(name);
      if (!node) continue;
      
      // Add direct imports and files that import this one
      const connections = [...node.imports, ...node.importedBy];
      connections.forEach(connectedName => {
        if (!related.has(connectedName) && connectedName !== fileName) {
          related.add(connectedName);
          queue.push({name: connectedName, currentDepth: currentDepth + 1});
        }
      });
    }
    
    // Convert to files
    return Array.from(related)
      .map(name => graph.get(name)?.file)
      .filter(Boolean) as ProjectFile[];
  }

  /**
   * Generate a visual dependency map description for the model
   */
  describeDependencyGraph(graph: Map<string, any>): string {
    const nodes = Array.from(graph.values());
    
    // Find most imported files (central nodes)
    const mostImported = nodes
      .sort((a, b) => b.importedBy.length - a.importedBy.length)
      .slice(0, 5);
    
    // Find files with most imports (high coupling)
    const mostImports = nodes
      .sort((a, b) => b.imports.length - a.imports.length)
      .slice(0, 5);
    
    return `
DEPENDENCY GRAPH ANALYSIS:

Core Files (most imported by others):
${mostImported.map(n => `- ${n.file.name} (imported by ${n.importedBy.length} files)`).join('\n')}

High Coupling Files (import many things):
${mostImports.map(n => `- ${n.file.name} (imports ${n.imports.length} files)`).join('\n')}

Total Connections: ${nodes.reduce((sum, n) => sum + n.imports.length, 0)} imports across ${graph.size} files
    `.trim();
  }

  // ==========================================
  // FRAMEWORK DETECTION & TEMPLATES
  // ==========================================

  private readonly FRAMEWORK_TEMPLATES: FrameworkTemplate[] = [
    {
      name: 'React + Vite',
      indicators: [],
      detector: (files) => files.some(f => 
        f.name === 'vite.config.ts' && f.content.includes('react')
      ) || files.some(f => f.name === 'vite.config.js' && f.content.includes('react')),
      keyFiles: ['vite.config.ts', 'index.html', 'src/main.tsx', 'src/App.tsx', 'package.json'],
      contextPriority: ['src/components/', 'src/hooks/', 'src/services/', 'src/utils/', 'src/'],
      commonPatterns: [
        'Component-based architecture',
        'React hooks for state management',
        'Fast HMR with Vite',
        'TypeScript for type safety'
      ],
      bestPractices: [
        'Keep components small and focused',
        'Use custom hooks for reusable logic',
        'Organize by feature, not file type',
        'Use absolute imports with path aliases'
      ]
    },
    {
      name: 'Next.js',
      indicators: [],
      detector: (files) => files.some(f => 
        f.name === 'next.config.js' || f.name === 'next.config.mjs'
      ),
      keyFiles: ['next.config.js', 'package.json', 'app/', 'pages/', 'public/'],
      contextPriority: ['app/', 'pages/', 'components/', 'lib/', 'api/'],
      commonPatterns: [
        'File-based routing',
        'Server and Client Components',
        'API routes',
        'Automatic code splitting'
      ],
      bestPractices: [
        'Use Server Components by default',
        'Mark client components with "use client"',
        'Leverage parallel routes and intercepting routes',
        'Use Next.js Image for optimization'
      ]
    },
    {
      name: 'React + TypeScript',
      indicators: [],
      detector: (files) => 
        files.some(f => f.name === 'tsconfig.json') &&
        files.some(f => f.content.includes('import React') || f.content.includes('from "react"')),
      keyFiles: ['tsconfig.json', 'package.json', 'src/index.tsx', 'src/App.tsx'],
      contextPriority: ['src/components/', 'src/hooks/', 'src/types/', 'src/'],
      commonPatterns: [
        'TypeScript for type safety',
        'React functional components',
        'Props interfaces',
        'Generic components'
      ],
      bestPractices: [
        'Define prop interfaces',
        'Use TypeScript generics for reusable components',
        'Leverage discriminated unions',
        'Avoid "any" types'
      ]
    },
    {
      name: 'Vue.js',
      indicators: [],
      detector: (files) => files.some(f => 
        f.name.endsWith('.vue') || 
        (f.name === 'package.json' && f.content.includes('"vue"'))
      ),
      keyFiles: ['vite.config.js', 'src/main.js', 'src/App.vue', 'package.json'],
      contextPriority: ['src/components/', 'src/views/', 'src/composables/', 'src/'],
      commonPatterns: [
        'Single File Components (SFC)',
        'Composition API',
        'Reactive state',
        'Template syntax'
      ],
      bestPractices: [
        'Use Composition API over Options API',
        'Extract logic into composables',
        'Use <script setup> syntax',
        'Leverage TypeScript with Vue 3'
      ]
    },
    {
      name: 'Express.js',
      indicators: [],
      detector: (files) => files.some(f => 
        f.content.includes('express()') || 
        f.content.includes('require("express")') ||
        f.content.includes('from "express"')
      ),
      keyFiles: ['server.js', 'app.js', 'index.js', 'package.json', 'routes/'],
      contextPriority: ['routes/', 'controllers/', 'middleware/', 'models/'],
      commonPatterns: [
        'RESTful API routes',
        'Middleware chain',
        'MVC pattern',
        'Error handling middleware'
      ],
      bestPractices: [
        'Organize routes by resource',
        'Use async/await in route handlers',
        'Implement centralized error handling',
        'Validate input with middleware'
      ]
    },
    {
      name: 'Python Flask',
      indicators: [],
      detector: (files) => files.some(f => 
        f.content.includes('from flask import') || 
        f.content.includes('import flask')
      ),
      keyFiles: ['app.py', 'main.py', 'requirements.txt', 'templates/', 'static/'],
      contextPriority: ['routes/', 'models/', 'templates/', 'static/'],
      commonPatterns: [
        'Flask blueprints',
        'Route decorators',
        'Jinja2 templates',
        'Request/Response handling'
      ],
      bestPractices: [
        'Use blueprints for modular apps',
        'Implement application factory pattern',
        'Use Flask-SQLAlchemy for database',
        'Validate with Flask-WTF'
      ]
    },
    {
      name: 'Python Django',
      indicators: [],
      detector: (files) => files.some(f => 
        f.name === 'manage.py' || 
        f.content.includes('django.') ||
        f.name === 'settings.py'
      ),
      keyFiles: ['manage.py', 'settings.py', 'urls.py', 'models.py', 'views.py'],
      contextPriority: ['models.py', 'views.py', 'urls.py', 'templates/', 'static/'],
      commonPatterns: [
        'MVT (Model-View-Template) pattern',
        'Django ORM',
        'URL routing',
        'Admin interface'
      ],
      bestPractices: [
        'Use class-based views',
        'Leverage Django ORM efficiently',
        'Organize apps by feature',
        'Use Django forms for validation'
      ]
    }
  ];

  /**
   * Detect which framework/template the project uses
   */
  detectFramework(files: ProjectFile[]): FrameworkTemplate | null {
    const cacheKey = `framework:${files.length}:${files.map(f => f.name).join(',')}`;
    const cached = this.cache.get<FrameworkTemplate | null>(cacheKey);
    if (cached !== undefined) {
      console.log('📦 Using cached framework detection');
      return cached;
    }

    const detected = this.FRAMEWORK_TEMPLATES.find(template => 
      template.detector(files)
    ) || null;

    this.cache.set(cacheKey, detected);
    
    if (detected) {
      console.log('🎯 Detected framework:', detected.name);
    }

    return detected;
  }

  /**
   * Build framework-aware context for the model
   */
  buildFrameworkAwareContext(
    files: ProjectFile[], 
    framework: FrameworkTemplate,
    currentTask?: string
  ): string {
    // Prioritize files based on framework template
    const prioritized = this.prioritizeFilesByFramework(files, framework);
    
    return `
📋 FRAMEWORK CONTEXT: ${framework.name}

KEY ARCHITECTURAL PATTERNS:
${framework.commonPatterns.map(p => `  • ${p}`).join('\n')}

BEST PRACTICES FOR THIS FRAMEWORK:
${framework.bestPractices.map(p => `  • ${p}`).join('\n')}

IMPORTANT FILES TO FOCUS ON:
${framework.keyFiles.filter(kf => files.some(f => f.name.includes(kf))).map(kf => `  • ${kf}`).join('\n')}

PRIORITY FILE AREAS:
${framework.contextPriority.slice(0, 5).map(p => `  • ${p}`).join('\n')}

${currentTask ? `CURRENT TASK: ${currentTask}\n` : ''}
When working on this ${framework.name} project, follow the patterns and best practices above.
    `.trim();
  }

  /**
   * Prioritize files based on framework-specific importance
   */
  private prioritizeFilesByFramework(
    files: ProjectFile[], 
    framework: FrameworkTemplate
  ): ProjectFile[] {
    const scored = files.map(file => {
      let score = 0;
      
      // Key files get highest priority
      if (framework.keyFiles.some(kf => file.name.includes(kf))) {
        score += 100;
      }
      
      // Priority directories get medium priority
      for (const priority of framework.contextPriority) {
        if (file.name.includes(priority)) {
          score += 50;
          break;
        }
      }
      
      // Entry points get high priority
      if (file.name.includes('index.') || file.name.includes('main.') || file.name.includes('App.')) {
        score += 75;
      }
      
      return { file, score };
    });
    
    return scored
      .sort((a, b) => b.score - a.score)
      .map(s => s.file);
  }

  // Generate file summaries with safe iteration and caching
  async generateFileSummaries(files: ProjectFile[], projectId?: string): Promise<FileSummary[]> {
    if (!files || !Array.isArray(files)) {
      return [];
    }

    // Check cache if project ID provided
    if (projectId) {
      const cacheKey = `${projectId}:file-summaries:${files.length}`;
      const cached = this.cache.get<FileSummary[]>(cacheKey);
      if (cached) {
        console.log('📦 Using cached file summaries');
        return cached;
      }
    }
    
    const summaries = files.map(file => {
      try {
        return this.analyzeFile(file);
      } catch (error) {
        console.error(`Error analyzing file ${file.name}:`, error);
        return this.createFallbackFileSummary(file);
      }
    });

    // Cache if project ID provided
    if (projectId) {
      const cacheKey = `${projectId}:file-summaries:${files.length}`;
      this.cache.set(cacheKey, summaries);
    }

    return summaries;
  }

  // ==========================================
  // SEMANTIC FILE RELEVANCE SCORING
  // ==========================================

  /**
   * Find files most relevant to the current task using semantic scoring
   * This is smarter than simple keyword matching
   */
  findRelevantFilesSemanticly(
    task: string,
    files: ProjectFile[],
    topK: number = 10
  ): ProjectFile[] {
    const cacheKey = `relevant:${task}:${files.length}:${topK}`;
    const cached = this.cache.get<ProjectFile[]>(cacheKey);
    if (cached) {
      console.log('📦 Using cached relevant files');
      return cached;
    }

    // Score each file's relevance to the task
    const scored = files.map(file => ({
      file,
      score: this.calculateRelevanceScore(task, file, files)
    }));
    
    // Sort by relevance and return top K
    const relevant = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => s.file);

    this.cache.set(cacheKey, relevant);
    
    console.log('🎯 Found relevant files:', {
      task: task.slice(0, 50),
      topFiles: relevant.slice(0, 3).map(f => f.name)
    });

    return relevant;
  }

  /**
   * Calculate relevance score for a file based on the task
   */
  private calculateRelevanceScore(
    task: string, 
    file: ProjectFile,
    allFiles: ProjectFile[]
  ): number {
    let score = 0;
    const taskLower = task.toLowerCase();
    const fileLower = file.content.toLowerCase();
    const fileNameLower = file.name.toLowerCase();
    
    // 1. FILENAME MATCH (highest weight - 50 points)
    const taskWords = taskLower.split(/\s+/).filter(w => w.length > 2);
    taskWords.forEach(word => {
      if (fileNameLower.includes(word)) {
        score += 50;
      }
    });
    
    // 2. CONTENT KEYWORD MATCH (medium weight - 5 points per match, max 50)
    let contentMatches = 0;
    taskWords.forEach(word => {
      if (word.length > 3 && fileLower.includes(word)) {
        contentMatches++;
      }
    });
    score += Math.min(contentMatches * 5, 50);
    
    // 3. CONTEXTUAL KEYWORDS (high weight - specific terms)
    const contextKeywords = this.extractContextKeywords(task);
    contextKeywords.forEach(keyword => {
      if (fileLower.includes(keyword.toLowerCase())) {
        score += 20;
      }
    });
    
    // 4. FILE TYPE RELEVANCE (based on task verbs)
    if (this.isTaskAboutUI(task) && this.isUIFile(file)) {
      score += 30;
    }
    if (this.isTaskAboutAPI(task) && this.isAPIFile(file)) {
      score += 30;
    }
    if (this.isTaskAboutState(task) && this.isStateFile(file)) {
      score += 30;
    }
    if (this.isTaskAboutStyling(task) && this.isStyleFile(file)) {
      score += 30;
    }
    
    // 5. FILE IMPORTANCE (entry points, configs get bonus)
    if (this.isKeyFile(file.name)) {
      score += 20;
    }
    
    // 6. FILE SIZE PENALTY (very large or very small files less relevant)
    const size = file.content.length;
    if (size < 100) score -= 10; // Too small, probably not important
    if (size > 50000) score -= 10; // Too large, might be generated
    
    return score;
  }

  /**
   * Extract contextual keywords from task (technical terms, functions, components)
   */
  private extractContextKeywords(task: string): string[] {
    const keywords: string[] = [];
    
    // Extract quoted terms (high importance)
    const quoted = task.match(/"([^"]+)"|'([^']+)'/g);
    if (quoted) {
      keywords.push(...quoted.map(q => q.replace(/["']/g, '')));
    }
    
    // Extract camelCase/PascalCase identifiers
    const identifiers = task.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g);
    if (identifiers) {
      keywords.push(...identifiers);
    }
    
    // Extract technical terms (common programming keywords)
    const technicalTerms = [
      'component', 'service', 'controller', 'model', 'view', 
      'api', 'route', 'handler', 'middleware', 'hook',
      'function', 'class', 'interface', 'type', 'util', 'helper'
    ];
    
    technicalTerms.forEach(term => {
      if (task.toLowerCase().includes(term)) {
        keywords.push(term);
      }
    });
    
    return [...new Set(keywords)];
  }

  /**
   * Helper methods to determine task type
   */
  private isTaskAboutUI(task: string): boolean {
    const uiKeywords = ['component', 'ui', 'button', 'form', 'modal', 'layout', 'page', 'view', 'render', 'display'];
    return uiKeywords.some(kw => task.toLowerCase().includes(kw));
  }

  private isTaskAboutAPI(task: string): boolean {
    const apiKeywords = ['api', 'endpoint', 'route', 'request', 'response', 'fetch', 'http', 'rest'];
    return apiKeywords.some(kw => task.toLowerCase().includes(kw));
  }

  private isTaskAboutState(task: string): boolean {
    const stateKeywords = ['state', 'store', 'redux', 'context', 'provider', 'hook', 'data'];
    return stateKeywords.some(kw => task.toLowerCase().includes(kw));
  }

  private isTaskAboutStyling(task: string): boolean {
    const styleKeywords = ['style', 'css', 'theme', 'color', 'layout', 'design'];
    return styleKeywords.some(kw => task.toLowerCase().includes(kw));
  }

  /**
   * Helper methods to determine file type
   */
  private isUIFile(file: ProjectFile): boolean {
    return file.name.toLowerCase().includes('component') ||
           file.name.toLowerCase().includes('view') ||
           file.name.toLowerCase().includes('page') ||
           file.content.includes('return (') && file.content.includes('<') ||
           file.name.endsWith('.vue');
  }

  private isAPIFile(file: ProjectFile): boolean {
    return file.name.toLowerCase().includes('api') ||
           file.name.toLowerCase().includes('route') ||
           file.name.toLowerCase().includes('endpoint') ||
           file.content.includes('app.get(') ||
           file.content.includes('app.post(') ||
           file.content.includes('@app.route');
  }

  private isStateFile(file: ProjectFile): boolean {
    return file.name.toLowerCase().includes('store') ||
           file.name.toLowerCase().includes('state') ||
           file.name.toLowerCase().includes('context') ||
           file.name.toLowerCase().includes('provider') ||
           file.content.includes('createContext') ||
           file.content.includes('useState');
  }

  private isStyleFile(file: ProjectFile): boolean {
    return file.name.endsWith('.css') ||
           file.name.endsWith('.scss') ||
           file.name.endsWith('.sass') ||
           file.name.toLowerCase().includes('style') ||
           file.name.toLowerCase().includes('theme');
  }

  private isKeyFile(fileName: string): boolean {
    const keyPatterns = [
      /package\.json$/,
      /requirements\.txt$/,
      /^index\./,
      /^main\./,
      /^app\./,
      /^server\./,
      /^config\./,
      /\.env/,
      /README\.md/i
    ];
    return keyPatterns.some(pattern => pattern.test(fileName));
  }

  // Compress project context for model transfer
  compressProjectContext(
    project: Project,
    files: ProjectFile[],
    projectSummary: ProjectSummary,
    fileSummaries: FileSummary[],
    currentTask: string,
    conversationHistory: string[]
  ): string {
    // Safe array handling for all inputs
    const safeFiles = files || [];
    const safeFileSummaries = fileSummaries || [];
    const safeConversationHistory = conversationHistory || [];

    const context = `
PROJECT CONTEXT SUMMARY:
${projectSummary?.summary || 'No summary available'}

ARCHITECTURE: ${projectSummary?.architecture || 'unknown'}

KEY FILES:
${(projectSummary?.keyFiles || []).slice(0, 10).map(file => `- ${file}`).join('\n')}

DEPENDENCIES:
${(projectSummary?.dependencies || []).length > 0 ? projectSummary.dependencies.slice(0, 8).join(', ') : 'None detected'}

ENTRY POINTS:
${(projectSummary?.entryPoints || []).slice(0, 5).join(', ')}

FILE SUMMARIES:
${safeFileSummaries.slice(0, 8).map(summary => `
${summary.fileName}:
  Purpose: ${summary.purpose}
  Key Functions: ${(summary.keyFunctions || []).slice(0, 3).join(', ')}
  Complexity: ${summary.complexity}
`).join('\n')}

CURRENT TASK: ${currentTask || 'No current task'}

RECENT CONVERSATION:
${safeConversationHistory.slice(-3).join('\n\n')}

INSTRUCTIONS:
Continue working on this project based on the context above. You have access to the full file contents through tools if needed.
    `.trim();

    return context;
  }

  // Smart file filtering for large projects
  filterRelevantFiles(
    files: ProjectFile[], 
    currentTask: string, 
    activeFile: ProjectFile,
    config: CompressionConfig
  ): ProjectFile[] {
    const safeFiles = files || [];
    const safeConfig = config || { maxFiles: 50 };

    if (safeFiles.length <= safeConfig.maxFiles) {
      return safeFiles;
    }

    // Priority files (always include)
    const priorityFiles = safeFiles.filter(file => 
      file && file.name && (
        file.name === activeFile?.name ||
        file.name.includes('package.json') ||
        file.name.includes('requirements.txt') ||
        file.name.includes('config.') ||
        file.name.includes('index.') ||
        file.name.includes('main.') ||
        file.name.includes('app.')
      )
    );

    // Task-relevant files
    const taskKeywords = this.extractKeywords(currentTask);
    const relevantFiles = safeFiles.filter(file => 
      file && file.name && file.content &&
      taskKeywords.some(keyword => 
        file.name.toLowerCase().includes(keyword) ||
        file.content.toLowerCase().includes(keyword)
      )
    );

    // Combine and deduplicate
    const combined = [...new Set([...priorityFiles, ...relevantFiles])];

    // If still too many, take the most recently modified or important files
    if (combined.length > safeConfig.maxFiles) {
      return combined.slice(0, safeConfig.maxFiles);
    }

    return combined;
  }

  // Private helper methods with proper error handling

  private analyzeProjectStructure(files: ProjectFile[]): any {
    const safeFiles = files || [];
    
    // FIXED: Proper reduce with initial value and null checks
    const fileTypes = safeFiles.reduce((acc: Record<string, number>, file) => {
      if (!file || !file.name) return acc;
      
      const ext = file.name.split('.').pop() || 'other';
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {});

    const hasBackend = safeFiles.some(f => 
      f && f.name && (
        f.name.includes('server.') || 
        f.name.includes('api.') || 
        f.name.includes('.py') ||
        f.name.includes('.java')
      )
    );

    const hasFrontend = safeFiles.some(f => 
      f && f.name && (
        f.name.includes('.html') || 
        f.name.includes('.js') || 
        f.name.includes('.css') ||
        f.name.includes('react') ||
        f.name.includes('vue')
      )
    );

    return {
      architecture: hasBackend && hasFrontend ? 'fullstack' : 
                   hasBackend ? 'backend' : 
                   hasFrontend ? 'frontend' : 'unknown',
      fileTypes,
      totalFiles: safeFiles.length
    };
  }

  private identifyKeyFiles(files: ProjectFile[]): ProjectFile[] {
    const safeFiles = files || [];
    
    const keyPatterns = [
      /package\.json$/,
      /requirements\.txt$/,
      /^index\./,
      /^main\./,
      /^app\./,
      /^server\./,
      /^config\./,
      /\.env/,
      /README\.md/i,
      /^src\/index\./,
      /^src\/main\./
    ];

    return safeFiles.filter(file => 
      file && file.name && 
      keyPatterns.some(pattern => pattern.test(file.name))
    ).slice(0, 10);
  }

  private extractDependencies(files: ProjectFile[]): string[] {
    const dependencies: string[] = [];
    const safeFiles = files || [];

    safeFiles.forEach(file => {
      if (!file || !file.content) return;

      // Check package.json for Node.js projects
      if (file.name === 'package.json') {
        try {
          const pkg = JSON.parse(file.content);
          if (pkg.dependencies && typeof pkg.dependencies === 'object') {
            dependencies.push(...Object.keys(pkg.dependencies));
          }
          if (pkg.devDependencies && typeof pkg.devDependencies === 'object') {
            dependencies.push(...Object.keys(pkg.devDependencies));
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Check requirements.txt for Python projects
      if (file.name === 'requirements.txt') {
        const requirements = file.content.split('\n')
          .filter(line => line.trim() && !line.trim().startsWith('#'))
          .map(line => line.split('==')[0].split('>=')[0].trim())
          .filter(Boolean);
        dependencies.push(...requirements);
      }

      // Check import statements
      const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
      const imports = file.content.match(importRegex) || [];
      
      imports.forEach(imp => {
        const match = imp.match(/(?:import|from)\s+['"]([^'"]+)['"]/);
        if (match && match[1] && !match[1].startsWith('.')) {
          dependencies.push(match[1].split('/')[0]);
        }
      });
    });

    return [...new Set(dependencies)].slice(0, 15); // Remove duplicates and limit
  }

  private findEntryPoints(files: ProjectFile[]): string[] {
    const safeFiles = files || [];
    
    return safeFiles
      .filter(file => file && file.name && (
        file.name.includes('index.') || 
        file.name.includes('main.') || 
        file.name.includes('app.') ||
        file.name.includes('Server.') ||
        file.name.includes('server.')
      ))
      .map(f => f.name)
      .slice(0, 5);
  }

  private createProjectSummary(
    structure: any, 
    keyFiles: ProjectFile[], 
    dependencies: string[], 
    entryPoints: string[]
  ): string {
    const safeStructure = structure || { architecture: 'unknown', totalFiles: 0, fileTypes: {} };
    const safeKeyFiles = keyFiles || [];
    const safeDependencies = dependencies || [];
    const safeEntryPoints = entryPoints || [];

    return `
${safeStructure.architecture.toUpperCase()} project with ${safeStructure.totalFiles} files.
Key technologies: ${Object.keys(safeStructure.fileTypes).slice(0, 5).join(', ')}
Main entry points: ${safeEntryPoints.join(', ')}
Key configuration: ${safeKeyFiles.map(f => f.name).join(', ')}
${safeDependencies.length > 0 ? `Dependencies: ${safeDependencies.slice(0, 8).join(', ')}` : 'No external dependencies detected'}
    `.trim();
  }

  private analyzeFile(file: ProjectFile): FileSummary {
    if (!file) {
      return this.createFallbackFileSummary(file);
    }

    const content = file.content || '';
    const lines = content.split('\n');
    const size = content.length;

    // Simple complexity analysis
    let complexity: 'low' | 'medium' | 'high' = 'low';
    if (size > 1000) complexity = 'medium';
    if (size > 5000) complexity = 'high';

    // Extract key functions/methods
    const functionRegex = /(?:function|def|class|const|let|var)\s+(\w+)/g;
    const functions: string[] = [];
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      if (match[1] && functions.length < 5) {
        functions.push(match[1]);
      }
    }

    // Determine purpose based on content and filename
    const purpose = this.determineFilePurpose(file.name || 'unknown', content);

    // Extract dependencies from this file
    const importRegex = /(?:import|from|require)\s+['"]([^'"]+)['"]/g;
    const fileDependencies: string[] = [];
    let importMatch;
    while ((importMatch = importRegex.exec(content)) !== null) {
      if (importMatch[1] && !importMatch[1].startsWith('.')) {
        fileDependencies.push(importMatch[1].split('/')[0]);
      }
    }

    return {
      fileId: file.id || this.generateUUID(),
      fileName: file.name || 'unknown',
      summary: `${file.name}: ${purpose} (${complexity} complexity)`,
      purpose,
      keyFunctions: functions,
      dependencies: [...new Set(fileDependencies)],
      complexity
    };
  }

  private determineFilePurpose(filename: string, content: string): string {
    const lowerContent = content.toLowerCase();
    const lowerFilename = filename.toLowerCase();

    if (lowerFilename.includes('test') || lowerContent.includes('describe(') || lowerContent.includes('it(')) {
      return 'Testing';
    }
    if (lowerFilename.includes('component') || lowerContent.includes('react') || lowerContent.includes('vue')) {
      return 'UI Component';
    }
    if (lowerFilename.includes('util') || lowerFilename.includes('helper')) {
      return 'Utility functions';
    }
    if (lowerFilename.includes('api') || lowerFilename.includes('route') || lowerContent.includes('app.get(')) {
      return 'API routes';
    }
    if (lowerFilename.includes('config') || lowerFilename.includes('setting')) {
      return 'Configuration';
    }
    if (lowerFilename.includes('style') || lowerFilename.endsWith('.css')) {
      return 'Styling';
    }
    if (lowerContent.includes('class ') || lowerContent.includes('interface ')) {
      return 'Class/Interface definition';
    }
    if (lowerContent.includes('function ') || lowerContent.includes('const ')) {
      return 'Function definitions';
    }

    return 'General code file';
  }

  private extractKeywords(text: string): string[] {
    if (!text) return [];
    
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    return text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2 && !commonWords.has(word))
      .slice(0, 10);
  }

  // Helper methods for fallbacks and UUID generation
  private createFallbackSummary(projectId: string, files: ProjectFile[]): ProjectSummary {
    const safeFiles = files || [];
    return {
      id: this.generateUUID(),
      projectId,
      summary: `Project with ${safeFiles.length} files including ${safeFiles.slice(0, 3).map(f => f.name).join(', ')}`,
      keyFiles: safeFiles.slice(0, 5).map(f => f.name),
      architecture: 'unknown',
      dependencies: [],
      entryPoints: safeFiles.filter(f => 
        f && f.name && (
          f.name.includes('index.') || 
          f.name.includes('main.') || 
          f.name.includes('app.')
        )
      ).map(f => f.name),
      timestamp: Date.now()
    };
  }

  private createFallbackFileSummary(file: ProjectFile): FileSummary {
    return {
      fileId: file?.id || this.generateUUID(),
      fileName: file?.name || 'unknown',
      summary: `${file?.name || 'unknown'}: Fallback summary`,
      purpose: 'Unknown purpose',
      keyFunctions: [],
      dependencies: [],
      complexity: 'low'
    };
  }

  // NEW: Intelligent file chunking for large files
  chunkLargeFile(file: ProjectFile, maxChunkSize: number = 500): Array<{section: string, lineStart: number, lineEnd: number, summary: string}> {
    if (!file || !file.content) return [];
    
    const lines = file.content.split('\n');
    const chunks: Array<{section: string, lineStart: number, lineEnd: number, summary: string}> = [];
    
    // If file is small enough, return as single chunk
    if (lines.length <= maxChunkSize) {
      return [{
        section: file.content,
        lineStart: 1,
        lineEnd: lines.length,
        summary: this.summarizeSection(file.content, file.name)
      }];
    }
    
    // For large files, chunk by logical sections
    let currentChunk: string[] = [];
    let chunkStartLine = 1;
    let inFunction = false;
    let braceCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk.push(line);
      
      // Track function/class boundaries
      if (line.match(/^(class|function|const\s+\w+\s*=|def\s+|public\s+|private\s+)/)) {
        inFunction = true;
      }
      
      // Count braces to detect end of blocks
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      
      // Create chunk when we hit max size or end of logical block
      const shouldChunk = currentChunk.length >= maxChunkSize || 
                         (inFunction && braceCount === 0 && currentChunk.length > 50);
      
      if (shouldChunk) {
        const chunkContent = currentChunk.join('\n');
        chunks.push({
          section: chunkContent,
          lineStart: chunkStartLine,
          lineEnd: i + 1,
          summary: this.summarizeSection(chunkContent, file.name)
        });
        
        currentChunk = [];
        chunkStartLine = i + 2;
        inFunction = false;
      }
    }
    
    // Add remaining lines
    if (currentChunk.length > 0) {
      chunks.push({
        section: currentChunk.join('\n'),
        lineStart: chunkStartLine,
        lineEnd: lines.length,
        summary: this.summarizeSection(currentChunk.join('\n'), file.name)
      });
    }
    
    return chunks;
  }
  
  private summarizeSection(code: string, fileName: string): string {
    const lines = code.split('\n').filter(l => l.trim());
    if (lines.length === 0) return 'Empty section';
    
    // Extract key elements
    const functions = code.match(/(?:function|const)\s+(\w+)|def\s+(\w+)|class\s+(\w+)/g) || [];
    const imports = code.match(/import\s+.*from|require\(|from\s+\w+\s+import/g) || [];
    const exports = code.match(/export\s+(default\s+)?(class|function|const)/g) || [];
    
    const parts = [];
    if (imports.length > 0) parts.push(`${imports.length} imports`);
    if (functions.length > 0) parts.push(`${functions.length} definitions`);
    if (exports.length > 0) parts.push(`${exports.length} exports`);
    
    return parts.length > 0 ? parts.join(', ') : 'Code section';
  }

  // ==========================================
  // INCREMENTAL CONTEXT METHODS
  // ==========================================

  /**
   * Get context optimized for incremental conversations
   * Returns only new files + summary of previously seen context
   */
  getIncrementalProjectContext(
    projectId: string,
    allFiles: ProjectFile[],
    currentTask: string,
    config?: Partial<CompressionConfig>
  ): { 
    newFiles: ProjectFile[], 
    contextSummary: string,
    shouldSendFull: boolean 
  } {
    // Decide whether to send full or incremental context
    const shouldSendFull = this.contextTracker.shouldSendFullContext(projectId, currentTask);
    
    if (shouldSendFull) {
      // Send full context and track it
      this.contextTracker.trackTask(projectId, currentTask);
      this.contextTracker.markFilesSeen(projectId, allFiles.map(f => f.name));
      
      return {
        newFiles: allFiles,
        contextSummary: 'Full project context provided.',
        shouldSendFull: true
      };
    } else {
      // Send only incremental context
      const { newFiles, contextSummary } = this.contextTracker.getIncrementalContext(
        projectId,
        allFiles,
        currentTask
      );
      
      // Track new task and new files
      this.contextTracker.trackTask(projectId, currentTask);
      this.contextTracker.markFilesSeen(projectId, newFiles.map(f => f.name));
      
      return {
        newFiles,
        contextSummary,
        shouldSendFull: false
      };
    }
  }

  /**
   * Reset context tracking for a project (useful for new sessions)
   */
  resetProjectContext(projectId: string): void {
    this.contextTracker.reset(projectId);
    this.cache.invalidate(projectId);
  }

  /**
   * Get smart context: Uses all improvements together
   * This is the recommended method to use
   */
  async getSmartProjectContext(
    project: Project,
    currentTask: string,
    config?: Partial<CompressionConfig>
  ): Promise<{
    summary: ProjectSummary | string,
    relevantFiles: ProjectFile[],
    framework: string,
    incrementalContext: string
  }> {
    console.log('🧠 Getting smart project context with all improvements...');
    
    // 1. Get incremental context (only new files if continuing conversation)
    const { newFiles, contextSummary, shouldSendFull } = this.getIncrementalProjectContext(
      project.id,
      project.files,
      currentTask,
      config
    );
    
    // 2. Detect framework (cached)
    const framework = this.detectFramework(project.files);
    
    // 3. Find semantically relevant files from the new/all files
    const filesToAnalyze = shouldSendFull ? project.files : newFiles;
    const relevantFiles = this.findRelevantFilesSemanticly(
      currentTask,
      filesToAnalyze,
      config?.maxFiles || 10
    );
    
    // 4. Generate intelligent summary (with LLM and caching)
    // Note: This would need an LLM client in production. For now, use basic summary.
    const summary = await this.generateProjectSummary(
      { ...project, files: relevantFiles },
      relevantFiles,
      config
    );
    
    console.log('✅ Smart context ready:', {
      framework,
      relevantFiles: relevantFiles.length,
      incrementalMode: !shouldSendFull,
      newFiles: newFiles.length
    });
    
    return {
      summary,
      relevantFiles,
      framework: framework?.name || 'Unknown',
      incrementalContext: contextSummary
    };
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Export singleton instance
export const contextService = ContextService.getInstance();