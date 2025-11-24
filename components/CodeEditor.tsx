import * as React from 'react';
import { ThemeConfig, ThemeType } from '../types';
import { THEME_COLORS } from '../constants';

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
}

const CodeEditor: React.FC<CodeEditorProps> = ({ 
  value, 
  onChange, 
  language, 
  theme,
  themeType,
  placeholder 
}) => {
  const highlightColors = THEME_COLORS[themeType] || THEME_COLORS.cosmic;
  const preRef = React.useRef<HTMLPreElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Sync scroll between textarea and pre
  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Run Prism highlighting when value changes
  React.useEffect(() => {
    if (window.Prism) {
      window.Prism.highlightAllUnder(preRef.current);
    }
  }, [value, language]);

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
  `;

  return (
    <div className="relative w-full h-full overflow-hidden group">
      <style>{dynamicStyles}</style>
      
      {/* Background Syntax Highlight Layer */}
      <pre
        ref={preRef}
        aria-hidden="true"
        className={`absolute inset-0 m-0 p-4 pointer-events-none overflow-hidden whitespace-pre-wrap break-all code-font text-sm language-${language.toLowerCase()}`}
        style={{ fontFamily: '"JetBrains Mono", monospace' }}
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
        className={`absolute inset-0 w-full h-full p-4 bg-transparent text-transparent caret-${theme.accent.replace('text-', '')} resize-none outline-none border-none code-font text-sm overflow-auto whitespace-pre-wrap break-all z-10`}
        style={{ 
          color: 'transparent', 
          caretColor: 'white',
          fontFamily: '"JetBrains Mono", monospace'
        }}
      />
    </div>
  );
};

export default CodeEditor;