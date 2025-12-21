import * as React from 'react';
import { ThemeConfig } from '../types';

interface DiffViewerProps {
  original: string;
  modified: string;
  theme: ThemeConfig;
  fileName?: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  onScroll?: (scrollTop: number) => void;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ 
  original, 
  modified, 
  theme, 
  fileName,
  showLineNumbers = true,
  maxHeight = '400px',
  onScroll
}) => {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // FIXED: Add safety checks for undefined/null values
  const safeOriginal = original ?? '';
  const safeModified = modified ?? '';

  const originalLines = safeOriginal.split('\n');
  const modifiedLines = safeModified.split('\n');

  // Enhanced diff algorithm with change detection
  const computeDiff = () => {
    const diffLines: Array<{
      type: 'unchanged' | 'added' | 'deleted' | 'modified';
      oldLine?: string;
      newLine?: string;
      oldLineNumber?: number;
      newLineNumber?: number;
    }> = [];

    let oldIndex = 0;
    let newIndex = 0;
    let oldLineNum = 1;
    let newLineNum = 1;

    while (oldIndex < originalLines.length || newIndex < modifiedLines.length) {
      const oldLine = originalLines[oldIndex] || '';
      const newLine = modifiedLines[newIndex] || '';

      if (oldLine === newLine) {
        // Unchanged line
        diffLines.push({
          type: 'unchanged',
          oldLine,
          newLine,
          oldLineNumber: oldLineNum,
          newLineNumber: newLineNum
        });
        oldIndex++;
        newIndex++;
        oldLineNum++;
        newLineNum++;
      } else {
        // Look ahead to see if this is a modification or complete change
        const nextOldMatch = oldIndex + 1 < originalLines.length ? 
          modifiedLines.indexOf(originalLines[oldIndex + 1], newIndex) : -1;
        const nextNewMatch = newIndex + 1 < modifiedLines.length ? 
          originalLines.indexOf(modifiedLines[newIndex + 1], oldIndex) : -1;

        if (nextOldMatch !== -1 && nextOldMatch - newIndex <= 2) {
          // Likely a modification - show both deleted and added
          diffLines.push({
            type: 'deleted',
            oldLine,
            oldLineNumber: oldLineNum
          });
          oldIndex++;
          oldLineNum++;
        } else if (nextNewMatch !== -1 && nextNewMatch - oldIndex <= 2) {
          diffLines.push({
            type: 'added',
            newLine,
            newLineNumber: newLineNum
          });
          newIndex++;
          newLineNum++;
        } else {
          // Complete change - show both
          if (oldLine) {
            diffLines.push({
              type: 'deleted',
              oldLine,
              oldLineNumber: oldLineNum
            });
            oldIndex++;
            oldLineNum++;
          }
          if (newLine) {
            diffLines.push({
              type: 'added',
              newLine,
              newLineNumber: newLineNum
            });
            newIndex++;
            newLineNum++;
          }
        }
      }
    }

    return diffLines;
  };

  const diffLines = computeDiff();

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (onScroll) {
      onScroll(event.currentTarget.scrollTop);
    }
  };

  const getLineColor = (type: string) => {
    switch (type) {
      case 'added':
        return 'bg-green-500/10 border-l-2 border-green-500';
      case 'deleted':
        return 'bg-red-500/10 border-l-2 border-red-500';
      case 'modified':
        return 'bg-yellow-500/10 border-l-2 border-yellow-500';
      default:
        return '';
    }
  };

  const getTextColor = (type: string) => {
    switch (type) {
      case 'added':
        return 'text-green-300';
      case 'deleted':
        return 'text-red-300';
      case 'modified':
        return 'text-yellow-300';
      default:
        return 'text-gray-400';
    }
  };

  const getLineNumberColor = (type: string) => {
    switch (type) {
      case 'added':
        return 'text-green-500';
      case 'deleted':
        return 'text-red-500';
      case 'modified':
        return 'text-yellow-500';
      default:
        return 'text-gray-500';
    }
  };

  const getChangeIndicator = (type: string) => {
    switch (type) {
      case 'added':
        return '+';
      case 'deleted':
        return '-';
      case 'modified':
        return '~';
      default:
        return ' ';
    }
  };

  const countChanges = () => {
    const added = diffLines.filter(line => line.type === 'added').length;
    const deleted = diffLines.filter(line => line.type === 'deleted').length;
    const modified = diffLines.filter(line => line.type === 'modified').length;
    return { added, deleted, modified, total: added + deleted + modified };
  };

  const changes = countChanges();

  if (isCollapsed) {
    return (
      <div className={`border ${theme.border} rounded-lg ${theme.bgPanel}`}>
        <div 
          className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5"
          onClick={() => setIsCollapsed(false)}
        >
          <div className="flex items-center space-x-3">
            <div className={`w-2 h-2 rounded-full ${
              changes.total > 0 ? 'bg-yellow-500' : 'bg-green-500'
            }`} />
            <span className="font-medium text-sm">{fileName || 'Diff View'}</span>
            {changes.total > 0 && (
              <div className="flex space-x-2 text-xs">
                <span className="text-green-500">+{changes.added}</span>
                <span className="text-red-500">-{changes.deleted}</span>
                {changes.modified > 0 && (
                  <span className="text-yellow-500">~{changes.modified}</span>
                )}
              </div>
            )}
          </div>
          <button className="text-xs opacity-60 hover:opacity-100">
            Expand ↓
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`border ${theme.border} rounded-lg ${theme.bgPanel}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center space-x-3">
          <div className={`w-2 h-2 rounded-full ${
            changes.total > 0 ? 'bg-yellow-500' : 'bg-green-500'
          }`} />
          <span className="font-medium text-sm">{fileName || 'Diff View'}</span>
          {changes.total > 0 && (
            <div className="flex space-x-2 text-xs">
              <span className="text-green-500">+{changes.added}</span>
              <span className="text-red-500">-{changes.deleted}</span>
              {changes.modified > 0 && (
                <span className="text-yellow-500">~{changes.modified}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex space-x-2">
          <button 
            className="text-xs opacity-60 hover:opacity-100"
            onClick={() => setIsCollapsed(true)}
          >
            Collapse ↑
          </button>
        </div>
      </div>

      {/* Diff Content */}
      <div 
        ref={containerRef}
        className="w-full overflow-auto font-mono text-xs"
        style={{ maxHeight }}
        onScroll={handleScroll}
      >
        <div className="min-w-max">
          {diffLines.map((line, index) => (
            <div
              key={index}
              className={`flex hover:bg-white/5 ${getLineColor(line.type)}`}
            >
              {/* Line Numbers */}
              {showLineNumbers && (
                <>
                  <div 
                    className={`w-8 flex-shrink-0 text-right pr-2 border-r border-white/10 select-none ${getLineNumberColor(line.type)}`}
                    title={line.type}
                  >
                    {getChangeIndicator(line.type)}
                  </div>
                  <div 
                    className={`w-8 flex-shrink-0 text-right pr-2 border-r border-white/10 select-none ${getLineNumberColor(line.type)}`}
                  >
                    {line.oldLineNumber || ' '}
                  </div>
                  <div 
                    className={`w-8 flex-shrink-0 text-right pr-2 border-r border-white/10 select-none ${getLineNumberColor(line.type)}`}
                  >
                    {line.newLineNumber || ' '}
                  </div>
                </>
              )}
              
              {/* Content */}
              <div className={`pl-2 whitespace-pre ${getTextColor(line.type)}`}>
                {line.type === 'deleted' && line.oldLine}
                {line.type === 'added' && line.newLine}
                {line.type === 'unchanged' && line.oldLine}
                {line.type === 'modified' && (
                  <>
                    <span className="text-red-300 line-through">{line.oldLine}</span>
                    <br />
                    <span className="text-green-300">{line.newLine}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {diffLines.length === 0 && (
          <div className="flex items-center justify-center p-8 text-gray-500">
            No changes detected
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-2 border-t border-white/10 text-xs text-gray-500">
        <div>
          {diffLines.length} lines
        </div>
        <div className="flex space-x-4">
          <span className="text-green-500">+{changes.added} added</span>
          <span className="text-red-500">-{changes.deleted} deleted</span>
          {changes.modified > 0 && (
            <span className="text-yellow-500">~{changes.modified} modified</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiffViewer;