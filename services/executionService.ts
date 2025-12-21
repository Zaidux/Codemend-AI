import { ProjectFile, CodeLanguage, ExecutionResult, ExecutionConfig } from '../types';

export class ExecutionService {
  private static instance: ExecutionService;
  private worker: Worker | null = null;
  private isInitialized = false;

  public static getInstance(): ExecutionService {
    if (!ExecutionService.instance) {
      ExecutionService.instance = new ExecutionService();
    }
    return ExecutionService.instance;
  }

  // Initialize the execution environment
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // For browser-based execution, we'll use a Web Worker for safety
      // In a real implementation, this would connect to a backend service
      this.worker = this.createWorker();
      this.isInitialized = true;
      console.log('Execution service initialized');
    } catch (error) {
      console.error('Failed to initialize execution service:', error);
      throw new Error('Execution environment not available');
    }
  }

  // Execute code based on file type
  async executeCode(
    files: ProjectFile[], 
    entryPoint?: string,
    config: ExecutionConfig = {}
  ): Promise<ExecutionResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const mainFile = this.findEntryPoint(files, entryPoint);
    if (!mainFile) {
      return {
        success: false,
        output: 'No executable file found. Please specify an entry point or ensure you have a main file.',
        error: 'NO_ENTRY_POINT',
        duration: 0
      };
    }

    try {
      switch (mainFile.language) {
        case CodeLanguage.JAVASCRIPT:
        case CodeLanguage.TYPESCRIPT:
          return await this.executeJavaScript(files, mainFile, config);
        
        case CodeLanguage.PYTHON:
          return await this.executePython(files, mainFile, config);
        
        case CodeLanguage.HTML:
          return await this.executeHTML(files, mainFile, config);
        
        default:
          return {
            success: false,
            output: `Execution for ${mainFile.language} files is not yet supported.`,
            error: 'UNSUPPORTED_LANGUAGE',
            duration: 0
          };
      }
    } catch (error: any) {
      return {
        success: false,
        output: `Execution failed: ${error.message}`,
        error: error.name || 'EXECUTION_ERROR',
        duration: 0
      };
    }
  }

  // Execute JavaScript/TypeScript code
  private async executeJavaScript(
    files: ProjectFile[], 
    mainFile: ProjectFile,
    config: ExecutionConfig
  ): Promise<ExecutionResult> {
    const startTime = performance.now();
    
    // FIXED: Declare output and errors arrays at function scope
    const output: string[] = [];
    const errors: string[] = [];
    
    try {
      // Create a safe execution environment

      // Override console methods to capture output
      const originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info
      };

      // Capture console output
      console.log = (...args) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        output.push(message);
        originalConsole.log(...args);
      };

      console.error = (...args) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        errors.push(`❌ ${message}`);
        originalConsole.error(...args);
      };

      console.warn = (...args) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        output.push(`⚠️ ${message}`);
        originalConsole.warn(...args);
      };
      
      console.info = (...args) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        output.push(`ℹ️ ${message}`);
        originalConsole.info(...args);
      };

      // Create a safe execution context
      const context = this.createSafeExecutionContext();

      try {
        // Execute the main file
        if (mainFile.language === CodeLanguage.TYPESCRIPT) {
          // For TypeScript, strip type annotations for basic execution
          const jsCode = this.stripTypeAnnotations(mainFile.content);
          await this.executeInContext(jsCode, context);
        } else {
          await this.executeInContext(mainFile.content, context);
        }

        // Restore original console methods
        console.log = originalConsole.log;
        console.error = originalConsole.error;
        console.warn = originalConsole.warn;
        console.info = originalConsole.info;

        const duration = performance.now() - startTime;

        return {
          success: errors.length === 0,
          output: output.length > 0 ? output.join('\n') : '(No output)',
          error: errors.length > 0 ? errors.join('\n') : undefined,
          duration,
          exitCode: errors.length > 0 ? 1 : 0
        };

      } catch (executionError: any) {
        // Restore console methods even on error
        console.log = originalConsole.log;
        console.error = originalConsole.error;
        console.warn = originalConsole.warn;
        console.info = originalConsole.info;

        // Provide detailed error information
        const errorName = executionError.name || 'Error';
        const errorMessage = executionError.message || 'Unknown error';
        const stackTrace = executionError.stack || '';
        
        errors.push(`${errorName}: ${errorMessage}`);
        if (stackTrace) {
          const stackLines = stackTrace.split('\n').slice(1, 5); // First few stack frames
          errors.push(...stackLines.map(line => '  ' + line.trim()));
        }

        const duration = performance.now() - startTime;

        return {
          success: false,
          output: output.join('\n'),
          error: errors.join('\n'),
          duration,
          exitCode: 1
        };
      }

    } catch (error: any) {
      const duration = performance.now() - startTime;
      return {
        success: false,
        output: output.join('\n'),
        error: `Execution Error: ${error.message}\n${error.stack || ''}`,
        duration,
        exitCode: 1
      };
    }
  }

  // Execute Python code (simulated - would connect to backend in production)
  private async executePython(
    files: ProjectFile[], 
    mainFile: ProjectFile,
    config: ExecutionConfig
  ): Promise<ExecutionResult> {
    // In a real implementation, this would send the code to a Python backend
    // For now, we'll simulate execution with basic syntax checking
    
    const startTime = performance.now();
    const output: string[] = [];
    const errors: string[] = [];

    try {
      // Basic Python syntax validation
      const lines = mainFile.content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for common Python syntax issues
        if (line.startsWith('print ') && !line.includes('(')) {
          output.push(`Line ${i + 1}: ${line.replace('print ', '')}`);
        } else if (line.includes('print(')) {
          // Extract what's inside print()
          const match = line.match(/print\((.*)\)/);
          if (match) {
            output.push(`Line ${i + 1}: ${match[1]}`);
          }
        }
        
        // Check for syntax errors
        if (line.endsWith(':') && lines[i + 1] && !lines[i + 1].startsWith(' ') && !lines[i + 1].startsWith('\t')) {
          errors.push(`IndentationError: expected an indented block at line ${i + 1}`);
        }
      }

      const duration = performance.now() - startTime;

      return {
        success: errors.length === 0,
        output: output.join('\n') || 'Python execution simulated - no output generated',
        error: errors.join('\n') || undefined,
        duration,
        exitCode: errors.length > 0 ? 1 : 0
      };

    } catch (error: any) {
      const duration = performance.now() - startTime;
      return {
        success: false,
        output: output.join('\n'),
        error: `Python Execution Error: ${error.message}`,
        duration,
        exitCode: 1
      };
    }
  }

  // Execute HTML (open in preview or return analysis)
  private async executeHTML(
    files: ProjectFile[], 
    mainFile: ProjectFile,
    config: ExecutionConfig
  ): Promise<ExecutionResult> {
    const startTime = performance.now();
    
    try {
      // Analyze HTML structure and dependencies
      const analysis = this.analyzeHTML(mainFile.content, files);
      
      const duration = performance.now() - startTime;

      return {
        success: true,
        output: `HTML Analysis Complete:\n- Elements: ${analysis.elementCount}\n- Scripts: ${analysis.scriptCount}\n- Styles: ${analysis.styleCount}\n- External Resources: ${analysis.externalResources.length}`,
        duration,
        exitCode: 0,
        metadata: {
          elementCount: analysis.elementCount,
          scriptCount: analysis.scriptCount,
          styleCount: analysis.styleCount,
          externalResources: analysis.externalResources
        }
      };

    } catch (error: any) {
      const duration = performance.now() - startTime;
      return {
        success: false,
        output: '',
        error: `HTML Analysis Error: ${error.message}`,
        duration,
        exitCode: 1
      };
    }
  }

  // Analyze HTML content
  private analyzeHTML(htmlContent: string, allFiles: ProjectFile[]): any {
    const elementCount = (htmlContent.match(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi) || []).length;
    const scriptCount = (htmlContent.match(/<script\b[^>]*>/gi) || []).length;
    const styleCount = (htmlContent.match(/<style\b[^>]*>/gi) || []).length;
    
    // Find external resources
    const externalResources: string[] = [];
    const srcMatches = htmlContent.match(/(src|href)=["']([^"']+)["']/gi) || [];
    
    srcMatches.forEach(match => {
      const url = match.replace(/(src|href)=["']/, '').replace(/["']$/, '');
      if (url && !url.startsWith('#') && !url.startsWith('javascript:')) {
        externalResources.push(url);
      }
    });

    return {
      elementCount,
      scriptCount,
      styleCount,
      externalResources
    };
  }

  // Find the appropriate entry point for execution
  private findEntryPoint(files: ProjectFile[], specifiedEntry?: string): ProjectFile | null {
    if (specifiedEntry) {
      return files.find(f => f.name === specifiedEntry) || null;
    }

    // Auto-detect entry points
    const entryPatterns = [
      /^index\.(js|ts|jsx|tsx|py)$/,
      /^main\.(js|ts|jsx|tsx|py)$/,
      /^app\.(js|ts|jsx|tsx|py)$/,
      /^server\.(js|ts|py)$/,
      /^App\.(js|ts|jsx|tsx)$/,
      /^Main\.(js|ts|jsx|tsx)$/
    ];

    for (const pattern of entryPatterns) {
      const file = files.find(f => pattern.test(f.name));
      if (file) return file;
    }

    // Return first executable file
    return files.find(f => 
      [CodeLanguage.JAVASCRIPT, CodeLanguage.TYPESCRIPT, CodeLanguage.PYTHON, CodeLanguage.HTML]
        .includes(f.language)
    ) || null;
  }

  // Create a safe execution context for JavaScript
  private createSafeExecutionContext(): any {
    const context = {
      // Allow basic globals
      console: console,
      setTimeout: setTimeout,
      setInterval: setInterval,
      clearTimeout: clearTimeout,
      clearInterval: clearInterval,
      Date: Date,
      Math: Math,
      JSON: JSON,
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      RegExp: RegExp,
      Promise: Promise,
      Map: Map,
      Set: Set,
      WeakMap: WeakMap,
      WeakSet: WeakSet,
      Error: Error,
      TypeError: TypeError,
      RangeError: RangeError,
      SyntaxError: SyntaxError,
      parseInt: parseInt,
      parseFloat: parseFloat,
      isNaN: isNaN,
      isFinite: isFinite,
      // Add other safe globals as needed
    };

    return context;
  }

  // Strip TypeScript type annotations for basic execution
  private stripTypeAnnotations(code: string): string {
    // Basic TypeScript stripping - remove common type annotations
    let jsCode = code;
    
    // Remove type annotations from variable declarations
    jsCode = jsCode.replace(/:\s*\w+(\[\])?(\s*=)/g, '$2');
    
    // Remove interface and type declarations
    jsCode = jsCode.replace(/interface\s+\w+\s*{[^}]*}/g, '');
    jsCode = jsCode.replace(/type\s+\w+\s*=\s*[^;]+;/g, '');
    
    // Remove function return type annotations
    jsCode = jsCode.replace(/\):\s*\w+(\[\])?\s*{/g, ') {');
    
    // Remove generic type parameters
    jsCode = jsCode.replace(/<[^>]+>/g, '');
    
    // Remove 'as' type assertions
    jsCode = jsCode.replace(/\s+as\s+\w+/g, '');
    
    return jsCode;
  }

  // Execute code in a safe context
  private async executeInContext(code: string, context: any): Promise<void> {
    try {
      // Create a function with the code and bind it to the safe context
      // We wrap the code in a function to create a clean scope
      const contextKeys = Object.keys(context);
      const contextValues = Object.values(context);
      
      const func = new Function(...contextKeys, `
        "use strict";
        ${code}
      `);

      // Execute with the safe context
      await func(...contextValues);
    } catch (error: any) {
      // Re-throw with better error message
      const enhancedError = new Error(error.message);
      enhancedError.name = error.name || 'RuntimeError';
      enhancedError.stack = error.stack;
      throw enhancedError;
    }
  }

  // Create Web Worker for safer execution (placeholder)
  private createWorker(): Worker {
    // In a real implementation, this would create a Web Worker
    // For now, we'll use a mock
    return {
      postMessage: () => {},
      terminate: () => {},
      onmessage: null,
      onerror: null
    } as any;
  }

  // Clean up resources
  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
  }
}

// Export singleton instance
export const executionService = ExecutionService.getInstance();