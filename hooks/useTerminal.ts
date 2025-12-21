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

  // Initialize execution service on mount
  useEffect(() => {
    const initExecutionService = async () => {
      try {
        await executionService.initialize();
        console.log('✅ Execution service initialized');
      } catch (error) {
        console.warn('Execution service initialization failed:', error);
      }
    };
    initExecutionService();
  }, []);

  // Save custom commands to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('cm_custom_terminal_commands', JSON.stringify(customCommands));
  }, [customCommands]);

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
        
        case 'addcmd':
          executeAddCustomCommand(args);
          break;
        
        case 'listcmds':
          executeListCustomCommands();
          break;
        
        case 'removecmd':
          executeRemoveCustomCommand(args[0]);
          break;
        
        default:
          // Check if it's a custom command
          if (customCommands[cmd]) {
            executeCustomCommand(cmd, args);
          } else {
            addOutput(`Command not found: ${cmd}. Type 'help' for available commands.`, 'error');
          }
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
      { command: 'help', description: 'Show this help message' },
      { command: 'addcmd <name> <script>', description: 'Add a custom command' },
      { command: 'listcmds', description: 'List all custom commands' },
      { command: 'removecmd <name>', description: 'Remove a custom command' }
    ];

    addOutput('Available Commands:', 'info');
    addOutput('─'.repeat(60));
    commands.forEach(({ command, description }) => {
      addOutput(`  ${command.padEnd(25)} ${description}`);
    });
    addOutput('─'.repeat(60));
    
    const customCmdCount = Object.keys(customCommands).length;
    if (customCmdCount > 0) {
      addOutput(`\nYou have ${customCmdCount} custom command(s). Type 'listcmds' to see them.`, 'info');
    }
  }, [addOutput, customCommands]);

  // Add custom command
  const executeAddCustomCommand = useCallback((args: string[]) => {
    if (args.length < 2) {
      addOutput('Usage: addcmd <name> <script>', 'error');
      addOutput('Example: addcmd hello echo "Hello World"', 'info');
      return;
    }

    const [name, ...scriptParts] = args;
    const script = scriptParts.join(' ');

    if (name.match(/^(run|ls|dir|cat|type|clear|help|addcmd|listcmds|removecmd)$/)) {
      addOutput(`Cannot override built-in command: ${name}`, 'error');
      return;
    }

    setCustomCommands(prev => ({ ...prev, [name]: script }));
    addOutput(`✅ Custom command '${name}' added successfully!`, 'info');
    addOutput(`   Run it by typing: ${name}`, 'info');
  }, [addOutput]);

  // List custom commands
  const executeListCustomCommands = useCallback(() => {
    const cmds = Object.entries(customCommands);
    
    if (cmds.length === 0) {
      addOutput('No custom commands defined.', 'info');
      addOutput('Add one with: addcmd <name> <script>', 'info');
      return;
    }

    addOutput('Custom Commands:', 'info');
    addOutput('─'.repeat(60));
    cmds.forEach(([name, script]) => {
      addOutput(`  ${name.padEnd(20)} → ${script}`);
    });
    addOutput('─'.repeat(60));
    addOutput(`Total: ${cmds.length} custom command(s)`, 'info');
  }, [addOutput, customCommands]);

  // Remove custom command
  const executeRemoveCustomCommand = useCallback((name: string) => {
    if (!name) {
      addOutput('Usage: removecmd <name>', 'error');
      return;
    }

    if (!customCommands[name]) {
      addOutput(`Custom command not found: ${name}`, 'error');
      return;
    }

    setCustomCommands(prev => {
      const newCmds = { ...prev };
      delete newCmds[name];
      return newCmds;
    });
    addOutput(`✅ Custom command '${name}' removed`, 'info');
  }, [addOutput, customCommands]);

  // Execute custom command
  const executeCustomCommand = useCallback(async (name: string, args: string[]) => {
    const script = customCommands[name];
    addOutput(`Executing custom command: ${name}`, 'info');
    
    // Replace placeholders in script
    let processedScript = script;
    args.forEach((arg, index) => {
      processedScript = processedScript.replace(`$${index + 1}`, arg);
      processedScript = processedScript.replace('$*', args.join(' '));
    });

    // Execute the script as a command
    const [cmd, ...cmdArgs] = processedScript.split(/\s+/);
    
    switch (cmd.toLowerCase()) {
      case 'echo':
        addOutput(cmdArgs.join(' '));
        break;
      case 'run':
        await executeCodeCommand('run', cmdArgs);
        break;
      case 'ls':
      case 'dir':
        executeListCommand();
        break;
      case 'cat':
        executeCatCommand(cmdArgs[0]);
        break;
      default:
        addOutput(`Custom command output: ${processedScript}`);
    }
  }, [customCommands, addOutput]);

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
    
    // Custom commands
    customCommands,
    
    // Derived state
    hasErrors: state.output.some(line => line.type === 'error'),
    lastError: state.output.slice().reverse().find(line => line.type === 'error')?.text
  };
};
