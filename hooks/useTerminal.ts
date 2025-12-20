import { useState, useRef, useCallback, useEffect } from 'react';
import { executionService } from '../services/executionService';
import { ProjectFile, ExecutionResult, TerminalState, TerminalCommand } from '../types';

export const useTerminal = (projectFiles: ProjectFile[] = []) => {
  const [state, setState] = useState<TerminalState>({
    isOpen: false,
    isExecuting: false,
    output: [],
    currentDirectory: '/project',
    commandHistory: [],
    historyIndex: -1,
    input: '',
    autoScroll: true
  });

  // Custom commands from localStorage
  const [customCommands, setCustomCommands] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('cm_custom_terminal_commands');
    return saved ? JSON.parse(saved) : {};
  });

  const outputEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (state.autoScroll && outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.output, state.autoScroll]);

  // Focus input when terminal opens
  useEffect(() => {
    if (state.isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state.isOpen]);

  // Add output line
  const addOutput = useCallback((line: string, type: 'output' | 'error' | 'info' = 'output') => {
    setState(prev => ({
      ...prev,
      output: [...prev.output, { text: line, type, timestamp: Date.now() }]
    }));
  }, []);

  // Execute a command
  const executeCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;

    // Add command to output
    addOutput(`$ ${command}`, 'info');

    // Add to command history
    setState(prev => ({
      ...prev,
      commandHistory: [...prev.commandHistory, command],
      historyIndex: -1,
      input: ''
    }));

    // Set executing state
    setState(prev => ({ ...prev, isExecuting: true }));

    try {
      // Parse command
      const [cmd, ...args] = command.trim().split(/\s+/);
      
      switch (cmd.toLowerCase()) {
        case 'run':
        case 'node':
        case 'python':
          await executeCodeCommand(cmd, args);
          break;
        
        case 'ls':
        case 'dir':
          executeListCommand();
          break;
        
        case 'cat':
        case 'type':
          executeCatCommand(args[0]);
          break;
        
        case 'clear':
          setState(prev => ({ ...prev, output: [] }));
          break;
        
        case 'help':
          executeHelpCommand();
          break;
        
        default:
          addOutput(`Command not found: ${cmd}. Type 'help' for available commands.`, 'error');
      }
    } catch (error: any) {
      addOutput(`Error: ${error.message}`, 'error');
    } finally {
      setState(prev => ({ ...prev, isExecuting: false }));
    }
  }, [addOutput, projectFiles]);

  // Execute code-related commands
  const executeCodeCommand = useCallback(async (cmd: string, args: string[]) => {
    const entryPoint = args[0];
    
    addOutput(`Executing ${entryPoint || 'main file'}...`, 'info');

    try {
      const result = await executionService.executeCode(projectFiles, entryPoint);
      
      if (result.success) {
        if (result.output) {
          addOutput(result.output);
        }
        addOutput(`✅ Execution completed in ${result.duration.toFixed(2)}ms`, 'info');
      } else {
        if (result.output) {
          addOutput(result.output);
        }
        if (result.error) {
          addOutput(result.error, 'error');
        }
        addOutput(`❌ Execution failed with exit code ${result.exitCode}`, 'error');
        
        // Offer AI assistance for errors
        if (result.error && result.error.includes('Error')) {
          addOutput('💡 Tip: Click the "Get AI Help" button to analyze this error', 'info');
        }
      }
    } catch (error: any) {
      addOutput(`Execution service error: ${error.message}`, 'error');
    }
  }, [projectFiles, addOutput]);

  // List files command
  const executeListCommand = useCallback(() => {
    if (projectFiles.length === 0) {
      addOutput('No files in project', 'info');
      return;
    }

    const fileList = projectFiles.map(file => {
      const size = file.content.length;
      const sizeStr = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
      return `${file.name.padEnd(30)} ${sizeStr.padStart(8)} ${file.language}`;
    });

    addOutput('Files in project:');
    fileList.forEach(file => addOutput(`  ${file}`));
    addOutput(`Total: ${projectFiles.length} files`);
  }, [projectFiles, addOutput]);

  // Display file content command
  const executeCatCommand = useCallback((filename: string) => {
    if (!filename) {
      addOutput('Usage: cat <filename>', 'error');
      return;
    }

    const file = projectFiles.find(f => f.name === filename);
    if (!file) {
      addOutput(`File not found: ${filename}`, 'error');
      return;
    }

    addOutput(`Content of ${filename}:`);
    addOutput('─'.repeat(50));
    
    const lines = file.content.split('\n');
    lines.forEach((line, index) => {
      addOutput(`${(index + 1).toString().padStart(4)}: ${line}`);
    });
    
    addOutput('─'.repeat(50));
    addOutput(`End of ${filename} (${lines.length} lines, ${file.content.length} bytes)`);
  }, [projectFiles, addOutput]);

  // Help command
  const executeHelpCommand = useCallback(() => {
    const commands = [
      { command: 'run [file]', description: 'Execute the main file or specified file' },
      { command: 'ls, dir', description: 'List all files in the project' },
      { command: 'cat <file>', description: 'Display content of a file' },
      { command: 'clear', description: 'Clear terminal output' },
      { command: 'help', description: 'Show this help message' }
    ];

    addOutput('Available commands:');
    commands.forEach(cmd => {
      addOutput(`  ${cmd.command.padEnd(15)} ${cmd.description}`);
    });
  }, [addOutput]);

  // Navigate command history
  const navigateHistory = useCallback((direction: 'up' | 'down') => {
    setState(prev => {
      if (prev.commandHistory.length === 0) return prev;

      let newIndex = prev.historyIndex;
      
      if (direction === 'up') {
        newIndex = newIndex < prev.commandHistory.length - 1 ? newIndex + 1 : prev.commandHistory.length - 1;
      } else {
        newIndex = newIndex > 0 ? newIndex - 1 : -1;
      }

      const newInput = newIndex >= 0 ? prev.commandHistory[prev.commandHistory.length - 1 - newIndex] : '';

      return {
        ...prev,
        historyIndex: newIndex,
        input: newInput
      };
    });
  }, []);

  // Update input
  const setInput = useCallback((input: string) => {
    setState(prev => ({ ...prev, input }));
  }, []);

  // Toggle terminal visibility
  const toggleTerminal = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      isOpen: !prev.isOpen,
      // Clear input when closing
      input: !prev.isOpen ? prev.input : ''
    }));
  }, []);

  // Open terminal with initial message
  const openTerminal = useCallback((initialMessage?: string) => {
    setState(prev => ({
      ...prev,
      isOpen: true,
      output: initialMessage ? [{ text: initialMessage, type: 'info', timestamp: Date.now() }] : prev.output
    }));
  }, []);

  // Close terminal
  const closeTerminal = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Clear terminal output
  const clearOutput = useCallback(() => {
    setState(prev => ({ ...prev, output: [] }));
  }, []);

  // Toggle auto-scroll
  const toggleAutoScroll = useCallback(() => {
    setState(prev => ({ ...prev, autoScroll: !prev.autoScroll }));
  }, []);

  // Get AI help for current error
  const getAIHelp = useCallback(() => {
    const lastError = state.output
      .slice()
      .reverse()
      .find(line => line.type === 'error');
    
    if (lastError) {
      addOutput('🔄 Requesting AI assistance for the error...', 'info');
      // This would trigger the AI chat with the error context
      return lastError.text;
    }
    
    addOutput('No recent errors found to analyze', 'info');
    return null;
  }, [state.output, addOutput]);

  return {
    // State
    state,
    
    // Refs
    outputEndRef,
    inputRef,
    
    // Actions
    executeCommand,
    setInput,
    navigateHistory,
    toggleTerminal,
    openTerminal,
    closeTerminal,
    clearOutput,
    toggleAutoScroll,
    getAIHelp,
    
    // Derived state
    hasErrors: state.output.some(line => line.type === 'error'),
    lastError: state.output.slice().reverse().find(line => line.type === 'error')?.text
  };
};
