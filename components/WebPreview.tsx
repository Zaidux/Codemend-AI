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
const generateImportMap = () => {
  return JSON.stringify({
    imports: {
      // We map 'react' to a blob ensuring we use the global UMD version if available, 
      // or fall back to ESM. This fixes the Babel "React is not defined" issues.
      "react": "https://esm.sh/react@18.2.0",
      "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
      "vue": "https://esm.sh/vue@3.3.4",
      "canvas-confetti": "https://esm.sh/canvas-confetti",
      "lodash": "https://esm.sh/lodash",
      "axios": "https://esm.sh/axios"
    }
  }, null, 2);
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

  // 1. Safe File Filtering & Memoization
  // We use JSON.stringify to ensure deep equality check, preventing loops if parent passes new array ref
  const safeFiles = React.useMemo(() => {
    return (files || []).filter(file => file && file.name && file.content !== undefined);
  }, [JSON.stringify(files.map(f => ({ name: f.name, content: f.content, language: f.language })))]);

  // 2. Detect Backend Endpoints (Memoized)
  const backendEndpoints = React.useMemo(() => {
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
    return endpoints;
  }, [safeFiles]);

  // 3. Communication Handler
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || !data.type) return;

      if (data.type === 'console') {
        setLogs(prev => [...prev.slice(-99), {
          type: data.level,
          message: data.args.join(' '),
          timestamp: new Date().toLocaleTimeString()
        }]);
      } else if (data.type === 'network') {
        setNetworkRequests(prev => [...prev.slice(-49), {
          method: data.method,
          url: data.url,
          status: data.status,
          duration: data.duration,
          timestamp: new Date().toLocaleTimeString()
        }]);
      } else if (data.type === 'error') {
        // Only set error if it's new to prevent flicker
        setError(prev => prev === data.message ? prev : data.message);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 4. Generate Mock Backend Script
  const generateBackendScript = (endpoints: BackendEndpoint[]) => `
    <script>
      (function() {
        const DB_KEY = 'mock_db_store';
        const getDb = () => { try { return JSON.parse(sessionStorage.getItem(DB_KEY) || '{}'); } catch { return {}; } };
        const saveDb = (data) => sessionStorage.setItem(DB_KEY, JSON.stringify(data));
        
        window.mockBackend = {
          endpoints: ${JSON.stringify(endpoints)},
          handle: async (method, url, body) => {
            const db = getDb();
            const endpoint = window.mockBackend.endpoints.find(ep => url.includes(ep.path) && ep.method === method);
            
            await new Promise(r => setTimeout(r, 200 + Math.random() * 300)); // Simulate latency
            
            if (endpoint) {
              if (method === 'POST') {
                const collection = endpoint.path.split('/').pop() || 'items';
                if (!db[collection]) db[collection] = [];
                const newItem = { id: Date.now(), ...(body ? JSON.parse(body) : {}) };
                db[collection].push(newItem);
                saveDb(db);
                return { status: 201, data: newItem };
              } 
              if (method === 'GET') {
                const collection = endpoint.path.split('/').pop() || 'items';
                return { status: 200, data: db[collection] || endpoint.response || { message: 'Success' } };
              }
              return { status: 200, data: endpoint.response || { success: true } };
            }
            return { status: 404, data: { error: 'Not Found' } };
          }
        };

        const originalFetch = window.fetch;
        window.fetch = async (url, options = {}) => {
          const method = (options.method || 'GET').toUpperCase();
          // Intercept local API calls
          if (url.startsWith('/') || url.includes('localhost') || url.includes('api')) {
             const startTime = performance.now();
             try {
               const res = await window.mockBackend.handle(method, url, options.body);
               window.parent.postMessage({
                  type: 'network', method, url, status: res.status, duration: Math.round(performance.now() - startTime)
               }, '*');
               return new Response(JSON.stringify(res.data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
             } catch(e) {
               console.error('Backend Error', e);
               return new Response(JSON.stringify({error: 'Server Error'}), { status: 500 });
             }
          }
          return originalFetch(url, options);
        };
      })();
    </script>
  `;

  // 5. Generate Source Document (Memoized to prevent reload loops)
  const srcDoc = React.useMemo(() => {
    try {
      const htmlFile = safeFiles.find(f => f.name.endsWith('.html'))?.content || '<div id="root"></div>';
      const cssContent = safeFiles.filter(f => f.name.endsWith('.css')).map(f => f.content).join('\n');
      const jsFiles = safeFiles.filter(f => f.name.match(/\.(js|jsx|ts|tsx)$/) && !f.name.match(/server|api/));

      const scripts = jsFiles.map(f => {
        let content = f.content || '';
        const isReact = content.includes('React') || f.name.endsWith('jsx') || f.name.endsWith('tsx');
        
        // Auto-inject React import if missing for JSX files
        if (isReact && !content.includes('import React')) {
          content = `import React from 'react';\n${content}`;
        }

        return `
          <script type="text/babel" data-type="module" data-presets="react,env">
            ${content}
          </script>
        `;
      }).join('\n');

      return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <script src="https://cdn.tailwindcss.com"></script>
          
          <!-- Import Map for Modules -->
          <script type="importmap">
            ${generateImportMap()}
          </script>

          <!-- Babel for Runtime Compilation -->
          <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

          <style>
            ${cssContent}
            body { font-family: -apple-system, sans-serif; margin: 0; padding: 0; background: #fff; }
            #root { padding: 20px; }
          </style>

          <script>
            // Console Bridge
            ['log', 'error', 'warn', 'info'].forEach(method => {
              const original = console[method];
              console[method] = (...args) => {
                original.apply(console, args);
                window.parent.postMessage({ 
                  type: 'console', 
                  level: method, 
                  args: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)) 
                }, '*');
              };
            });
            
            window.onerror = (msg) => window.parent.postMessage({ type: 'error', message: msg }, '*');
          </script>
          ${generateBackendScript(backendEndpoints)}
        </head>
        <body>
          ${htmlFile}
          ${scripts}
          <script>
             // Final check to see if React mounted, if not, help out
             setTimeout(() => {
                if (!document.getElementById('root').innerHTML && typeof React !== 'undefined') {
                   console.log('ℹ️ No React root rendered. Ensure you called ReactDOM.createRoot().render()');
                }
             }, 1000);
          </script>
        </body>
        </html>
      `;
    } catch (e: any) {
      return `<html><body><h3 style="color:red">Build Error</h3><p>${e.message}</p></body></html>`;
    }
  }, [safeFiles, backendEndpoints]); // Dependency safeFiles is deep-compared now

  const handleRefresh = () => {
    setLogs([]);
    setNetworkRequests([]);
    setError(null);
    setIsLoading(true);
    setKey(prev => prev + 1);
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-100 border border-gray-300 rounded-lg overflow-hidden font-sans">
      {/* --- Toolbar --- */}
      <div className={`flex items-center justify-between px-3 py-2 border-b bg-white`}>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-md px-3 py-1.5 w-64 border border-gray-200">
            <Globe className="w-3 h-3 text-gray-500 mr-2" />
            <span className="text-xs text-gray-600 truncate">localhost:3000</span>
          </div>
          <div className="h-4 w-px bg-gray-300 mx-2" />
          <div className="flex bg-gray-100 rounded-md p-0.5">
            <button onClick={() => setDeviceMode('desktop')} className={`p-1.5 rounded ${deviceMode === 'desktop' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}><Monitor className="w-3.5 h-3.5" /></button>
            <button onClick={() => setDeviceMode('mobile')} className={`p-1.5 rounded ${deviceMode === 'mobile' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}><Smartphone className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setActiveView('preview')} className={`px-3 py-1 text-xs font-medium rounded-md ${activeView === 'preview' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>Preview</button>
            {backendEndpoints.length > 0 && (
              <button onClick={() => setActiveView('backend')} className={`px-3 py-1 text-xs font-medium rounded-md ${activeView === 'backend' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>APIs ({backendEndpoints.length})</button>
            )}
            <button onClick={() => setActiveView('code')} className={`px-3 py-1 text-xs font-medium rounded-md ${activeView === 'code' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>Source</button>
          </div>
          <button onClick={handleRefresh} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      {/* --- Main Area --- */}
      <div className="flex-grow relative bg-gray-200 overflow-hidden flex flex-col items-center">
        {activeView === 'preview' && (
          <div className={`transition-all duration-300 relative bg-white shadow-xl my-4 ${deviceMode === 'mobile' ? 'w-[375px] h-[667px] rounded-3xl border-8 border-gray-800' : 'w-full h-full'}`}>
            {error && (
              <div className="absolute top-4 left-4 right-4 z-50 bg-red-50 text-red-600 p-3 rounded-md border border-red-200 text-xs flex gap-2 shadow-lg">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <div><strong>Runtime Error:</strong> {error}</div>
              </div>
            )}
            <iframe
              key={key}
              srcDoc={srcDoc}
              className="w-full h-full border-none bg-white"
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
              onLoad={() => setIsLoading(false)}
            />
          </div>
        )}

        {activeView === 'backend' && (
          <div className="w-full h-full bg-white p-6 overflow-auto">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Server className="w-5 h-5" /> Detected Endpoints</h2>
            <div className="grid gap-3 max-w-3xl">
              {backendEndpoints.map((ep, i) => (
                <div key={i} className="border p-3 rounded flex items-center gap-3">
                  <span className={`px-2 py-1 text-xs font-bold text-white rounded ${ep.method === 'GET' ? 'bg-green-500' : 'bg-blue-500'}`}>{ep.method}</span>
                  <code className="bg-gray-100 px-2 py-1 rounded text-sm">{ep.path}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'code' && (
          <div className="w-full h-full bg-[#1e1e1e] p-0 overflow-auto">
            {safeFiles.map((f, i) => (
              <div key={i} className="border-b border-gray-700">
                <div className="bg-[#2d2d2d] px-4 py-2 text-xs text-gray-300 flex items-center gap-2"><FileText className="w-3 h-3" /> {f.name}</div>
                <pre className="p-4 text-xs font-mono text-blue-300 overflow-x-auto">{f.content}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- DevTools --- */}
      {activeView === 'preview' && (
        <div className={`border-t border-gray-300 bg-white flex flex-col transition-all duration-300 ${showDevTools ? 'h-48' : 'h-8'}`}>
          <div className="flex items-center justify-between px-3 bg-gray-50 border-b h-8 shrink-0">
            <div className="flex gap-4">
              <button onClick={() => setActiveTab('console')} className={`text-xs h-8 px-2 border-b-2 flex items-center gap-1 ${activeTab === 'console' ? 'border-blue-500 text-gray-800' : 'border-transparent text-gray-500'}`}>
                <Terminal className="w-3 h-3" /> Console {logs.length > 0 && <span className="bg-gray-200 px-1.5 rounded-full text-[10px]">{logs.length}</span>}
              </button>
              <button onClick={() => setActiveTab('network')} className={`text-xs h-8 px-2 border-b-2 flex items-center gap-1 ${activeTab === 'network' ? 'border-blue-500 text-gray-800' : 'border-transparent text-gray-500'}`}>
                <Wifi className="w-3 h-3" /> Network {networkRequests.length > 0 && <span className="bg-gray-200 px-1.5 rounded-full text-[10px]">{networkRequests.length}</span>}
              </button>
            </div>
            <button onClick={() => setShowDevTools(!showDevTools)} className="text-gray-400 hover:text-gray-600"><Activity className={`w-3.5 h-3.5 transition-transform ${showDevTools ? 'rotate-180' : ''}`} /></button>
          </div>
          
          <div className="flex-grow overflow-auto bg-white font-mono text-xs">
            {activeTab === 'console' ? (
              <div className="p-2 space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className={`flex gap-2 py-1 border-b border-gray-50 ${log.type === 'error' ? 'text-red-600 bg-red-50' : 'text-gray-700'}`}>
                    <span className="text-gray-400 w-16 text-right shrink-0">{log.timestamp}</span>
                    <span className="whitespace-pre-wrap">{log.message}</span>
                  </div>
                ))}
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-gray-50 sticky top-0"><tr><th className="p-2">Status</th><th className="p-2">Method</th><th className="p-2">URL</th><th className="p-2">Time</th></tr></thead>
                <tbody>
                  {networkRequests.map((req, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="p-2">{req.status < 400 ? <span className="text-green-500 flex gap-1 items-center"><CheckCircle className="w-3 h-3"/> {req.status}</span> : <span className="text-red-500 flex gap-1 items-center"><XCircle className="w-3 h-3"/> {req.status}</span>}</td>
                      <td className="p-2 font-bold">{req.method}</td>
                      <td className="p-2">{req.url}</td>
                      <td className="p-2 text-gray-500">{req.duration}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WebPreview;