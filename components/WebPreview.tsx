
import * as React from 'react';
import { RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import { ProjectFile, ThemeConfig, CodeLanguage } from '../types';

interface WebPreviewProps {
  files: ProjectFile[];
  theme: ThemeConfig;
}

const WebPreview: React.FC<WebPreviewProps> = ({ files, theme }) => {
  const [key, setKey] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const getSrcDoc = () => {
    try {
      const htmlFile = files.find(f => f.name.endsWith('.html')) || files.find(f => f.language === CodeLanguage.HTML);
      const cssFiles = files.filter(f => f.name.endsWith('.css') || f.language === CodeLanguage.CSS);
      const jsFiles = files.filter(f => f.name.endsWith('.js') || f.language === CodeLanguage.JAVASCRIPT);

      // Simple handling: if no HTML, wrap the first file in pre tags or error
      if (!htmlFile) {
        return `
          <html>
            <body style="background: #111; color: #888; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh;">
              <div style="text-align: center;">
                <h3>No HTML file found</h3>
                <p>Create an index.html file to start the preview.</p>
              </div>
            </body>
          </html>
        `;
      }

      let content = htmlFile.content;

      // Inject CSS
      const styles = cssFiles.map(f => `<style>/* ${f.name} */\n${f.content}</style>`).join('\n');
      content = content.replace('</head>', `${styles}\n</head>`);

      // Inject JS
      // We wrap JS in a try-catch block to report errors to the visual console
      const scripts = jsFiles.map(f => `
        <script>
          try {
            /* ${f.name} */
            ${f.content}
          } catch (e) {
            document.body.innerHTML += '<div style="background:red; color:white; padding:10px; position:fixed; bottom:0; width:100%; border-top: 2px solid white;">JS Error: ' + e.message + '</div>';
            console.error(e);
          }
        </script>
      `).join('\n');
      
      content = content.replace('</body>', `${scripts}\n</body>`);

      return content;
    } catch (e: any) {
      setError(e.message);
      return '';
    }
  };

  const handleRefresh = () => {
    setKey(prev => prev + 1);
  };

  return (
    <div className="flex flex-col h-full w-full bg-white">
      <div className={`flex items-center justify-between px-3 py-2 border-b ${theme.border} ${theme.bgPanelHeader}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold uppercase tracking-wider ${theme.textMain}`}>Live Preview</span>
          {error && <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> {error}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleRefresh} className={`p-1.5 rounded hover:bg-white/10 ${theme.textMuted} hover:text-white`}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-grow relative bg-white">
        <iframe
          key={key}
          title="Web Preview"
          srcDoc={getSrcDoc()}
          sandbox="allow-scripts allow-modals"
          className="absolute inset-0 w-full h-full border-none"
        />
      </div>
    </div>
  );
};

export default WebPreview;
