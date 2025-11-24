import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy, Check } from 'lucide-react';
import { ThemeConfig } from '../types';

declare global {
  interface Window {
    Prism: any;
  }
}

interface MarkdownRendererProps {
  content: string;
  theme: ThemeConfig;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, theme }) => {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  
  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Trigger Prism highlighting on mount/update
  React.useEffect(() => {
    if (window.Prism) {
      window.Prism.highlightAll();
    }
  }, [content]);

  let codeBlockIndex = 0;

  return (
    <div className={`prose prose-invert max-w-none ${theme.textMain} text-sm sm:text-base`}>
      <ReactMarkdown
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const language = match ? match[1] : 'text';
            
            if (!inline) {
              const currentIndex = codeBlockIndex++;
              const isCopied = copiedIndex === currentIndex;

              return (
                <div className={`relative group rounded-lg overflow-hidden my-4 border ${theme.border} shadow-lg`}>
                  <div className={`flex justify-between items-center px-3 py-1.5 ${theme.bgPanelHeader} border-b ${theme.border}`}>
                     <span className={`text-xs ${theme.accent} uppercase font-mono tracking-wider font-semibold`}>
                       {language}
                     </span>
                     <button 
                      onClick={() => handleCopy(codeString, currentIndex)}
                      className={`${theme.textMuted} hover:text-white transition-colors flex items-center gap-1.5`}
                      title="Copy code"
                     >
                       {isCopied ? (
                         <Check className="w-3.5 h-3.5 text-emerald-400" />
                       ) : (
                         <Copy className="w-3.5 h-3.5" />
                       )}
                       <span className="text-xs">{isCopied ? 'Copied' : 'Copy'}</span>
                     </button>
                  </div>
                  <pre className={`!m-0 !p-3 overflow-x-auto ${theme.codeBg} language-${language}`}>
                    <code className={`!bg-transparent language-${language}`} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              );
            }
            
            return (
              <code className={`${theme.bgPanelHeader} px-1.5 py-0.5 rounded ${theme.accent} font-mono text-xs border ${theme.border}`} {...props}>
                {children}
              </code>
            );
          },
          h1: ({node, ...props}) => <h1 className={`text-2xl font-bold ${theme.textMain} mt-6 mb-4 pb-2 border-b ${theme.border}`} {...props} />,
          h2: ({node, ...props}) => <h2 className={`text-xl font-bold ${theme.textMain} mt-6 mb-3`} {...props} />,
          h3: ({node, ...props}) => <h3 className={`text-lg font-semibold ${theme.textMain} mt-4 mb-2 opacity-90`} {...props} />,
          h4: ({node, ...props}) => <h4 className={`text-base font-semibold ${theme.textMain} mt-3 mb-1 opacity-90`} {...props} />,
          p: ({node, ...props}) => <p className={`${theme.textMain} leading-relaxed mb-3 opacity-90`} {...props} />,
          strong: ({node, ...props}) => <strong className={`font-bold ${theme.textMain}`} {...props} />,
          em: ({node, ...props}) => <em className={`${theme.accent} italic`} {...props} />,
          ul: ({node, ...props}) => <ul className={`list-disc list-outside ml-5 mb-4 space-y-1 ${theme.textMain} opacity-90`} {...props} />,
          ol: ({node, ...props}) => <ol className={`list-decimal list-outside ml-5 mb-4 space-y-1 ${theme.textMain} opacity-90`} {...props} />,
          li: ({node, ...props}) => <li className="pl-1" {...props} />,
          blockquote: ({node, ...props}) => (
            <blockquote className={`border-l-4 ${theme.border} border-l-[color:var(--tw-border-opacity)] ${theme.bgPanel} pl-3 py-1 my-4 ${theme.textMuted} italic rounded-r-lg text-sm`} {...props} />
          ),
          hr: ({node, ...props}) => <hr className={`${theme.border} my-6`} {...props} />,
          table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className={`min-w-full divide-y ${theme.border} border ${theme.border} rounded-lg`} {...props} /></div>,
          th: ({node, ...props}) => <th className={`${theme.bgPanelHeader} px-3 py-2 text-left text-xs font-semibold ${theme.textMain}`} {...props} />,
          td: ({node, ...props}) => <td className={`px-3 py-2 text-xs ${theme.textMain} border-t ${theme.border} whitespace-pre-wrap opacity-80`} {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;