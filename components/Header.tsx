import * as React from 'react';
import { Terminal, Sparkles, Settings, LayoutTemplate, MessageSquare, Github, Brain } from 'lucide-react';
import { ThemeConfig, ViewMode } from '../types';

interface HeaderProps {
  theme: ThemeConfig;
  viewMode: ViewMode;
  onOpenSettings: () => void;
  onOpenGitHubAuth?: () => void;
  isGitHubConnected?: boolean;
  onOpenPlannerRoom?: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, viewMode, onOpenSettings, onOpenGitHubAuth, isGitHubConnected, onOpenPlannerRoom }) => {
  return (
    <header className={`border-b ${theme.border} ${theme.bgPanelHeader} backdrop-blur-sm sticky top-0 z-10 transition-colors duration-300`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`${theme.accentBg} p-2 rounded-lg transition-colors duration-300`}>
            <Terminal className={`w-6 h-6 ${theme.accent}`} />
          </div>
          <h1 className={`text-xl font-bold bg-gradient-to-r ${theme.gradientTitle} bg-clip-text text-transparent hidden sm:block`}>
            CodeMend AI
          </h1>
          <h1 className={`text-lg font-bold bg-gradient-to-r ${theme.gradientTitle} bg-clip-text text-transparent sm:hidden`}>
            CodeMend
          </h1>
          
          {/* Layout Badge */}
          <div className={`hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${theme.border} ${theme.bgPanel}`}>
             {viewMode === 'classic' ? <LayoutTemplate className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
             <span className="uppercase tracking-wider opacity-80">{viewMode}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className={`hidden sm:flex items-center space-x-2 ${theme.textMuted} text-sm`}>
            <Sparkles className="w-4 h-4 text-yellow-500" />
            <span className="hidden lg:inline">Gemini 2.5 Flash</span>
          </div>
          
          {onOpenGitHubAuth && (
            <button 
              onClick={onOpenGitHubAuth}
              className={`p-2 rounded-full hover:bg-white/5 ${isGitHubConnected ? 'text-green-500' : theme.textMuted} hover:text-white transition-colors relative`}
              title={isGitHubConnected ? "GitHub Connected" : "Connect GitHub"}
            >
              <Github className="w-5 h-5" />
              {isGitHubConnected && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" />
              )}
            </button>
          )}

          {onOpenPlannerRoom && (
            <button 
              onClick={onOpenPlannerRoom}
              className={`p-2 rounded-full hover:bg-white/5 ${theme.textMuted} hover:text-purple-400 transition-colors`}
              title="Planner Room - Expert Planning & Task Delegation"
            >
              <Brain className="w-5 h-5" />
            </button>
          )}
          
          <button 
            onClick={onOpenSettings}
            className={`p-2 rounded-full hover:bg-white/5 ${theme.textMuted} hover:text-white transition-colors`}
            title="Settings, Themes & Layout"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;