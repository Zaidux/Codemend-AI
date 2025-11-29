import * as React from 'react';
import { 
  RefreshCw, AlertCircle, Code, FileText, Server, Globe, 
  Smartphone, Monitor, Terminal, Activity, XCircle, CheckCircle, Wifi 
} from 'lucide-react';
import { ProjectFile, ThemeConfig, CodeLanguage } from '../types';

// --- Types ---

interface WebPreviewProps {
  files: ProjectFile[];
  theme: ThemeConfig;
}

interface BackendEndpoint {
  method: string;
  path: string;
  handler: string;
  response?: any;
}

interface ConsoleLog {
  type: 'log' | 'error' | 'warn' | 'info';
  message: string;
  timestamp: string;
}

interface NetworkRequest {
  method: string;
  url: string;
  status: number;
  duration: number;
  timestamp: string;
}

// --- Helper: Generate Import Map ---
const generateImportMap = (dependencies: string[] = []) => {
  const imports: Record<string, string> = {
    "react": "https://esm.sh/react@18.2.0",
    "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
    "react/jsx-runtime": "https://esm.sh/react@18.2.0/jsx-runtime",
    "vue": "https://esm.sh/vue@3.3.4",
    "canvas-confetti": "https://esm.sh/canvas-confetti",
    "lodash": "https://esm.sh/lodash",
    "axios": "https://esm.sh/axios"
  };

  return JSON.stringify({ imports }, null, 2);
};

