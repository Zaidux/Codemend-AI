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
  const [isLoading, setIsLoading] = React.useState(true);

  // Safe file filtering with null checks
  const safeFiles = React.useMemo(() => {
    return (files || []).filter(file => file && file.name && file.content !== undefined);
  }, [files]);

  const generateHtmlWrapper = (jsFiles: ProjectFile[], cssFiles: ProjectFile[]): string => {
    const safeJsFiles = jsFiles || [];
    const safeCssFiles = cssFiles || [];
    
    const jsContent = safeJsFiles.map(f => f.content || '').join('\n\n');
    const cssContent = safeCssFiles.map(f => f.content || '').join('\n\n');

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
            overflow-x: auto;
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
            <div id="console" class="console">Initializing...</div>
        </div>
        <div class="output-section">
            <h3>DOM Output:</h3>
            <div id="output">Waiting for execution...</div>
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
            if (!consoleElement) return;
            
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
            addToConsole('error', [e.error?.message || e.message || 'Unknown error']);
        });

        window.addEventListener('unhandledrejection', (e) => {
            addToConsole('error', ['Unhandled Promise Rejection:', e.reason]);
        });

        // Execute the JavaScript code safely
        try {
            if (consoleElement) {
                consoleElement.textContent = 'Executing code...';
            }
            
            ${jsContent}
            
            console.log('✅ JavaScript executed successfully!');
            
            // If there's no DOM manipulation, show a default message
            if (outputElement && outputElement.children.length === 0) {
                outputElement.innerHTML = '<div class="success">✅ Code executed successfully. Check console for output.</div>';
            }
        } catch (e) {
            console.error('Execution error:', e.message);
            if (outputElement) {
                outputElement.innerHTML = '<div class="error">❌ ' + e.message + '</div>';
            }
        }
    </script>
