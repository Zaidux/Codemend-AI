import * as React from 'react';
import { RefreshCw, ExternalLink, AlertCircle, Code, FileText } from 'lucide-react';
import { ProjectFile, ThemeConfig, CodeLanguage } from '../types';

interface WebPreviewProps {
  files: ProjectFile[];
  theme: ThemeConfig;
}

const WebPreview: React.FC<WebPreviewProps> = ({ files, theme }) => {
  const [key, setKey] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [previewMode, setPreviewMode] = React.useState<'html' | 'code'>('html');

  const generateHtmlWrapper = (jsFiles: ProjectFile[], cssFiles: ProjectFile[]): string => {
    const jsContent = jsFiles.map(f => f.content).join('\n\n');
    const cssContent = cssFiles.map(f => f.content).join('\n\n');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Preview</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #1a1a1a;
            color: #e0e0e0;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .output-section {
            background: #2d2d2d;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            border: 1px solid #404040;
        }
        .console {
            background: #000;
            color: #00ff00;
            padding: 15px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            margin: 10px 0;
            min-height: 100px;
            white-space: pre-wrap;
        }
        .error {
            background: #ff4444;
            color: white;
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
        .success {
            background: #00c851;
            color: white;
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
        }
        ${cssContent}
    </style>
</head>
<body>
    <div class="container">
        <h1>🔄 Live JavaScript Preview</h1>
        <div class="output-section">
            <h3>Console Output:</h3>
            <div id="console" class="console"></div>
        </div>
        <div class="output-section">
            <h3>DOM Output:</h3>
            <div id="output"></div>
        </div>
    </div>

    <script>
        // Override console methods to capture output
        const originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info
        };

        const consoleElement = document.getElementById('console');
        const outputElement = document.getElementById('output');

        function addToConsole(type, args) {
            const message = Array.from(args).map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            
            const div = document.createElement('div');
            div.style.color = type === 'error' ? '#ff4444' : 
                            type === 'warn' ? '#ffaa00' : 
                            type === 'info' ? '#0099ff' : '#00ff00';
            div.textContent = \`[\${type.toUpperCase()}] \${message}\`;
            consoleElement.appendChild(div);
            consoleElement.scrollTop = consoleElement.scrollHeight;
        }

        console.log = (...args) => {
            originalConsole.log(...args);
            addToConsole('log', args);
        };
        console.error = (...args) => {
            originalConsole.error(...args);
            addToConsole('error', args);
        };
        console.warn = (...args) => {
            originalConsole.warn(...args);
            addToConsole('warn', args);
        };
        console.info = (...args) => {
            originalConsole.info(...args);
            addToConsole('info', args);
        };

        // Global error handler
        window.addEventListener('error', (e) => {
            addToConsole('error', [e.error?.message || e.message]);
        });

        // Execute the JavaScript code
        try {
            ${jsContent}
            console.log('✅ JavaScript executed successfully!');
            
            // If there's no DOM manipulation, show a default message
            if (outputElement.children.length === 0) {
                outputElement.innerHTML = '<div class="success">✅ Code executed successfully. Check console for output.</div>';
            }
        } catch (e) {
            console.error('Execution error:', e.message);
            outputElement.innerHTML = '<div class="error">❌ ' + e.message + '</div>';
        }
    </script>
</body>
</html>`;
  };

  const getSrcDoc = () => {
    try {
      setError(null);
      
      const htmlFile = files.find(f => f.name.endsWith('.html')) || files.find(f => f.language === CodeLanguage.HTML);
      const cssFiles = files.filter(f => f.name.endsWith('.css') || f.language === CodeLanguage.CSS);
      const jsFiles = files.filter(f => 
        f.name.endsWith('.js') || 
        f.name.endsWith('.jsx') || 
        f.language === CodeLanguage.JAVASCRIPT || 
        f.language === CodeLanguage.TYPESCRIPT
      );

      // If we have HTML file, use it as base
      if (htmlFile) {
        let content = htmlFile.content;

        // Inject CSS
        const styles = cssFiles.map(f => `<style>/* ${f.name} */\n${f.content}</style>`).join('\n');
        content = content.replace('</head>', `${styles}\n</head>`);

        // Inject JS with error handling
        const scripts = jsFiles.map(f => `
          <script>
            try {
              /* ${f.name} */
              ${f.content}
            } catch (e) {
              console.error('Error in ${f.name}:', e);
              document.body.innerHTML += '<div style="background:red; color:white; padding:10px; margin:10px; border-radius:4px;">Error in ${f.name}: ' + e.message + '</div>';
            }
          </script>
        `).join('\n');

        content = content.replace('</body>', `${scripts}\n</body>`);
        return content;
      }

      // If no HTML but we have JavaScript, generate a wrapper
      if (jsFiles.length > 0) {
        return generateHtmlWrapper(jsFiles, cssFiles);
      }

      // If no executable files, show code view
      if (files.length > 0) {
        setPreviewMode('code');
        return `
          <html>
            <body style="background: #1a1a1a; color: #e0e0e0; font-family: monospace; padding: 20px;">
              <h3>📁 Project Files</h3>
              <ul>
                ${files.map(f => `<li>${f.name} (${f.language})</li>`).join('')}
              </ul>
              <p>No HTML file found. Create an index.html or add JavaScript files to see live preview.</p>
            </body>
          </html>
        `;
      }

      // No files case
      return `
        <html>
          <body style="background: #111; color: #888; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh;">
            <div style="text-align: center;">
              <h3>No files to preview</h3>
              <p>Add some code files to see the preview.</p>
            </div>
          </body>
        </html>
      `;
    } catch (e: any) {
      setError(e.message);
      return '';
    }
  };

  const handleRefresh = () => {
    setKey(prev => prev + 1);
  };

  const hasHtml = files.some(f => f.name.endsWith('.html') || f.language === CodeLanguage.HTML);
  const hasJs = files.some(f => 
    f.name.endsWith('.js') || 
    f.name.endsWith('.jsx') || 
    f.language === CodeLanguage.JAVASCRIPT || 
    f.language === CodeLanguage.TYPESCRIPT
  );

  return (
    <div className="flex flex-col h-full w-full bg-white">
      <div className={`flex items-center justify-between px-3 py-2 border-b ${theme.border} ${theme.bgPanelHeader}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wider ${theme.textMain}`}>
            Live Preview {hasJs && !hasHtml && ' (JS)'}
          </span>
          {error && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3"/> {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Preview mode toggle */}
          {(hasJs || hasHtml) && (
            <button 
              onClick={() => setPreviewMode(previewMode === 'html' ? 'code' : 'html')}
              className={`p-1.5 rounded hover:bg-white/10 ${theme.textMuted} hover:text-white`}
              title={previewMode === 'html' ? 'Show Code' : 'Show Preview'}
            >
              {previewMode === 'html' ? <Code className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            </button>
          )}
          <button 
            onClick={handleRefresh} 
            className={`p-1.5 rounded hover:bg-white/10 ${theme.textMuted} hover:text-white`}
            title="Refresh Preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      <div className="flex-grow relative bg-white">
        {previewMode === 'code' ? (
          <div className={`absolute inset-0 overflow-auto ${theme.codeBg} p-4`}>
            <div className="space-y-4">
              {files.map((file, index) => (
                <div key={index} className={`border ${theme.border} rounded-lg overflow-hidden`}>
                  <div className={`px-3 py-2 ${theme.bgPanelHeader} border-b ${theme.border}`}>
                    <span className={`text-sm font-mono ${theme.textMain}`}>{file.name}</span>
                    <span className={`text-xs ${theme.textMuted} ml-2`}>({file.language})</span>
                  </div>
                  <pre className={`p-3 text-sm whitespace-pre-wrap ${theme.textMain} font-mono`}>
                    {file.content}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <iframe
            key={key}
            title="Web Preview"
            srcDoc={getSrcDoc()}
            sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
            className="absolute inset-0 w-full h-full border-none"
          />
        )}
      </div>
    </div>
  );
};

export default WebPreview;