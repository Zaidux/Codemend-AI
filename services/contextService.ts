import { Project, ProjectFile, ProjectSummary, FileSummary, CompressionConfig } from '../types';

// Context compression and summarization service
export class ContextService {
  private static instance: ContextService;

  public static getInstance(): ContextService {
    if (!ContextService.instance) {
      ContextService.instance = new ContextService();
    }
    return ContextService.instance;
  }

  // Generate project summary - FIXED: Added proper error handling and null checks
  async generateProjectSummary(
    project: Project, 
    files: ProjectFile[], 
    llmConfig: any
  ): Promise<ProjectSummary> {
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

      return {
        id: this.generateUUID(),
        projectId: project.id,
        summary,
        keyFiles: keyFiles.map(f => f.name),
        architecture: structure.architecture,
        dependencies,
        entryPoints,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error generating project summary:', error);
      return this.createFallbackSummary(project.id, files);
    }
  }

  // Generate file summaries with safe iteration
  async generateFileSummaries(files: ProjectFile[]): Promise<FileSummary[]> {
    if (!files || !Array.isArray(files)) {
      return [];
    }
    
    return files.map(file => {
      try {
        return this.analyzeFile(file);
      } catch (error) {
        console.error(`Error analyzing file ${file.name}:`, error);
        return this.createFallbackFileSummary(file);
      }
    });
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