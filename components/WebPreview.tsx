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
    // Add common utilities automatically
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

  // 2. Debounce logic could go here, but for now we rely on explicit refresh or useEffect dependency
  
  // 3. Backend & API Detection
  React.useEffect(() => {
    const endpoints: BackendEndpoint[] = [];
    const backendFiles = safeFiles.filter(f => 
      f.name.match(/server|api|route|controller/i) || 
      (f.content && f.content.match(/app\.(get|post|put|delete)/))
    );

    backendFiles.forEach(file => {
      const content = file.content || '';
      // Regex to capture app.method('/path', ...)
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

  // 4. Communication with Iframe (Logs & Network)
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || !data.type) return;

      if (data.type === 'console') {
        setLogs(prev => [...prev, {
          type: data.level,
          message: data.args.join(' '),
          timestamp: new Date().toLocaleTimeString()
        }]);
      } else if (data.type === 'network') {
        setNetworkRequests(prev => [...prev, {
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

  // 5. Generate the mock backend script with Persistence
  const generateBackendScript = (endpoints: BackendEndpoint[]) => `
    <script>
      (function() {
        // --- Persistence Layer ---
        const DB_KEY = 'mock_db_store';
        const getDb = () => JSON.parse(sessionStorage.getItem(DB_KEY) || '{}');
        const saveDb = (data) => sessionStorage.setItem(DB_KEY, JSON.stringify(data));
        
        // --- Mock Backend Logic ---
        window.mockBackend = {
          endpoints: ${JSON.stringify(endpoints)},
          handle: async (method, url, body) => {
            const db = getDb();
            // Simple path matching
            const endpoint = window.mockBackend.endpoints.find(ep => url.includes(ep.path) && ep.method === method);
            
            // Artificial Delay
            await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
            const startTime = performance.now();
            
            let response = { status: 404, data: { error: 'Not Found' } };

            if (endpoint) {
              // Simple "Create" simulation for POST
              if (method === 'POST') {
                const collection = endpoint.path.split('/').pop() || 'items';
                if (!db[collection]) db[collection] = [];
                const newItem = { id: Date.now(), ...JSON.parse(body || '{}') };
                db[collection].push(newItem);
                saveDb(db);
                response = { status: 201, data: newItem };
              } 
              // Simple "Read" simulation for GET
              else if (method === 'GET') {
                 const collection = endpoint.path.split('/').pop() || 'items';
                 response = { status: 200, data: db[collection] || endpoint.response || { message: 'Success' } };
              }
              else {
                response = { status: 200, data: endpoint.response };
              }
            }

            // Report to Parent
            window.parent.postMessage({
              type: 'network',
              method,
              url,
              status: response.status,
              duration: Math.round(performance.now() - startTime)
            }, '*');

            return response;
          }
        };

        // --- Fetch Override ---
        const originalFetch = window.fetch;
        window.fetch = async (url, options = {}) => {
          const method = (options.method || 'GET').toUpperCase();
          if (url.startsWith('/') || url.includes('localhost') || url.includes('api')) {
             const res = await window.mockBackend.handle(method, url, options.body);
             return new Response(JSON.stringify(res.data), { 
               status: res.status,
               headers: { 'Content-Type': 'application/json' }
             });
          }
          return originalFetch(url, options);
        };
      })();
    </script>
  `;

  // 6. Generate the Document
  const getSrcDoc = () => {
    try {
      setError(null);
      const htmlFile = safeFiles.find(f => f.name.endsWith('.html'))?.content || 
        '<div id="root"></div>'; // Default root for React
      
      const cssContent = safeFiles
        .filter(f => f.name.endsWith('.css'))
        .map(f => f.content).join('\n');
        
      const jsFiles = safeFiles.filter(f => f.name.match(/\.(js|jsx|ts|tsx)$/) && !f.name.includes('server'));

      // Transform JS (Very basic naive transform for example)
      // In production, you'd use @babel/standalone properly
      const scripts = jsFiles.map(f => {
        const isReact = f.content?.includes('React') || f.name.endsWith('jsx') || f.name.endsWith('tsx');
        return `
          <script type="${isReact ? 'text/babel' : 'module'}" data-presets="react,env">
            try {
              ${f.content}
            } catch(e) {
              console.error(e);
              window.parent.postMessage({ type: 'error', message: e.message }, '*');
            }
          </script>
        `;
      }).join('\n');

      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <script type="importmap">
            ${generateImportMap()}
          </script>
          <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            ${cssContent}
            body { font-family: sans-serif; margin: 0; padding: 0; }
          </style>
          <script>
            // Console Override
            const originalLog = console.log;
            const originalError = console.error;
            const originalWarn = console.warn;
            
            function sendLog(level, args) {
              // Convert objects to strings for safe messaging
              const safeArgs = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
              );
              window.parent.postMessage({ type: 'console', level, args: safeArgs }, '*');
            }

            console.log = (...args) => { originalLog(...args); sendLog('log', args); };
            console.error = (...args) => { originalError(...args); sendLog('error', args); };
            console.warn = (...args) => { originalWarn(...args); sendLog('warn', args); };
            
            window.onerror = (msg) => sendLog('error', [msg]);
          </script>
          ${generateBackendScript(backendEndpoints)}
        </head>
        <body>
          ${htmlFile}
          ${scripts}
        </body>
        </html>
      `;
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  };

  const handleRefresh = () => {
    setLogs([]);
    setNetworkRequests([]);
    setIsLoading(true);
    setKey(k => k + 1);
  };

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
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeView === 'preview' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
            >
              Preview
            </button>
            <button
              onClick={() => setActiveView('backend')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${activeView === 'backend' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
            >
              APIs <span className="bg-gray-200 text-gray-600 px-1 rounded text-[10px]">{backendEndpoints.length}</span>
            </button>
            <button
              onClick={() => setActiveView('code')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeView === 'code' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
            >
              Source
            </button>
          </div>

          <button 
            onClick={handleRefresh} 
            className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* --- Main Content Area --- */}
      <div className="flex-grow relative bg-gray-200 overflow-hidden flex flex-col items-center justify-center">
        {activeView === 'preview' && (
          <div 
            className={`transition-all duration-300 relative bg-white shadow-xl ${
              deviceMode === 'mobile' ? 'w-[375px] h-[667px] rounded-3xl border-8 border-gray-800' : 'w-full h-full'
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
              onLoad={() => setIsLoading(false)}
            />
          </div>
        )}

        {/* --- Backend View --- */}
        {activeView === 'backend' && (
          <div className="absolute inset-0 bg-white overflow-auto p-8 w-full">
             <div className="max-w-3xl mx-auto">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Server className="w-6 h-6 text-blue-500" /> 
                  Detected Endpoints
                </h2>
                {backendEndpoints.length === 0 ? (
                  <div className="text-gray-400 text-center py-10">No endpoints detected</div>
                ) : (
                  <div className="grid gap-4">
                    {backendEndpoints.map((ep, i) => (
                      <div key={i} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                         <div className="flex items-center gap-3 mb-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${
                              ep.method === 'GET' ? 'bg-green-500' : 
                              ep.method === 'POST' ? 'bg-blue-500' : 
                              ep.method === 'DELETE' ? 'bg-red-500' : 'bg-yellow-500'
                            }`}>{ep.method}</span>
                            <code className="bg-gray-100 px-2 py-0.5 rounded text-sm text-gray-700">{ep.path}</code>
                         </div>
                         <p className="text-xs text-gray-500 font-mono">Handler: {ep.handler}</p>
                      </div>
                    ))}
                  </div>
                )}
             </div>
          </div>
        )}
        
        {/* --- Source Code View --- */}
        {activeView === 'code' && (
          <div className="absolute inset-0 bg-[#1e1e1e] overflow-auto p-0 w-full">
            {safeFiles.map((file, i) => (
              <div key={i} className="border-b border-gray-700">
                <div className="bg-[#2d2d2d] px-4 py-2 text-xs text-gray-300 flex items-center gap-2">
                  <FileText className="w-3 h-3" /> {file.name}
                </div>
                <pre className="p-4 text-xs font-mono text-blue-300 overflow-x-auto">
                  {file.content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- DevTools Pane --- */}
      {activeView === 'preview' && (
        <div className={`border-t border-gray-300 bg-white transition-all duration-300 flex flex-col ${showDevTools ? 'h-48' : 'h-8'}`}>
          <div className="flex items-center justify-between px-3 bg-gray-50 border-b border-gray-200 h-8 shrink-0">
            <div className="flex gap-4">
              <button 
                onClick={() => setActiveTab('console')}
                className={`text-xs h-8 px-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'console' ? 'border-blue-500 text-gray-800 font-medium' : 'border-transparent text-gray-500'
                }`}
              >
                <Terminal className="w-3 h-3" /> Console 
                {logs.length > 0 && <span className="bg-gray-200 text-gray-600 px-1.5 rounded-full text-[10px]">{logs.length}</span>}
              </button>
              <button 
                onClick={() => setActiveTab('network')}
                className={`text-xs h-8 px-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'network' ? 'border-blue-500 text-gray-800 font-medium' : 'border-transparent text-gray-500'
                }`}
              >
                <Wifi className="w-3 h-3" /> Network
                {networkRequests.length > 0 && <span className="bg-gray-200 text-gray-600 px-1.5 rounded-full text-[10px]">{networkRequests.length}</span>}
              </button>
            </div>
            <button onClick={() => setShowDevTools(!showDevTools)} className="text-gray-400 hover:text-gray-600">
               <Activity className={`w-3.5 h-3.5 transition-transform ${showDevTools ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div className="flex-grow overflow-auto bg-white font-mono text-xs">
            {activeTab === 'console' ? (
               <div className="p-2 space-y-1">
                 {logs.length === 0 && <div className="text-gray-400 italic p-2">Console is empty</div>}
                 {logs.map((log, i) => (
                   <div key={i} className={`flex gap-2 py-1 border-b border-gray-50 ${
                     log.type === 'error' ? 'text-red-600 bg-red-50/50' : 
                     log.type === 'warn' ? 'text-amber-600 bg-amber-50/50' : 'text-gray-700'
                   }`}>
                      <span className="text-gray-400 select-none shrink-0 w-16 text-right mr-2">{log.timestamp}</span>
                      <span className="whitespace-pre-wrap">{log.message}</span>
                   </div>
                 ))}
               </div>
            ) : (
              <div className="w-full">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 font-normal text-gray-500">Status</th>
                      <th className="p-2 font-normal text-gray-500">Method</th>
                      <th className="p-2 font-normal text-gray-500">File</th>
                      <th className="p-2 font-normal text-gray-500">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {networkRequests.map((req, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="p-2">
                          {req.status >= 400 ? (
                            <span className="text-red-500 flex items-center gap-1"><XCircle className="w-3 h-3"/> {req.status}</span>
                          ) : (
                            <span className="text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> {req.status}</span>
                          )}
                        </td>
                        <td className="p-2 font-bold text-gray-600">{req.method}</td>
                        <td className="p-2 text-gray-800">{req.url}</td>
                        <td className="p-2 text-gray-500">{req.duration}ms</td>
                      </tr>
                    ))}
                    {networkRequests.length === 0 && (
                      <tr><td colSpan={4} className="p-4 text-center text-gray-400 italic">No network activity</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WebPreview;