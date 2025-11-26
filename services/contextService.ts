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

  // Generate project summary
  async generateProjectSummary(
    project: Project, 
    files: ProjectFile[], 
    llmConfig: any
  ): Promise<ProjectSummary> {
    try {
      // Analyze project structure
      const structure = this.analyzeProjectStructure(files);
      const keyFiles = this.identifyKeyFiles(files);
      const dependencies = this.extractDependencies(files);
      const entryPoints = this.findEntryPoints(files);

      // Create a concise summary
      const summary = this.createProjectSummary(structure, keyFiles, dependencies, entryPoints);

      return {
        id: crypto.randomUUID(),
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
      // Fallback summary
      return {
        id: crypto.randomUUID(),
        projectId: project.id,
        summary: `Project with ${files.length} files including ${files.map(f => f.name).join(', ')}`,
        keyFiles: files.slice(0, 5).map(f => f.name),
        architecture: 'unknown',
        dependencies: [],
        entryPoints: files.filter(f => 
          f.name.includes('index.') || f.name.includes('main.') || f.name.includes('app.')
        ).map(f => f.name),
        timestamp: Date.now()
      };
    }
  }

  // Generate file summaries
  async generateFileSummaries(files: ProjectFile[]): Promise<FileSummary[]> {
    return files.map(file => this.analyzeFile(file));
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
    const context = `
PROJECT CONTEXT SUMMARY:
${projectSummary.summary}

ARCHITECTURE: ${projectSummary.architecture}

KEY FILES:
${projectSummary.keyFiles.map(file => `- ${file}`).join('\n')}

DEPENDENCIES:
${projectSummary.dependencies.length > 0 ? projectSummary.dependencies.join(', ') : 'None detected'}

ENTRY POINTS:
${projectSummary.entryPoints.join(', ')}

FILE SUMMARIES:
${fileSummaries.slice(0, 10).map(summary => `
${summary.fileName}:
  Purpose: ${summary.purpose}
  Key Functions: ${summary.keyFunctions.slice(0, 3).join(', ')}
  Complexity: ${summary.complexity}
`).join('\n')}

CURRENT TASK: ${currentTask}

RECENT CONVERSATION:
${conversationHistory.slice(-3).join('\n\n')}

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
    if (files.length <= config.maxFiles) {
      return files;
    }

    // Priority files (always include)
    const priorityFiles = files.filter(file => 
      file.name === activeFile.name ||
      file.name.includes('package.json') ||
      file.name.includes('requirements.txt') ||
      file.name.includes('config.') ||
      file.name.includes('index.') ||
      file.name.includes('main.') ||
      file.name.includes('app.')
    );

    // Task-relevant files
    const taskKeywords = this.extractKeywords(currentTask);
    const relevantFiles = files.filter(file => 
      taskKeywords.some(keyword => 
        file.name.toLowerCase().includes(keyword) ||
        file.content.toLowerCase().includes(keyword)
      )
    );

    // Combine and deduplicate
    const combined = [...new Set([...priorityFiles, ...relevantFiles])];
    
    // If still too many, take the most recently modified or important files
    if (combined.length > config.maxFiles) {
      return combined.slice(0, config.maxFiles);
    }

    return combined;
  }

  // Private helper methods
  private analyzeProjectStructure(files: ProjectFile[]): any {
    const fileTypes = files.reduce((acc, file) => {
      const ext = file.name.split('.').pop() || 'other';
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const hasBackend = files.some(f => 
      f.name.includes('server.') || 
      f.name.includes('api.') || 
      f.name.includes('.py') ||
      f.name.includes('.java')
    );

    const hasFrontend = files.some(f => 
      f.name.includes('.html') || 
      f.name.includes('.js') || 
      f.name.includes('.css') ||
      f.name.includes('react') ||
      f.name.includes('vue')
    );

    return {
      architecture: hasBackend && hasFrontend ? 'fullstack' : 
                   hasBackend ? 'backend' : 
                   hasFrontend ? 'frontend' : 'unknown',
      fileTypes,
      totalFiles: files.length
    };
  }

  private identifyKeyFiles(files: ProjectFile[]): ProjectFile[] {
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

    return files.filter(file => 
      keyPatterns.some(pattern => pattern.test(file.name))
    ).slice(0, 10);
  }

  private extractDependencies(files: ProjectFile[]): string[] {
    const dependencies: string[] = [];
    
    files.forEach(file => {
      // Check package.json for Node.js projects
      if (file.name === 'package.json') {
        try {
          const pkg = JSON.parse(file.content);
          if (pkg.dependencies) {
            dependencies.push(...Object.keys(pkg.dependencies));
          }
          if (pkg.devDependencies) {
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
          .map(line => line.split('==')[0].split('>=')[0]);
        dependencies.push(...requirements);
      }

      // Check import statements
      const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
      const imports = file.content.match(importRegex);
      if (imports) {
        imports.forEach(imp => {
          const match = imp.match(/(?:import|from)\s+['"]([^'"]+)['"]/);
          if (match && !match[1].startsWith('.')) {
            dependencies.push(match[1].split('/')[0]);
          }
        });
      }
    });

    return [...new Set(dependencies)].slice(0, 15); // Remove duplicates and limit
  }

  private findEntryPoints(files: ProjectFile[]): string[] {
    return files.filter(file => 
      file.name.includes('index.') || 
      file.name.includes('main.') || 
      file.name.includes('app.') ||
      file.name.includes('Server.') ||
      file.name.includes('server.')
    ).map(f => f.name).slice(0, 5);
  }

  private createProjectSummary(
    structure: any, 
    keyFiles: ProjectFile[], 
    dependencies: string[], 
    entryPoints: string[]
  ): string {
    return `
${structure.architecture.toUpperCase()} project with ${structure.totalFiles} files.
Key technologies: ${Object.keys(structure.fileTypes).slice(0, 5).join(', ')}
Main entry points: ${entryPoints.join(', ')}
Key configuration: ${keyFiles.map(f => f.name).join(', ')}
${dependencies.length > 0 ? `Dependencies: ${dependencies.slice(0, 8).join(', ')}` : 'No external dependencies detected'}
    `.trim();
  }

  private analyzeFile(file: ProjectFile): FileSummary {
    const content = file.content;
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
      if (functions.length < 5) { // Limit to 5 key functions
        functions.push(match[1]);
      }
    }

    // Determine purpose based on content and filename
    const purpose = this.determineFilePurpose(file.name, content);

    // Extract dependencies from this file
    const importRegex = /(?:import|from|require)\s+['"]([^'"]+)['"]/g;
    const fileDependencies: string[] = [];
    let importMatch;
    while ((importMatch = importRegex.exec(content)) !== null) {
      if (!importMatch[1].startsWith('.')) {
        fileDependencies.push(importMatch[1].split('/')[0]);
      }
    }

    return {
      fileId: file.id,
      fileName: file.name,
      summary: `${file.name}: ${purpose} (${complexity} complexity)`,
      purpose,
      keyFunctions: functions,
      dependencies: [...new Set(fileDependencies)], // Remove duplicates
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
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    return text.toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2 && !commonWords.has(word))
      .slice(0, 10);
  }
}

// Export singleton instance
export const contextService = ContextService.getInstance();