const WebPreview: React.FC<WebPreviewProps> = ({ files, theme }) => {
  const [key, setKey] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [activeView, setActiveView] = React.useState<'preview' | 'code' | 'backend'>('preview');
  const [deviceMode, setDeviceMode] = React.useState<'desktop' | 'mobile'>('desktop');
  const [isLoading, setIsLoading] = React.useState(true);

  // DevTools State
  const [showDevTools, setShowDevTools] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<'console' | 'network'>('console');
  const [logs, setLogs] = React.useState<ConsoleLog[]>([]);
  const [networkRequests, setNetworkRequests] = React.useState<NetworkRequest[]>([]);
  const [backendEndpoints, setBackendEndpoints] = React.useState<BackendEndpoint[]>([]);

  // 1. Safe File Filtering
  const safeFiles = React.useMemo(() => {
    return (files || []).filter(file => file && file.name && file.content !== undefined);
  }, [files]);

  // 2. Backend & API Detection
  React.useEffect(() => {
    const endpoints: BackendEndpoint[] = [];
    const backendFiles = safeFiles.filter(f => 
      f.name.match(/server|api|route|controller/i) || 
      (f.content && f.content.match(/app\.(get|post|put|delete)/))
    );

    backendFiles.forEach(file => {
      const content = file.content || '';
      const routeRegex = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
      let match;
      while ((match = routeRegex.exec(content)) !== null) {
        endpoints.push({
          method: match[1].toUpperCase(),
          path: match[2],
          handler: `Route defined in ${file.name}`,
          response: { success: true, message: 'Mock Backend Response' }
        });
      }
    });

    setBackendEndpoints(endpoints);
  }, [safeFiles]);

  // 3. Communication with Iframe (Logs & Network)
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Add origin check for security
      // if (event.origin !== window.location.origin) return;
      
      const data = event.data;
      if (!data || !data.type) return;

      if (data.type === 'console') {
        setLogs(prev => [...prev.slice(-99), { // Keep only last 100 logs
          type: data.level,
          message: data.args.join(' '),
          timestamp: new Date().toLocaleTimeString()
        }]);
      } else if (data.type === 'network') {
        setNetworkRequests(prev => [...prev.slice(-49), { // Keep only last 50 requests
          method: data.method,
          url: data.url,
          status: data.status,
          duration: data.duration,
          timestamp: new Date().toLocaleTimeString()
        }]);
      } else if (data.type === 'error') {
        setError(data.message);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 4. Generate the mock backend script with Persistence
  const generateBackendScript = (endpoints: BackendEndpoint[]) => {
    if (endpoints.length === 0) return '';
    
    return `
      <script>
        (function() {
          // --- Persistence Layer ---
          const DB_KEY = 'mock_db_store';
          const getDb = () => {
            try {
              return JSON.parse(sessionStorage.getItem(DB_KEY) || '{}');
            } catch {
              return {};
            }
          };
          const saveDb = (data) => {
            try {
              sessionStorage.setItem(DB_KEY, JSON.stringify(data));
            } catch (e) {
              console.warn('Failed to save to mock DB:', e);
            }
          };
          
          // --- Mock Backend Logic ---
          window.mockBackend = {
            endpoints: ${JSON.stringify(endpoints)},
            handle: async (method, url, body) => {
              const db = getDb();
              // Simple path matching
              const endpoint = window.mockBackend.endpoints.find(ep => 
                url.includes(ep.path) && ep.method === method
              );
              
              // Artificial Delay
              await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
              const startTime = performance.now();
              
              let response = { status: 404, data: { error: 'Not Found' } };

              if (endpoint) {
                // Simple "Create" simulation for POST
                if (method === 'POST') {
                  const collection = endpoint.path.split('/').pop() || 'items';
                  if (!db[collection]) db[collection] = [];
                  const newItem = { 
                    id: Date.now(), 
                    ...(body ? JSON.parse(body) : {}),
                    createdAt: new Date().toISOString()
                  };
                  db[collection].push(newItem);
                  saveDb(db);
                  response = { status: 201, data: newItem };
                } 
                // Simple "Read" simulation for GET
                else if (method === 'GET') {
                  const collection = endpoint.path.split('/').pop() || 'items';
                  response = { 
                    status: 200, 
                    data: db[collection] || endpoint.response || { message: 'Success' } 
                  };
                }
                else {
                  response = { status: 200, data: endpoint.response || { success: true } };
                }
              }

              // Report to Parent
              try {
                window.parent.postMessage({
                  type: 'network',
                  method,
                  url,
                  status: response.status,
                  duration: Math.round(performance.now() - startTime)
                }, '*');
              } catch (e) {
                console.warn('Failed to send network message:', e);
              }

              return response;
            }
          };

          // --- Fetch Override ---
          const originalFetch = window.fetch;
          window.fetch = async (url, options = {}) => {
            const method = (options.method || 'GET').toUpperCase();
            const isLocalRequest = url.startsWith('/') || 
                                 url.includes('localhost') || 
                                 url.includes('127.0.0.1') ||
                                 url.includes('api');
            
            if (isLocalRequest) {
              try {
                const res = await window.mockBackend.handle(method, url, options.body);
                return new Response(JSON.stringify(res.data), { 
                  status: res.status,
                  headers: { 'Content-Type': 'application/json' }
                });
              } catch (error) {
                console.error('Mock backend error:', error);
                return new Response(JSON.stringify({ error: 'Mock backend failed' }), {
                  status: 500,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            }
            return originalFetch(url, options);
          };
        })();
      </script>
    `;
  };

  // 5. Generate the Document - FIXED VERSION
  const getSrcDoc = React.useCallback(() => {
    try {
      setError(null);
      
      const htmlFile = safeFiles.find(f => 
        f.name.endsWith('.html') || f.language === CodeLanguage.HTML
      )?.content || '<div id="root"></div>';

      const cssContent = safeFiles
        .filter(f => f.name.endsWith('.css') || f.language === CodeLanguage.CSS)
        .map(f => f.content)
        .join('\n');

      const jsFiles = safeFiles.filter(f => 
        f.name.match(/\.(js|jsx|ts|tsx)$/) && 
        !f.name.includes('server') &&
        f.language !== CodeLanguage.HTML
      );

      // Transform JS content safely
      const scripts = jsFiles.map(f => {
        const content = f.content || '';
        const isReact = content.includes('React') || 
                       f.name.endsWith('.jsx') || 
                       f.name.endsWith('.tsx') ||
                       content.includes('createElement') ||
                       content.includes('JSX');
        
        const scriptType = isReact ? 'text/babel' : 'module';
        
        return `
          <script type="${scriptType}" data-presets="${isReact ? 'react,typescript' : 'env'}">
            try {
              ${content}
            } catch(e) {
              console.error('Error in ${f.name}:', e);
              window.parent.postMessage({ 
                type: 'error', 
                message: '${f.name}: ' + e.message 
              }, '*');
            }
          </script>
        `;
      }).join('\n');

      const importMap = generateImportMap();
      const backendScript = generateBackendScript(backendEndpoints);

      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Web Preview</title>
          <script type="importmap">
            ${importMap}
          </script>
          <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            ${cssContent}
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              margin: 0; 
              padding: 20px;
              background: #f5f5f5;
            }
            #root { min-height: 100vh; }
            .error-boundary {
              background: #fee;
              border: 1px solid #fcc;
              padding: 20px;
              margin: 10px;
              border-radius: 8px;
              color: #c33;
            }
          </style>
          <script>
            // Enhanced Console Override
            (function() {
              const originalConsole = {
                log: console.log,
                error: console.error,
                warn: console.warn,
                info: console.info,
                debug: console.debug
              };

              function sendToParent(level, args) {
                try {
                  const safeArgs = args.map(arg => {
                    if (typeof arg === 'object') {
                      try {
                        return JSON.stringify(arg, null, 2);
                      } catch {
                        return String(arg);
                      }
                    }
                    return String(arg);
                  });
                  
                  window.parent.postMessage({ 
                    type: 'console', 
                    level: level, 
                    args: safeArgs 
                  }, '*');
                } catch (e) {
                  // Silent fail - can't send to parent
                }
              }

              // Override all console methods
              ['log', 'error', 'warn', 'info', 'debug'].forEach(method => {
                console[method] = function(...args) {
                  originalConsole[method].apply(console, args);
                  sendToParent(method, args);
                };
              });

              // Global error handlers
              window.addEventListener('error', (event) => {
                sendToParent('error', [
                  \`\${event.filename}:\${event.lineno}:\${event.colno} - \${event.message}\`
                ]);
              });

              window.addEventListener('unhandledrejection', (event) => {
                sendToParent('error', [
                  'Unhandled Promise Rejection:',
                  event.reason?.message || event.reason
                ]);
              });
            })();
          </script>
          ${backendScript}
        </head>
        <body>
          <div id="error-boundary" style="display: none;">
            <div class="error-boundary">
              <h3>Runtime Error</h3>
              <p id="error-message"></p>
            </div>
          </div>
          ${htmlFile}
          ${scripts}
          
          <script>
            // Initialize React apps if they exist
            if (typeof React !== 'undefined' && typeof ReactDOM !== 'undefined') {
              const rootElement = document.getElementById('root');
              if (rootElement && !rootElement.innerHTML.trim()) {
                // Auto-create a simple React app if root is empty
                const App = () => React.createElement('div', { 
                  style: { padding: '20px', textAlign: 'center' } 
                }, 'React App Loaded Successfully!');
                
                try {
                  const root = ReactDOM.createRoot(rootElement);
                  root.render(React.createElement(App));
                } catch (e) {
                  console.error('Failed to render React app:', e);
                }
              }
            }
            
            // Show loading complete
            console.log('🚀 Web preview environment ready');
            console.log('📦 Loaded', ${jsFiles.length}, 'JavaScript files');
            console.log('🔌 Backend endpoints:', ${backendEndpoints.length});
          </script>
        </body>
        </html>
      `;
    } catch (e: any) {
      console.error('Error generating preview:', e);
      setError(`Failed to generate preview: ${e.message}`);
      
      // Return a simple error page
      return `
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body style="font-family: sans-serif; padding: 20px; background: #fee; color: #c33;">
          <h1>Preview Generation Error</h1>
          <p>${e.message}</p>
          <p>Check the console for details.</p>
        </body>
        </html>
      `;
    }
  }, [safeFiles, backendEndpoints]);

  const handleRefresh = () => {
    setLogs([]);
    setNetworkRequests([]);
    setError(null);
    setIsLoading(true);
    setKey(prev => prev + 1);
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setError('Failed to load preview');
    setIsLoading(false);
  };

  // Clear logs and requests when changing views
  React.useEffect(() => {
    if (activeView !== 'preview') {
      setLogs([]);
      setNetworkRequests([]);
    }
  }, [activeView]);

  return (
    <div className="flex flex-col h-full w-full bg-gray-100 border border-gray-300 rounded-lg overflow-hidden font-sans">
      {/* --- Toolbar --- */}
      <div className={`flex items-center justify-between px-3 py-2 border-b bg-white`}>
        <div className="flex items-center gap-2">
          {/* URL Bar Simulation */}
          <div className="flex items-center bg-gray-100 rounded-md px-3 py-1.5 w-64 border border-gray-200">
            <Globe className="w-3 h-3 text-gray-500 mr-2" />
            <span className="text-xs text-gray-600 truncate">localhost:3000/preview</span>
          </div>

          <div className="h-4 w-px bg-gray-300 mx-2" />

          {/* Device Toggles */}
          <div className="flex bg-gray-100 rounded-md p-0.5">
            <button 
              onClick={() => setDeviceMode('desktop')}
              className={`p-1.5 rounded ${deviceMode === 'desktop' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => setDeviceMode('mobile')}
              className={`p-1.5 rounded ${deviceMode === 'mobile' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setActiveView('preview')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                activeView === 'preview' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
              }`}
            >
              Preview
            </button>
            {backendEndpoints.length > 0 && (
              <button
                onClick={() => setActiveView('backend')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                  activeView === 'backend' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
                }`}
              >
                APIs <span className="bg-gray-200 text-gray-600 px-1 rounded text-[10px]">{backendEndpoints.length}</span>
              </button>
            )}
            <button
              onClick={() => setActiveView('code')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                activeView === 'code' ? 'bg-white shadow text-gray-800' : 'text-gray-500'
              }`}
            >
              Source
            </button>
          </div>

          <button 
            onClick={handleRefresh} 
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
            title="Refresh Preview"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* --- Main Content Area --- */}
      <div className="flex-grow relative bg-gray-200 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Loading preview...</p>
            </div>
          </div>
        )}

        {activeView === 'preview' && (
          <div className="w-full h-full flex items-center justify-center p-4">
            <div 
              className={`transition-all duration-300 relative bg-white shadow-xl ${
                deviceMode === 'mobile' ? 
                'w-[375px] h-[667px] rounded-3xl border-8 border-gray-800' : 
                'w-full h-full'
              }`}
            >
              {/* Mobile Notch Mockup */}
              {deviceMode === 'mobile' && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-gray-800 rounded-b-xl z-20"></div>
              )}

              {error && (
                <div className="absolute top-4 left-4 right-4 z-50 bg-red-50 text-red-600 p-3 rounded-md border border-red-200 text-xs flex items-start gap-2 shadow-lg">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Runtime Error</div>
                    <div>{error}</div>
                  </div>
                </div>
              )}

              <iframe
                key={key}
                srcDoc={getSrcDoc()}
                className="w-full h-full border-none bg-white"
                sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            </div>
          </div>
        )}

        {/* --- Backend View --- */}
        {activeView === 'backend' && (
          <div className="absolute inset-0 bg-white overflow-auto p-8">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Server className="w-6 h-6 text-blue-500" /> 
                Detected API Endpoints ({backendEndpoints.length})
              </h2>
              {backendEndpoints.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No API endpoints detected</p>
                  <p className="text-sm mt-2">Add Express.js routes or fetch calls to see endpoints here</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {backendEndpoints.map((ep, i) => (
                    <div key={i} className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                          ep.method === 'GET' ? 'bg-green-500' : 
                          ep.method === 'POST' ? 'bg-blue-500' : 
                          ep.method === 'DELETE' ? 'bg-red-500' : 'bg-yellow-500'
                        }`}>
                          {ep.method}
                        </span>
                        <code className="bg-gray-100 px-3 py-1 rounded text-sm text-gray-700 font-mono">
                          {ep.path}
                        </code>
                      </div>
                      <p className="text-xs text-gray-500 font-mono">Handler: {ep.handler}</p>
                      {ep.response && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                          <div className="text-gray-500 mb-1">Mock Response:</div>
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(ep.response, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- Source Code View --- */}
        {activeView === 'code' && (
          <div className="absolute inset-0 bg-[#1e1e1e] overflow-auto">
            {safeFiles.length === 0 ? (
              <div className="text-center text-gray-400 py-10">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No files to display</p>
              </div>
            ) : (
              safeFiles.map((file, i) => (
                <div key={i} className="border-b border-gray-700">
                  <div className="bg-[#2d2d2d] px-4 py-2 text-xs text-gray-300 flex items-center gap-2">
                    <FileText className="w-3 h-3" /> 
                    {file.name}
                    <span className="text-gray-500 text-xs">({file.language || 'unknown'})</span>
                  </div>
                  <pre className="p-4 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre">
                    {file.content || '<empty file>'}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* --- DevTools Pane --- */}
      {activeView === 'preview' && showDevTools && (
        <div className="border-t border-gray-300 bg-white flex flex-col" style={{ height: '200px' }}>
          <div className="flex items-center justify-between px-3 bg-gray-50 border-b border-gray-200 h-8 shrink-0">
            <div className="flex gap-4">
              <button 
                onClick={() => setActiveTab('console')}
                className={`text-xs h-8 px-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'console' ? 'border-blue-500 text-gray-800 font-medium' : 'border-transparent text-gray-500'
                }`}
              >
                <Terminal className="w-3 h-3" /> Console 
                {logs.length > 0 && (
                  <span className="bg-gray-200 text-gray-600 px-1.5 rounded-full text-[10px]">
                    {logs.length}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setActiveTab('network')}
                className={`text-xs h-8 px-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'network' ? 'border-blue-500 text-gray-800 font-medium' : 'border-transparent text-gray-500'
                }`}
              >
                <Wifi className="w-3 h-3" /> Network
                {networkRequests.length > 0 && (
                  <span className="bg-gray-200 text-gray-600 px-1.5 rounded-full text-[10px]">
                    {networkRequests.length}
                  </span>
                )}
              </button>
            </div>
            <button 
              onClick={() => setShowDevTools(false)} 
              className="text-gray-400 hover:text-gray-600"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-grow overflow-auto bg-white font-mono text-xs">
            {activeTab === 'console' ? (
              <div className="p-2 space-y-1">
                {logs.length === 0 ? (
                  <div className="text-gray-400 italic p-2">Console is empty. Interact with your app to see logs.</div>
                ) : (
                  logs.map((log, i) => (
                    <div 
                      key={i} 
                      className={`flex gap-2 py-1 border-b border-gray-50 ${
                        log.type === 'error' ? 'text-red-600 bg-red-50/50' : 
                        log.type === 'warn' ? 'text-amber-600 bg-amber-50/50' : 'text-gray-700'
                      }`}
                    >
                      <span className="text-gray-400 select-none shrink-0 w-16 text-right mr-2">
                        {log.timestamp}
                      </span>
                      <span className="whitespace-pre-wrap break-words">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="w-full">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 font-normal text-gray-500 text-xs">Status</th>
                      <th className="p-2 font-normal text-gray-500 text-xs">Method</th>
                      <th className="p-2 font-normal text-gray-500 text-xs">URL</th>
                      <th className="p-2 font-normal text-gray-500 text-xs">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {networkRequests.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-gray-400 italic">
                          No network activity
                        </td>
                      </tr>
                    ) : (
                      networkRequests.map((req, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="p-2">
                            {req.status >= 400 ? (
                              <span className="text-red-500 flex items-center gap-1">
                                <XCircle className="w-3 h-3"/> {req.status}
                              </span>
                            ) : (
                              <span className="text-green-500 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3"/> {req.status}
                              </span>
                            )}
                          </td>
                          <td className="p-2 font-bold text-gray-600 text-xs">{req.method}</td>
                          <td className="p-2 text-gray-800 text-xs font-mono">{req.url}</td>
                          <td className="p-2 text-gray-500 text-xs">{req.duration}ms</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'preview' && !showDevTools && (
        <button
          onClick={() => setShowDevTools(true)}
          className="border-t border-gray-300 bg-gray-50 text-gray-600 text-xs py-1 hover:bg-gray-100 transition-colors flex items-center justify-center gap-1"
        >
          <Activity className="w-3 h-3" />
          Show DevTools
        </button>
      )}
    </div>
  );
};

export default WebPreview;