</body>
</html>`;
  };

  const getSrcDoc = (): string => {
    try {
      setError(null);
      setIsLoading(false);

      const htmlFile = safeFiles.find(f => 
        f.name.endsWith('.html') || f.language === CodeLanguage.HTML
      );
      const cssFiles = safeFiles.filter(f => 
        f.name.endsWith('.css') || f.language === CodeLanguage.CSS
      );
      const jsFiles = safeFiles.filter(f => 
        f.name.endsWith('.js') || 
        f.name.endsWith('.jsx') || 
        f.name.endsWith('.ts') ||
        f.name.endsWith('.tsx') ||
        f.language === CodeLanguage.JAVASCRIPT || 
        f.language === CodeLanguage.TYPESCRIPT
      );

      // If we have HTML file, use it as base
      if (htmlFile && htmlFile.content) {
        let content = htmlFile.content;

        // Inject CSS safely
        const styles = cssFiles.map(f => 
          `<style>/* ${f.name} */\n${f.content || ''}</style>`
        ).join('\n');
        
        // Inject styles before closing head tag
        if (content.includes('</head>')) {
          content = content.replace('</head>', `${styles}\n</head>`);
        } else if (content.includes('<head>')) {
          content = content.replace('<head>', `<head>${styles}`);
        } else {
          // No head tag, add one
          content = content.replace('<html>', `<html><head>${styles}</head>`);
        }

        // Inject JS with error handling
        const scripts = jsFiles.map(f => `
          <script>
            try {
              /* ${f.name} */
              ${f.content || ''}
            } catch (e) {
              console.error('Error in ${f.name}:', e);
              if (document.body) {
                document.body.innerHTML += '<div style="background:red; color:white; padding:10px; margin:10px; border-radius:4px;">Error in ${f.name}: ' + e.message + '</div>';
              }
            }
          </script>
        `).join('\n');

        // Inject scripts before closing body tag
        if (content.includes('</body>')) {
          content = content.replace('</body>', `${scripts}\n</body>`);
        } else if (content.includes('<body>')) {
          content = content.replace('<body>', `<body>${scripts}`);
        } else {
          // No body tag, add one at the end
          content += scripts;
        }

        return content;
      }

      // If no HTML but we have JavaScript, generate a wrapper
      if (jsFiles.length > 0) {
        return generateHtmlWrapper(jsFiles, cssFiles);
      }

      // If no executable files, show code view
      if (safeFiles.length > 0) {
        setPreviewMode('code');
        return `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body {
                  background: #1a1a1a; 
                  color: #e0e0e0; 
                  font-family: monospace; 
                  padding: 20px;
                  margin: 0;
                }
                ul {
                  list-style: none;
                  padding: 0;
                }
                li {
                  padding: 5px 0;
                  border-bottom: 1px solid #333;
                }
              </style>
            </head>
            <body>
              <h3>📁 Project Files</h3>
              <ul>
                ${safeFiles.map(f => `<li>${f.name} (${f.language || 'unknown'})</li>`).join('')}
              </ul>
              <p>No HTML file found. Create an index.html or add JavaScript files to see live preview.</p>
            </body>
          </html>
        `;
      }

      // No files case
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body {
                background: #111; 
                color: #888; 
                font-family: sans-serif; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh;
                margin: 0;
              }
            </style>
          </head>
          <body>
            <div style="text-align: center;">
              <h3>No files to preview</h3>
              <p>Add some code files to see the preview.</p>
            </div>
          </body>
        </html>
      `;
    } catch (e: any) {
      console.error('Error generating preview:', e);
      setError(e.message || 'Unknown error generating preview');
      setIsLoading(false);
      
      return `
        <!DOCTYPE html>
        <html>
          <body style="background: #ff4444; color: white; padding: 20px; font-family: sans-serif;">
            <h3>❌ Error generating preview</h3>
            <p>${e.message || 'Unknown error'}</p>
          </body>
        </html>
      `;
    }
  };

  const handleRefresh = () => {
    setKey(prev => prev + 1);
    setIsLoading(true);
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const hasHtml = safeFiles.some(f => 
    f.name.endsWith('.html') || f.language === CodeLanguage.HTML
  );
  const hasJs = safeFiles.some(f => 
    f.name.endsWith('.js') || 
    f.name.endsWith('.jsx') ||
    f.name.endsWith('.ts') ||
    f.name.endsWith('.tsx') ||
    f.language === CodeLanguage.JAVASCRIPT || 
    f.language === CodeLanguage.TYPESCRIPT
  );

  const srcDoc = React.useMemo(() => getSrcDoc(), [safeFiles, previewMode]);

  return (
    <div className="flex flex-col h-full w-full bg-white border border-gray-300 rounded-lg overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b ${theme.border} ${theme.bgPanelHeader}`}>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${theme.textMain}`}>
            Live Preview {hasJs && !hasHtml && ' (JS)'}
          </span>
          {isLoading && (
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
              <span className="text-xs text-blue-500">Loading...</span>
            </div>
          )}
          {error && (
            <span className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3"/> {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Preview mode toggle */}
          {(hasJs || hasHtml) && (
            <button 
              onClick={() => setPreviewMode(previewMode === 'html' ? 'code' : 'html')}
              className={`p-2 rounded-lg border ${theme.border} hover:bg-gray-100 transition-colors ${theme.textMuted} hover:text-gray-800`}
              title={previewMode === 'html' ? 'Show Code' : 'Show Preview'}
            >
              {previewMode === 'html' ? <Code className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </button>
          )}
          <button 
            onClick={handleRefresh} 
            className={`p-2 rounded-lg border ${theme.border} hover:bg-gray-100 transition-colors ${theme.textMuted} hover:text-gray-800`}
            title="Refresh Preview"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-grow relative bg-white min-h-0">
        {previewMode === 'code' ? (
          <div className={`absolute inset-0 overflow-auto ${theme.codeBg} p-4`}>
            {safeFiles.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No files to display</p>
              </div>
            ) : (
              <div className="space-y-4">
                {safeFiles.map((file, index) => (
                  <div key={index} className={`border ${theme.border} rounded-lg overflow-hidden bg-white`}>
                    <div className={`px-4 py-3 ${theme.bgPanelHeader} border-b ${theme.border}`}>
                      <span className={`text-sm font-mono font-semibold ${theme.textMain}`}>
                        {file.name}
                      </span>
                      <span className={`text-xs ${theme.textMuted} ml-2`}>
                        ({file.language || 'unknown'})
                      </span>
                    </div>
                    <pre className={`p-4 text-sm whitespace-pre-wrap ${theme.textMain} font-mono bg-gray-50 overflow-x-auto`}>
                      {file.content || '<empty file>'}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="absolute inset-0">
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Loading preview...</p>
                </div>
              </div>
            )}
            <iframe
              key={key}
              title="Web Preview"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
              className="absolute inset-0 w-full h-full border-none"
              onLoad={handleIframeLoad}
              onError={(e) => {
                console.error('Iframe error:', e);
                setError('Failed to load preview');
                setIsLoading(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default WebPreview;