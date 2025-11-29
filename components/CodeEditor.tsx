import * as React from 'react';
import { ThemeConfig, ThemeType } from '../types';
import { THEME_COLORS } from '../constants';
import { Lightbulb, Wand2 } from 'lucide-react';

declare global {
  interface Window {
    Prism: any;
  }
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  theme: ThemeConfig;
  themeType: ThemeType;
  placeholder?: string;
  onExplainLine?: (lineNumber: number, code: string) => void;
  onFixLine?: (lineNumber: number, code: string) => void;
  readOnly?: boolean;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ 
  value, 
  onChange, 
  language, 
  theme,
  themeType,
  placeholder,
  onExplainLine,
  onFixLine,
  readOnly = false
}) => {
  const highlightColors = THEME_COLORS[themeType] || THEME_COLORS.cosmic;
  const preRef = React.useRef<HTMLPreElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = React.useRef<HTMLDivElement>(null);
  const [hoveredLine, setHoveredLine] = React.useState<number | null>(null);
  const [selectedLine, setSelectedLine] = React.useState<number | null>(null);

  const lines = value.split('\n');
  const lineNumbers = Array.from({ length: Math.max(lines.length, 1) }, (_, i) => i + 1);

  // Sync scroll between all elements
  const handleScroll = () => {
    if (textareaRef.current && preRef.current && lineNumbersRef.current) {
      const scrollTop = textareaRef.current.scrollTop;
      const scrollLeft = textareaRef.current.scrollLeft;
      
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
      lineNumbersRef.current.scrollTop = scrollTop;
    }
  };

  // Run Prism highlighting when value changes
  React.useEffect(() => {
    if (window.Prism) {
      window.Prism.highlightAllUnder(preRef.current);
    }
  }, [value, language]);

  const handleLineClick = (lineNumber: number) => {
    setSelectedLine(lineNumber === selectedLine ? null : lineNumber);
  };

  const handleExplainLine = (lineNumber: number) => {
    const lineContent = lines[lineNumber - 1];
    if (onExplainLine && lineContent.trim()) {
      onExplainLine(lineNumber, lineContent);
    }
    setSelectedLine(null);
  };

  const handleFixLine = (lineNumber: number) => {
    const lineContent = lines[lineNumber - 1];
    if (onFixLine && lineContent.trim()) {
      onFixLine(lineNumber, lineContent);
    }
    setSelectedLine(null);
  };

  // Calculate line height for proper alignment
  const lineHeight = 20; // px - should match your text-sm line height

  // Inject dynamic styles for Prism tokens based on current theme
  const dynamicStyles = `
    .token.comment, .token.prolog, .token.doctype, .token.cdata { color: ${highlightColors.comment}; font-style: italic; }
    .token.punctuation { color: ${theme.textMuted}; }
    .token.namespace { opacity: .7; }
    .token.property, .token.tag, .token.boolean, .token.constant, .token.symbol, .token.deleted { color: ${highlightColors.number}; }
    .token.number { color: ${highlightColors.number}; }
    .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: ${highlightColors.string}; }
    .token.operator, .token.entity, .token.url, .language-css .token.string, .style .token.string { color: ${theme.textMain}; }
    .token.atrule, .token.attr-value, .token.keyword { color: ${highlightColors.keyword}; }
    .token.function, .token.class-name { color: ${highlightColors.function}; }
    .token.regex, .token.important, .token.variable { color: ${highlightColors.string}; }
    
    .line-highlight {
      background: ${theme.accentBg}20;
      border-left: 2px solid ${theme.accent};
    }
    
    .line-number {
      color: ${theme.textMuted};
      text-align: right;
      padding-right: 12px;
      user-select: none;
    }
    
    .line-number.highlighted {
      color: ${theme.accent};
      font-weight: bold;
    }
    
    .line-actions {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    
    .line-wrapper:hover .line-actions {
      opacity: 1;
    }
  `;

  return (
    <div className="relative w-full h-full overflow-hidden group code-editor-container">
      <style>{dynamicStyles}</style>

      {/* Line Numbers */}
      <div
        ref={lineNumbersRef}
        className="absolute left-0 top-0 bottom-0 overflow-hidden z-20"
        style={{
          width: '60px',
          backgroundColor: theme.bgPanel.replace('bg-', ''),
          borderRight: `1px solid ${theme.border.replace('border-', '')}`,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '14px',
          lineHeight: `${lineHeight}px`
        }}
      >
        <div className="py-4">
          {lineNumbers.map((number) => (
            <div
              key={number}
              className={`line-number ${selectedLine === number || hoveredLine === number ? 'highlighted' : ''}`}
              style={{ height: `${lineHeight}px` }}
              onMouseEnter={() => setHoveredLine(number)}
              onMouseLeave={() => setHoveredLine(null)}
              onClick={() => handleLineClick(number)}
            >
              {number}
            </div>
          ))}
        </div>
      </div>

      {/* Line Actions for Selected Line */}
      {selectedLine !== null && (
        <div
          className="absolute right-4 z-30 bg-gray-800 border border-gray-600 rounded-lg shadow-lg p-2 flex gap-2"
          style={{
            top: `${(selectedLine - 1) * lineHeight + 4}px`,
            transform: 'translateY(-50%)'
          }}
        >
          <button
            onClick={() => handleExplainLine(selectedLine)}
            className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white transition-colors"
            title="Explain this line"
          >
            <Lightbulb className="w-3 h-3" />
            Explain
          </button>
          <button
            onClick={() => handleFixLine(selectedLine)}
            className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs text-white transition-colors"
            title="Fix this line"
          >
            <Wand2 className="w-3 h-3" />
            Fix
          </button>
          <button
            onClick={() => setSelectedLine(null)}
            className="px-2 py-1 bg-gray-600 hover:bg-gray-700 rounded text-xs text-white transition-colors"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Editor Area */}
      <div 
        className="absolute inset-0 overflow-auto"
        style={{ 
          left: '60px',
          right: '0'
        }}
      >
        {/* Background Syntax Highlight Layer */}
        <pre
          ref={preRef}
          aria-hidden="true"
          className="absolute inset-0 m-0 p-4 pointer-events-none overflow-hidden whitespace-pre-wrap break-all text-sm"
          style={{ 
            fontFamily: '"JetBrains Mono", monospace',
            lineHeight: `${lineHeight}px`,
            background: 'transparent'
          }}
        >
          <code className={`language-${language.toLowerCase()}`}>
            {value || ' '} 
          </code>
        </pre>

        {/* Foreground Input Layer */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          placeholder={placeholder}
          spellCheck={false}
          readOnly={readOnly}
          className={`absolute inset-0 w-full h-full p-4 bg-transparent text-transparent caret-${theme.accent.replace('text-', '')} resize-none outline-none border-none text-sm overflow-auto whitespace-pre-wrap break-all z-10`}
          style={{ 
            color: 'transparent', 
            caretColor: 'white',
            fontFamily: '"JetBrains Mono", monospace',
            lineHeight: `${lineHeight}px`,
            left: '0',
            paddingLeft: 'calc(1rem - 60px)' // Compensate for line numbers offset
          }}
        />

        {/* Line Highlight Overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-5"
          style={{
            background: `repeating-linear-gradient(
              transparent,
              transparent ${lineHeight - 1}px,
              ${theme.border.replace('border-', '')}20 ${lineHeight - 1}px,
              ${theme.border.replace('border-', '')}20 ${lineHeight}px
            )`,
            top: '16px', // Match padding
            left: '16px',
            right: '16px',
            bottom: '16px'
          }}
        />

        {/* Hover Line Highlight */}
        {hoveredLine !== null && (
          <div
            className="absolute left-0 right-0 pointer-events-none z-5 line-highlight"
            style={{
              top: `${(hoveredLine - 1) * lineHeight + 16}px`,
              height: `${lineHeight}px`
            }}
          />
        )}
      </div>

      {/* Editor Status Bar */}
      <div 
        className={`absolute bottom-0 left-0 right-0 ${theme.bgPanelHeader} border-t ${theme.border} px-3 py-1 text-xs ${theme.textMuted} flex justify-between items-center`}
        style={{ left: '60px' }}
      >
        <div>
          Line {selectedLine || '--'} • {lines.length} lines • {language}
        </div>
        <div className="flex gap-4">
          {selectedLine && (
            <>
              <button 
                onClick={() => handleExplainLine(selectedLine)}
                className="flex items-center gap-1 hover:text-blue-400 transition-colors"
              >
                <Lightbulb className="w-3 h-3" />
                Explain
              </button>
              <button 
                onClick={() => handleFixLine(selectedLine)}
                className="flex items-center gap-1 hover:text-green-400 transition-colors"
              >
                <Wand2 className="w-3 h-3" />
                Fix
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;