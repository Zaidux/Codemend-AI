
import * as React from 'react';
import { ThemeConfig } from '../types';

interface DiffViewerProps {
  original: string;
  modified: string;
  theme: ThemeConfig;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ original, modified, theme }) => {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  // Simple line-by-line diff for visualization
  // Note: For production, a library like 'diff' is better, but this suffices for the requested UI.
  
  const renderLines = () => {
    const lines: React.ReactNode[] = [];
    const maxLines = Math.max(originalLines.length, modifiedLines.length);

    for (let i = 0; i < maxLines; i++) {
      const oldLine = originalLines[i] || '';
      const newLine = modifiedLines[i] || '';
      
      if (oldLine === newLine) {
        // Unchanged
        lines.push(
          <div key={i} className="flex text-xs font-mono opacity-60">
             <div className="w-8 select-none text-right pr-2 border-r border-white/10">{i + 1}</div>
             <div className="w-8 select-none text-right pr-2 border-r border-white/10">{i + 1}</div>
             <div className="pl-2 whitespace-pre text-gray-400">{oldLine}</div>
          </div>
        );
      } else {
        // Changed (Simple replacement visualization)
        if (oldLine) {
            lines.push(
                <div key={`del-${i}`} className="flex text-xs font-mono bg-red-500/10">
                    <div className="w-8 select-none text-right pr-2 border-r border-white/10 text-red-500">-</div>
                    <div className="w-8 select-none text-right pr-2 border-r border-white/10"></div>
                    <div className="pl-2 whitespace-pre text-red-300">{oldLine}</div>
                </div>
            );
        }
        if (newLine) {
            lines.push(
                <div key={`add-${i}`} className="flex text-xs font-mono bg-green-500/10">
                    <div className="w-8 select-none text-right pr-2 border-r border-white/10"></div>
                    <div className="w-8 select-none text-right pr-2 border-r border-white/10 text-green-500">+</div>
                    <div className="pl-2 whitespace-pre text-green-300">{newLine}</div>
                </div>
            );
        }
      }
    }
    return lines;
  };

  return (
    <div className={`w-full h-full overflow-auto ${theme.bgPanel} border ${theme.border} rounded-lg`}>
       <div className="p-4">
          {renderLines()}
       </div>
    </div>
  );
};

export default DiffViewer;
