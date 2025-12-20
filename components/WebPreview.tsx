import * as React from 'react';
import { 
  RefreshCw, AlertCircle, Code, FileText, Server, Globe, 
  Smartphone, Monitor, Terminal, Activity, XCircle, CheckCircle, Wifi, Play
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

const WebPreview: React.FC<WebPreviewProps> = ({ files, theme }) => {
  // UI State
  const [activeView, setActiveView] = React.useState<'preview' | 'code' | 'backend'>('preview');
  const [deviceMode, setDeviceMode] = React.useState<'desktop' | 'mobile'>('desktop');
  const [showDevTools, setShowDevTools] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<'console' | 'network'>('console');
  
  // Data State
  const [key, setKey] = React.useState(0);
  const [logs, setLogs] = React.useState<ConsoleLog[]>([]);
  const [networkRequests, setNetworkRequests] = React.useState<NetworkRequest[]>([]);
  const [backendEndpoints, setBackendEndpoints] = React.useState<BackendEndpoint[]>([]);
  const [debouncedFiles, setDebouncedFiles] = React.useState<ProjectFile[]>([]);
  const [isDebouncing, setIsDebouncing] = React.useState(false);
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);
  const [showSourceCode, setShowSourceCode] = React.useState(false);

  // 1. Debounce Files to prevent Infinite Loops and flashing
  React.useEffect(() => {
    setIsDebouncing(true);
    const handler = setTimeout(() => {
      setDebouncedFiles(files || []);
      setIsDebouncing(false);
    }, 1000); // Wait 1 second after typing stops before recompiling

    return () => clearTimeout(handler);
  }, [files]);

  // 2. Extract Backend Endpoints (Memoized)
  React.useEffect(() => {
    if (isDebouncing) return;

    const endpoints: BackendEndpoint[] = [];
    const backendFiles = debouncedFiles.filter(f => 
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
          handler: `Route in ${file.name}`,
          response: { success: true, message: 'Mock Response' }
        });
      }
    });
    setBackendEndpoints(endpoints);
  }, [debouncedFiles, isDebouncing]);

  // 3. Handle Messages from Iframe
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
        setNetworkRequests(prev => [...prev.slice(-19), {
          method: data.method,
          url: data.url,
          status: data.status,
          duration: data.duration,
          timestamp: new Date().toLocaleTimeString()
        }]);
      } else if (data.type === 'error') {
        // Capture runtime errors
        setRuntimeError(data.message);
        setLogs(prev => [...prev.slice(-99), {
          type: 'error',
          message: `Runtime Error: ${data.message}`,
          timestamp: new Date().toLocaleTimeString()
        }]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 4. Generate the Mock Backend Script
  const getBackendScript = () => `
    <script>
      (function() {
        // Simple Persistence
        const DB_KEY = 'mock_db';
        const getDb = () => { try { return JSON.parse(sessionStorage.getItem(DB_KEY) || '{}'); } catch { return {}; } };
        const saveDb = (d) => sessionStorage.setItem(DB_KEY, JSON.stringify(d));
        
        window.mockBackend = {
          endpoints: ${JSON.stringify(backendEndpoints)},
          handle: async (method, url, body) => {
            const db = getDb();
            const ep = window.mockBackend.endpoints.find(e => url.includes(e.path) && e.method === method);
            
            await new Promise(r => setTimeout(r, 300)); // Latency
            
            if(ep) {
              if(method === 'POST') {
                 const col = ep.path.split('/').pop() || 'data';
                 if(!db[col]) db[col] = [];
                 const item = { id: Date.now(), ...(body ? JSON.parse(body) : {}) };
                 db[col].push(item);
                 saveDb(db);
                 return { status: 201, data: item };
              }
              if(method === 'GET') {
                 const col = ep.path.split('/').pop() || 'data';
                 return { status: 200, data: db[col] || ep.response || [] };
              }
              return { status: 200, data: ep.response };
            }
            return { status: 404, data: { error: 'Not found' } };
          }
        };

        const originalFetch = window.fetch;
        window.fetch = async (url, options = {}) => {
          if(url.startsWith('/') || url.includes('localhost') || url.includes('api')) {
             const start = performance.now();
             const method = (options.method || 'GET').toUpperCase();
             try {
                const res = await window.mockBackend.handle(method, url, options.body);
                window.parent.postMessage({
                  type: 'network', method, url, status: res.status, duration: Math.round(performance.now() - start)
                }, '*');
                return new Response(JSON.stringify(res.data), { status: res.status, headers: {'Content-Type': 'application/json'} });
             } catch(e) { return originalFetch(url, options); }
          }
          return originalFetch(url, options);
        };
      })();
    </script>
  `;

  // 5. Generate Content (The Core Logic)
  const getSrcDoc = React.useCallback(() => {
    if (debouncedFiles.length === 0) return '';

    const htmlFile = debouncedFiles.find(f => f.name.endsWith('.html'))?.content || '<div id="root"></div>';
    const cssContent = debouncedFiles.filter(f => f.name.endsWith('.css')).map(f => f.content).join('\n');
    
    // We filter out server files so they don't crash the browser
    const jsFiles = debouncedFiles.filter(f => 
      f.name.match(/\.(js|jsx|ts|tsx)$/) && 
      !f.name.match(/server|api|route/i)
    );

    const scripts = jsFiles.map(f => {
      let content = f.content || '';
      
      // 1. Remove imports and handle exports
      content = content.replace(/import\s+.*from\s+['"].*['"];?/g, '');
      
      // 2. Convert "export default" to global assignment
      const componentName = f.name.replace(/\.(jsx?|tsx?)$/, '').replace(/[^a-zA-Z0-9]/g, '_');
      content = content.replace(/export\s+default\s+function\s+(\w+)/g, 'window.$1 = function $1');
      content = content.replace(/export\s+default\s+(\w+)/g, 'window.$1 = $1');
      content = content.replace(/export\s+default/g, `window.${componentName} =`);
      
      // 3. Also expose function declarations as window properties
      content = content.replace(/^(function|const|let|var)\s+(\w+)\s*=/gm, 'window.$2 = $2; $1 $2 =');
      
      return `
        <script type="text/babel" data-presets="env,react,typescript">
          try {
            ${content}
          } catch(err) {
            console.error('Error in ${f.name}:', err);
            window.parent.postMessage({ type: 'error', message: '${f.name}: ' + err.message }, '*');
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
        
        <!-- 1. Tailwind -->
        <script src="https://cdn.tailwindcss.com"></script>
        
        <!-- 2. React & ReactDOM (UMD - Stable Globals) -->
        <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        
        <!-- 3. Babel Standalone (With TypeScript Support) -->
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        
        <!-- 4. Styles -->
        <style>
          ${cssContent}
          body { background-color: white; color: black; }
          .preview-error { color: red; padding: 20px; background: #ffebeb; border: 1px solid red; }
        </style>

        <!-- 5. Console Bridge & Mock Backend -->
        <script>
          window.process = { env: { NODE_ENV: 'development' } }; // Fix for some libs
          
          // Console Override
          const sendLog = (level, args) => {
             const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a));
             window.parent.postMessage({ type: 'console', level, args: msg }, '*');
          };
          ['log', 'error', 'warn', 'info'].forEach(m => {
             const old = console[m];
             console[m] = (...args) => { old.apply(console, args); sendLog(m, args); };
          });
          window.onerror = (msg) => sendLog('error', [msg]);
        </script>
        ${getBackendScript()}
      </head>
      <body>
        ${htmlFile}
        
        <!-- 6. User Scripts -->
        ${scripts}

        <!-- 7. Auto-Mount Helper -->
        <script type="text/babel" data-presets="env,react">
          setTimeout(() => {
            const root = document.getElementById('root');
            if (root && root.innerHTML.trim() === '') {
              // Try to find a component to mount (App, Main, Index, or any React component)
              const candidates = ['App', 'Main', 'Index', 'Component'];
              let ComponentToMount = null;
              
              for (const name of candidates) {
                if (typeof window[name] !== 'undefined') {
                  ComponentToMount = window[name];
                  console.log('🚀 Auto-mounting', name, 'component...');
                  break;
                }
              }
              
              // If no named component found, check window for any React components
              if (!ComponentToMount) {
                for (const key in window) {
                  if (typeof window[key] === 'function' && key.match(/^[A-Z]/) && !key.startsWith('React')) {
                    ComponentToMount = window[key];
                    console.log('🚀 Auto-mounting detected component:', key);
                    break;
                  }
                }
              }
              
              if (ComponentToMount) {
                try {
                  const rootInstance = ReactDOM.createRoot(root);
                  rootInstance.render(React.createElement(ComponentToMount));
                } catch(e) {
                  console.error('Failed to mount component:', e);
                  root.innerHTML = '<div class="preview-error">Failed to mount component: ' + e.message + '</div>';
                }
              } else {
                console.warn('⚠️ No React component found to auto-mount');
              }
            }
          }, 800);
        </script>
      </body>
      </html>
    `;
  }, [debouncedFiles, backendEndpoints]);

  // Handle manual refresh
  const handleRefresh = () => {
    setLogs([]);
    setNetworkRequests([]);
    setRuntimeError(null);
    setKey(prev => prev + 1);
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-100 border border-gray-300 rounded-lg overflow-hidden font-sans">
      
      {/* --- Toolbar --- */}
      <div className={`flex items-center justify-between px-3 py-2 border-b bg-white`}>
        <div className="flex items-center gap-2">
          {/* Address Bar */}
          <div className="flex items-center bg-gray-100 rounded-md px-3 py-1.5 w-64 border border-gray-200">
            <Globe className="w-3 h-3 text-gray-500 mr-2" />
            <span className="text-xs text-gray-600 truncate">localhost:3000</span>
          </div>
          
          <div className="h-4 w-px bg-gray-300 mx-2" />
          
          {/* Device Toggles */}
          <div className="flex bg-gray-100 rounded-md p-0.5">
            <button onClick={() => setDeviceMode('desktop')} className={`p-1.5 rounded ${deviceMode === 'desktop' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>
              <Monitor className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setDeviceMode('mobile')} className={`p-1.5 rounded ${deviceMode === 'mobile' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`}>
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
           {isDebouncing && <span className="text-xs text-blue-500 animate-pulse">Compiling...</span>}
           <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setActiveView('preview')} className={`px-3 py-1 text-xs font-medium rounded-md ${activeView === 'preview' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>Preview</button>
            {backendEndpoints.length > 0 && (
              <button onClick={() => setActiveView('backend')} className={`px-3 py-1 text-xs font-medium rounded-md ${activeView === 'backend' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>APIs ({backendEndpoints.length})</button>
            )}
            <button onClick={() => setActiveView('code')} className={`px-3 py-1 text-xs font-medium rounded-md ${activeView === 'code' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>Source</button>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowSourceCode(!showSourceCode)} 
              className={`px-3 py-1 text-xs font-medium rounded-md ${showSourceCode ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              title="View Generated HTML (Debug)"
            >
              {showSourceCode ? 'Hide HTML' : 'View HTML'}
            </button>
            <button onClick={handleRefresh} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* --- Main Content --- */}
      <div className="flex-grow relative bg-gray-200 overflow-hidden flex flex-col items-center">
        
        {/* Debug Source Code Viewer */}
        {showSourceCode && (
          <div className="absolute inset-0 z-40 bg-black/90 backdrop-blur-sm p-4 overflow-auto">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-lg">Generated HTML Source (Debug)</h3>
                <button 
                  onClick={() => setShowSourceCode(false)}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded"
                >
                  Close
                </button>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 overflow-auto">
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{getSrcDoc()}</pre>
              </div>
              <div className="mt-4 p-3 bg-blue-900/50 rounded text-blue-200 text-sm">
                <strong>💡 Debug Tips:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Check if your component is properly exported</li>
                  <li>Verify React imports are being stripped correctly</li>
                  <li>Look for syntax errors in the transformed code</li>
                  <li>Check browser console (F12) for runtime errors</li>
                  <li>Ensure components are assigned to window object</li>
                </ul>
              </div>
            </div>
          </div>
        )}
        
        {activeView === 'preview' && (
          <div className={`transition-all duration-300 relative bg-white shadow-xl my-4 ${deviceMode === 'mobile' ? 'w-[375px] h-[667px] rounded-3xl border-8 border-gray-800' : 'w-full h-full'}`}>
            
            {/* Error Overlay */}
            {(runtimeError) && (
              <div className="absolute top-4 left-4 right-4 z-50 bg-red-50 text-red-600 p-4 rounded-md border border-red-200 shadow-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm mb-2">Runtime Error:</p>
                    <pre className="text-xs overflow-auto max-h-32 bg-red-100 p-2 rounded font-mono whitespace-pre-wrap">{runtimeError}</pre>
                    <div className="flex gap-2 mt-3">
                      <button 
                        onClick={() => navigator.clipboard.writeText(runtimeError)}
                        className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      >
                        Copy Error
                      </button>
                      <button 
                        onClick={() => setRuntimeError(null)} 
                        className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <iframe
              key={key}
              srcDoc={getSrcDoc()}
              className="w-full h-full border-none bg-white"
              sandbox="allow-scripts allow-modals allow-forms allow-same-origin allow-popups"
              title="Web Preview"
              onError={(e) => {
                console.error('iframe error:', e);
                setRuntimeError('Failed to load preview. Check console for details.');
              }}
            />
          </div>
        )}

        {/* Backend View */}
        {activeView === 'backend' && (
          <div className="w-full h-full bg-white p-6 overflow-auto">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Server className="w-5 h-5 text-blue-500" /> Detected Endpoints</h2>
             <div className="grid gap-3 max-w-3xl">
              {backendEndpoints.map((ep, i) => (
                <div key={i} className="border p-3 rounded flex items-center gap-3 bg-gray-50">
                  <span className={`px-2 py-1 text-xs font-bold text-white rounded ${ep.method === 'GET' ? 'bg-green-500' : ep.method === 'POST' ? 'bg-blue-500' : 'bg-red-500'}`}>{ep.method}</span>
                  <code className="bg-white border px-2 py-1 rounded text-sm font-mono">{ep.path}</code>
                </div>
              ))}
              {backendEndpoints.length === 0 && <p className="text-gray-400">No endpoints detected.</p>}
            </div>
          </div>
        )}

        {/* Code View */}
        {activeView === 'code' && (
           <div className="w-full h-full bg-[#1e1e1e] p-0 overflow-auto">
            {debouncedFiles.map((f, i) => (
              <div key={i} className="border-b border-gray-700">
                <div className="bg-[#2d2d2d] px-4 py-2 text-xs text-gray-300 flex items-center gap-2"><FileText className="w-3 h-3" /> {f.name}</div>
                <pre className="p-4 text-xs font-mono text-blue-300 overflow-x-auto whitespace-pre">{f.content}</pre>
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
                {logs.length === 0 && <div className="text-gray-400 italic p-2">Console empty</div>}
                {logs.map((log, i) => (
                  <div key={i} className={`flex gap-2 py-1 border-b border-gray-50 ${log.type === 'error' ? 'text-red-600 bg-red-50' : 'text-gray-700'}`}>
                    <span className="text-gray-400 w-16 text-right shrink-0">{log.timestamp}</span>
                    <span className="whitespace-pre-wrap break-all">{log.message}</span>
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
                      <td className="p-2 break-all">{req.url}</td>
                      <td className="p-2 text-gray-500">{req.duration}ms</td>
                    </tr>
                  ))}
                  {networkRequests.length === 0 && <tr><td colSpan={4} className="p-4 text-gray-400 italic text-center">No network requests</td></tr>}
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