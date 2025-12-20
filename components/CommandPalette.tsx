import React, { useState, useEffect, useRef } from 'react';
import { Search, File, FolderPlus, MessageSquare, Settings, Code2, Eye, GitBranch, Terminal, Wrench, Zap, X } from 'lucide-react';
import { Project, Session, ProjectFile } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  theme: any;
  projects: Project[];
  sessions: Session[];
  activeProject: Project;
  onSelectFile: (fileId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectProject: (projectId: string) => void;
  onCreateFile: () => void;
  onCreateSession: () => void;
  onCreateProject: () => void;
  onOpenSettings: () => void;
  onTogglePreview: () => void;
  onOpenTerminal: () => void;
  onOpenGitTracker: () => void;
  onOpenTools: () => void;
}

type CommandItem = {
  id: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  category: 'file' | 'session' | 'project' | 'action';
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  theme,
  projects,
  sessions,
  activeProject,
  onSelectFile,
  onSelectSession,
  onSelectProject,
  onCreateFile,
  onCreateSession,
  onCreateProject,
  onOpenSettings,
  onTogglePreview,
  onOpenTerminal,
  onOpenGitTracker,
  onOpenTools
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build command list
  const buildCommands = (): CommandItem[] => {
    const commands: CommandItem[] = [];

    // Quick actions
    commands.push(
      { id: 'new-file', label: 'Create New File', icon: File, action: () => { onCreateFile(); onClose(); }, category: 'action' },
      { id: 'new-session', label: 'New Chat Session', icon: MessageSquare, action: () => { onCreateSession(); onClose(); }, category: 'action' },
      { id: 'new-project', label: 'Create New Project', icon: FolderPlus, action: () => { onCreateProject(); onClose(); }, category: 'action' },
      { id: 'settings', label: 'Open Settings', icon: Settings, action: () => { onOpenSettings(); onClose(); }, category: 'action' },
      { id: 'preview', label: 'Toggle Preview', icon: Eye, action: () => { onTogglePreview(); onClose(); }, category: 'action' },
      { id: 'terminal', label: 'Open Terminal', icon: Terminal, action: () => { onOpenTerminal(); onClose(); }, category: 'action' },
      { id: 'git', label: 'Git Changes', icon: GitBranch, action: () => { onOpenGitTracker(); onClose(); }, category: 'action' },
      { id: 'tools', label: 'Tools Management', icon: Wrench, action: () => { onOpenTools(); onClose(); }, category: 'action' }
    );

    // Files from active project
    activeProject.files.forEach(file => {
      commands.push({
        id: `file-${file.id}`,
        label: file.name,
        description: activeProject.name,
        icon: Code2,
        action: () => { onSelectFile(file.id); onClose(); },
        category: 'file'
      });
    });

    // Recent sessions
    const recentSessions = sessions
      .filter(s => s.projectId === activeProject.id)
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, 10);
    
    recentSessions.forEach(session => {
      commands.push({
        id: `session-${session.id}`,
        label: session.title,
        description: `Chat session`,
        icon: MessageSquare,
        action: () => { onSelectSession(session.id); onClose(); },
        category: 'session'
      });
    });

    // Projects
    projects.forEach(project => {
      commands.push({
        id: `project-${project.id}`,
        label: project.name,
        description: `${project.files.length} files`,
        icon: FolderPlus,
        action: () => { onSelectProject(project.id); onClose(); },
        category: 'project'
      });
    });

    return commands;
  };

  const allCommands = buildCommands();
  
  // Filter commands based on query
  const filteredCommands = query.trim()
    ? allCommands.filter(cmd => 
        cmd.label.toLowerCase().includes(query.toLowerCase()) ||
        cmd.description?.toLowerCase().includes(query.toLowerCase())
      )
    : allCommands;

  // Group by category
  const groupedCommands = {
    action: filteredCommands.filter(c => c.category === 'action'),
    file: filteredCommands.filter(c => c.category === 'file'),
    session: filteredCommands.filter(c => c.category === 'session'),
    project: filteredCommands.filter(c => c.category === 'project')
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setSelectedIndex(0);
      return;
    }
    
    inputRef.current?.focus();
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter' && filteredCommands[selectedIndex]) {
        e.preventDefault();
        filteredCommands[selectedIndex].action();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div 
        className={`${theme.bgPanel} border ${theme.border} rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className={`flex items-center gap-3 p-4 border-b ${theme.border}`}>
          <Search className={`w-5 h-5 ${theme.textMuted}`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Search files, sessions, or run commands..."
            className={`flex-1 bg-transparent outline-none text-lg ${theme.textMain}`}
          />
          <button onClick={onClose} className={`${theme.textMuted} hover:text-white`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center">
              <p className={`${theme.textMuted}`}>No results found</p>
            </div>
          ) : (
            <div className="p-2">
              {groupedCommands.action.length > 0 && (
                <CommandGroup title="Actions" commands={groupedCommands.action} selectedIndex={selectedIndex} allCommands={filteredCommands} theme={theme} />
              )}
              {groupedCommands.file.length > 0 && (
                <CommandGroup title="Files" commands={groupedCommands.file} selectedIndex={selectedIndex} allCommands={filteredCommands} theme={theme} />
              )}
              {groupedCommands.session.length > 0 && (
                <CommandGroup title="Sessions" commands={groupedCommands.session} selectedIndex={selectedIndex} allCommands={filteredCommands} theme={theme} />
              )}
              {groupedCommands.project.length > 0 && (
                <CommandGroup title="Projects" commands={groupedCommands.project} selectedIndex={selectedIndex} allCommands={filteredCommands} theme={theme} />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-3 border-t ${theme.border} ${theme.bgApp} flex items-center justify-between text-xs ${theme.textMuted}`}>
          <div className="flex gap-4">
            <span><kbd className="px-2 py-1 bg-white/5 rounded">↑↓</kbd> Navigate</span>
            <span><kbd className="px-2 py-1 bg-white/5 rounded">Enter</kbd> Select</span>
            <span><kbd className="px-2 py-1 bg-white/5 rounded">Esc</kbd> Close</span>
          </div>
          <span>{filteredCommands.length} results</span>
        </div>
      </div>
    </div>
  );
};

const CommandGroup: React.FC<{
  title: string;
  commands: CommandItem[];
  selectedIndex: number;
  allCommands: CommandItem[];
  theme: any;
}> = ({ title, commands, selectedIndex, allCommands, theme }) => {
  if (commands.length === 0) return null;

  return (
    <div className="mb-4">
      <div className={`px-3 py-1 text-xs font-semibold uppercase ${theme.textMuted} opacity-60`}>{title}</div>
      {commands.map((cmd) => {
        const globalIndex = allCommands.indexOf(cmd);
        const isSelected = globalIndex === selectedIndex;
        const Icon = cmd.icon;

        return (
          <button
            key={cmd.id}
            onClick={cmd.action}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
              isSelected ? `${theme.accentBg} ${theme.accent}` : `hover:bg-white/5 ${theme.textMain}`
            }`}
          >
            <Icon className="w-4 h-4" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{cmd.label}</div>
              {cmd.description && (
                <div className={`text-xs ${theme.textMuted} truncate`}>{cmd.description}</div>
              )}
            </div>
            {isSelected && (
              <Zap className="w-4 h-4 text-yellow-400" />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default CommandPalette;
