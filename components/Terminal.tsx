import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { X, Play, Trash2, Scroll, Bot, Terminal as TerminalIcon } from 'lucide-react';
import { useTerminal } from '../hooks/useTerminal';
import { ProjectFile, ThemeConfig } from '../types';

interface TerminalProps {
  files: ProjectFile[];
  theme: ThemeConfig;
  onAIHelpRequest?: (errorLogs: string) => void;
  className?: string;
}

export interface TerminalHandle {
  openTerminal: () => void;
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(({ 
  files, 
  theme, 
  onAIHelpRequest,
  className = '' 
}, ref) => {
  const {
    state,
    outputEndRef,
    inputRef,
    executeCommand,
    setInput,
    navigateHistory,
    toggleTerminal,
    openTerminal,
    closeTerminal,
    clearOutput,
    toggleAutoScroll,
    getAIHelp,
    hasErrors,
    lastError
  } = useTerminal(files);

  // Expose openTerminal to parent via ref
  useImperativeHandle(ref, () => ({
    openTerminal
  }));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand(state.input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateHistory('up');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHistory('down');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Basic tab completion could be added here
    }
  };

  const handleAIHelp = () => {
    const errorText = getAIHelp();
    if (errorText && onAIHelpRequest) {
      onAIHelpRequest(errorText);
    }
  };

  // Quick action buttons
  const quickActions = [
    {
      label: 'Run Project',
      command: 'run',
      icon: Play,
      description: 'Execute main file'
    },
    {
      label: 'List Files',
      command: 'ls',
      icon: TerminalIcon,
      description: 'Show all project files'
    },
    {
      label: 'Clear',
      command: 'clear',
      icon: Trash2,
      description: 'Clear terminal'
    }
  ];

  // Terminal now only accessible from top bar icon
  if (!state.isOpen) {
    return null;
  }

  return (
    <div className={`
      fixed inset-0 z-50 flex flex-col bg-black bg-opacity-90 backdrop-blur-sm
      ${className}
    `}>
      {/* Header */}
      <div className={`
        flex items-center justify-between px-4 py-3 border-b
        ${theme.border} ${theme.bgPanelHeader}
      `}>
        <div className="flex items-center gap-3">
          <TerminalIcon className={`w-5 h-5 ${theme.textMain}`} />
          <h3 className={`font-semibold ${theme.textMain}`}>
            Code Terminal
          </h3>
          <div className="flex items-center gap-2">
            {state.isExecuting && (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-green-400">Executing...</span>
              </div>
            )}
            <button
              onClick={toggleAutoScroll}
              className={`p-1 rounded ${state.autoScroll ? 'bg-green-500' : 'bg-gray-600'}`}
              title="Auto-scroll"
            >
              <Scroll className="w-3 h-3 text-white" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Actions */}
          <div className="flex items-center gap-1 mr-4">
            {quickActions.map((action) => (
              <button
                key={action.command}
                onClick={() => executeCommand(action.command)}
                className={`
                  flex items-center gap-1 px-2 py-1 text-xs rounded border
                  transition-colors hover:bg-white hover:bg-opacity-10
                  ${theme.border} ${theme.textMuted}
                `}
                title={action.description}
              >
                <action.icon className="w-3 h-3" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>

          {/* AI Help Button */}
          {hasErrors && (
            <button
              onClick={handleAIHelp}
              className={`
                flex items-center gap-2 px-3 py-1 rounded border
                transition-colors hover:bg-blue-500 hover:bg-opacity-20
                ${theme.border} ${theme.textMain}
              `}
              title="Get AI help for errors"
            >
              <Bot className="w-4 h-4" />
              <span className="text-sm">AI Help</span>
            </button>
          )}

          <button
            onClick={closeTerminal}
            className={`
              p-1 rounded transition-colors hover:bg-white hover:bg-opacity-10
              ${theme.textMuted}
            `}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Output Area */}
      <div className="flex-1 overflow-auto font-mono text-sm p-4 space-y-1">
        {state.output.length === 0 ? (
          <div className="text-gray-500 italic">
            No output yet. Type 'help' to see available commands.
          </div>
        ) : (
          state.output.map((line, index) => (
            <div
              key={index}
              className={`
                whitespace-pre-wrap break-words
                ${line.type === 'error' ? 'text-red-400' : 
                  line.type === 'info' ? 'text-blue-400' : 
                  'text-green-400'}
              `}
            >
              {line.text}
            </div>
          ))
        )}
        
        {/* Execution in progress */}
        {state.isExecuting && (
          <div className="flex items-center gap-2 text-yellow-400">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
            <span>Executing...</span>
          </div>
        )}

        {/* Input line */}
        <div className="flex items-center gap-2 mt-2">
          <span className="text-green-400">$</span>
          <input
            ref={inputRef}
            type="text"
            value={state.input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={state.isExecuting}
            placeholder={state.isExecuting ? "Executing..." : "Type a command..."}
            className={`
              flex-1 bg-transparent outline-none border-none
              ${state.isExecuting ? 'text-gray-500' : 'text-white'}
              placeholder-gray-500
            `}
          />
        </div>

        <div ref={outputEndRef} />
      </div>

      {/* Footer with tips */}
      <div className={`
        px-4 py-2 border-t text-xs
        ${theme.border} ${theme.bgPanelHeader} ${theme.textMuted}
      `}>
        <div className="flex items-center justify-between">
          <span>
            Tip: Use ↑↓ arrows for command history • Tab for auto-completion
          </span>
          <span>
            {state.output.length} lines • {state.commandHistory.length} commands
          </span>
        </div>
      </div>
    </div>
  );
});

Terminal.displayName = 'Terminal';

export default Terminal;