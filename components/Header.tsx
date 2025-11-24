import * as React from 'react';
import { Terminal, Sparkles, Settings, LayoutTemplate, MessageSquare } from 'lucide-react';
import { ThemeConfig, ViewMode } from '../types';

interface HeaderProps {
  theme: ThemeConfig;
  viewMode: ViewMode;
  onToggleViewMode: (mode: ViewMode) => void;
  onOpenSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, viewMode, onToggleViewMode, onOpenSettings }) => {
  return (
    <header className={`border-b ${theme.border} ${theme.bgPanelHeader} backdrop-blur-sm sticky top-0 z-10 transition-colors duration-300`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`${theme.accentBg} p-2 rounded-lg transition-colors duration-300`}>
            <Terminal className={`w-6 h-6 ${theme.accent}`} />
          </div>
          <h1 className={`text-xl font-bold bg-gradient-to-r ${theme.gradientTitle} bg-clip-text text-transparent`}>
            CodeMend AI
          </h1>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className={`hidden md:flex items-center space-x-1 ${theme.bgPanel} p-1 rounded-lg border ${theme.border}`}>
             <button
                onClick={() => onToggleViewMode('classic')}
                className={`p-1.5 rounded-md flex items-center gap-2 text-xs font-medium transition-all ${
                  viewMode === 'classic' 
                  ? `${theme.button} text-white shadow-sm` 
                  : `${theme.textMuted} hover:text-white hover:bg-white/5`
                }`}
                title="Classic Mode"
             >
                <LayoutTemplate className="w-4 h-4" />
                <span>Classic</span>
             </button>
             <button
                onClick={() => onToggleViewMode('chat')}
                className={`p-1.5 rounded-md flex items-center gap-2 text-xs font-medium transition-all ${
                  viewMode === 'chat' 
                  ? `${theme.button} text-white shadow-sm` 
                  : `${theme.textMuted} hover:text-white hover:bg-white/5`
                }`}
                title="Interactive Chat Mode"
             >
                <MessageSquare className="w-4 h-4" />
                <span>Chat</span>
             </button>
          </div>

          <div className={`hidden sm:flex items-center space-x-2 ${theme.textMuted} text-sm`}>
            <Sparkles className="w-4 h-4 text-yellow-500" />
            <span className="hidden lg:inline">Gemini 2.5 Flash</span>
          </div>
          
          <button 
            onClick={onOpenSettings}
            className={`p-2 rounded-full hover:bg-white/5 ${theme.textMuted} hover:text-white transition-colors`}
            title="Settings & Themes"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;