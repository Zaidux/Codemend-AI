import React from 'react';
import { CheckCircle2, Loader2, Terminal, ChevronRight } from 'lucide-react';

interface ProcessLogProps {
  steps: string[];
  isComplete: boolean;
  theme: any;
}

const ProcessLog: React.FC<ProcessLogProps> = ({ steps, isComplete, theme }) => {
  if (steps.length === 0) return null;

  return (
    <div className={`my-4 mx-4 lg:mx-0 rounded-lg overflow-hidden border ${theme.border} bg-black/20 text-xs font-mono`}>
      <div className={`px-3 py-2 border-b ${theme.border} bg-white/5 flex items-center gap-2`}>
        <Terminal className="w-3.5 h-3.5 opacity-70" />
        <span className="font-bold opacity-70 uppercase tracking-wider">System Process</span>
      </div>
      <div className="p-3 space-y-2">
        {steps.map((step, index) => (
          <div key={index} className="flex items-start gap-3 animate-in fade-in slide-in-from-left-2 duration-300">
            {index === steps.length - 1 && !isComplete ? (
              <Loader2 className={`w-3.5 h-3.5 ${theme.accent} animate-spin flex-shrink-0 mt-0.5`} />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
            )}
            <span className={`${index === steps.length - 1 && !isComplete ? theme.textMain : 'opacity-60'}`}>
              {step}
            </span>
          </div>
        ))}
        
        {isComplete && (
          <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/10 text-green-400 font-bold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Process Complete</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessLog;