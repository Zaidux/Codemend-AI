import React from 'react';
import { MessageSquare, FolderOpen, Book, Plus, Github, Trash2, FileCode, FilePlus, X } from 'lucide-react';
import { Project, Session, KnowledgeEntry, ThemeType } from '../types';
import KnowledgeBase from './KnowledgeBase';

interface AppSidebarProps {
  activeTab: 'chats' | 'files' | 'knowledge';
  setActiveTab: (tab: 'chats' | 'files' | 'knowledge') => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  theme: any;
  projects: Project[];
  activeProject: Project;
  sessions: Session[];
  currentSessionId: string;
  knowledgeBase: KnowledgeEntry[];
  showGithubInput: boolean;
  repoInput: string;
  
  // Actions
  setShowGithubInput: (show: boolean) => void;
  setRepoInput: (val: string) => void;
  handleImportGithub: () => void;
  handleCreateProject: () => void;
  setCurrentProjectId: (id: string) => void;
  handleCreateSession: () => void;
  setCurrentSessionId: (id: string) => void;
  setSessions: (sessions: Session[]) => void; // For deleting
  handleCreateFile: () => void;
  handleDeleteFile: (e: React.MouseEvent, id: string) => void;
  updateProject: (updates: Partial<Project>) => void;
  setKnowledgeBase: (kb: KnowledgeEntry[]) => void;
  viewMode: string;
  setIsEditorOpen: (open: boolean) => void;
}

const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { theme, activeTab, setActiveTab, isSidebarOpen } = props;
  const projectSessions = props.sessions.filter(s => s.projectId === props.activeProject.id);

  return (
    <div 
      className={`
         flex flex-col flex-shrink-0 ${theme.border} ${theme.bgPanel} 
         transition-all duration-300 ease-in-out border-r
         fixed inset-y-0 left-0 z-40 lg:relative lg:z-0 lg:h-auto
         ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'}
      `}
    >
      {/* Navigation Tabs */}
      <div className={`flex border-b ${theme.border} ${theme.bgPanelHeader}`}>
         <button onClick={() => setActiveTab('chats')} className={`flex-1 py-3 border-b-2 flex justify-center ${activeTab === 'chats' ? `${theme.accent} border-${theme.accent.replace('text-', '')}` : 'border-transparent text-gray-500 hover:text-white'}`}><MessageSquare className="w-4 h-4" /></button>
         <button onClick={() => setActiveTab('files')} className={`flex-1 py-3 border-b-2 flex justify-center ${activeTab === 'files' ? `${theme.accent} border-${theme.accent.replace('text-', '')}` : 'border-transparent text-gray-500 hover:text-white'}`}><FolderOpen className="w-4 h-4" /></button>
         <button onClick={() => setActiveTab('knowledge')} className={`flex-1 py-3 border-b-2 flex justify-center ${activeTab === 'knowledge' ? `${theme.accent} border-${theme.accent.replace('text-', '')}` : 'border-transparent text-gray-500 hover:text-white'}`}><Book className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
         {/* CHATS TAB */}
         {activeTab === 'chats' && (
             <div className="p-2 space-y-2">
                 <div className={`px-2 py-2 text-xs font-bold uppercase ${theme.textMuted} flex justify-between`}>
                     <span>Projects</span>
                     <button onClick={() => props.setShowGithubInput(!props.showGithubInput)} title="Clone from GitHub"><Github className="w-3 h-3 hover:text-white mr-2 inline" /></button>
                     <button onClick={props.handleCreateProject}><Plus className="w-3 h-3 hover:text-white" /></button>
                 </div>

                 {props.showGithubInput && (
                     <div className="px-2 mb-2 animate-in slide-in-from-top-2">
                         <input 
                            autoFocus
                            value={props.repoInput}
                            onChange={(e) => props.setRepoInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && props.handleImportGithub()}
                            placeholder="owner/repo or https://github.com/owner/repo"
                            className={`w-full text-xs ${theme.bgApp} border ${theme.border} rounded px-2 py-1 mb-1`}
                         />
                         <button onClick={props.handleImportGithub} className={`w-full text-xs ${theme.button} text-white rounded py-1`}>Clone</button>
                     </div>
                 )}

                 <div className="space-y-1 mb-4">
                     {props.projects.map(p => (
                         <div key={p.id} onClick={() => props.setCurrentProjectId(p.id)} className={`flex justify-between px-3 py-2 rounded text-xs cursor-pointer ${props.activeProject.id === p.id ? `${theme.accentBg} ${theme.accent}` : `${theme.textMuted} hover:bg-white/5`}`}>
                             <span className="truncate font-medium">{p.name}</span>
                         </div>
                     ))}
                 </div>
                 <div className={`px-2 py-2 text-xs font-bold uppercase ${theme.textMuted} flex justify-between`}>
                     <span>Sessions</span>
                     <button onClick={props.handleCreateSession}><Plus className="w-3 h-3 hover:text-white" /></button>
                 </div>
                 {projectSessions.map(session => (
                    <div key={session.id} onClick={() => { props.setCurrentSessionId(session.id); if (window.innerWidth < 1024) props.setIsSidebarOpen(false); }} className={`flex justify-between p-2 rounded cursor-pointer text-sm ${props.currentSessionId === session.id ? `${theme.bgApp} border border-${theme.border.replace('border-', '')} ${theme.textMain}` : `hover:bg-white/5 ${theme.textMuted}`}`}>
                       <span className="truncate">{session.title}</span>
                       <button onClick={(e) => { e.stopPropagation(); props.setSessions(props.sessions.filter(s => s.id !== session.id)); }} className="opacity-0 hover:opacity-100"><Trash2 className="w-3 h-3 text-red-500"/></button>
                    </div>
                 ))}
             </div>
         )}

         {/* FILES TAB */}
         {activeTab === 'files' && (
             <div className="p-3">
                 <div className={`flex justify-between items-center text-xs uppercase font-semibold ${theme.textMuted} mb-3`}>
                    <span>Workspace</span>
                    <button onClick={props.handleCreateFile}><FilePlus className="w-3.5 h-3.5 hover:text-white" /></button>
                 </div>
                 <div className="space-y-1">
                    {props.activeProject.files.map(file => (
                        <div key={file.id} onClick={() => { props.updateProject({ activeFileId: file.id }); if(props.viewMode === 'chat') props.setIsEditorOpen(true); }} className={`flex justify-between px-2 py-2 rounded text-xs cursor-pointer ${props.activeProject.activeFileId === file.id ? `${theme.accent} bg-white/5` : `${theme.textMuted} hover:text-white`}`}>
                            <div className="flex items-center gap-2 truncate"><FileCode className="w-3.5 h-3.5" /> <span>{file.name}</span></div>
                            <button onClick={(e) => props.handleDeleteFile(e, file.id)} className="opacity-0 hover:opacity-100"><X className="w-3 h-3 text-red-500" /></button>
                        </div>
                    ))}
                 </div>
             </div>
         )}

         {/* KNOWLEDGE TAB */}
         {activeTab === 'knowledge' && (
             <KnowledgeBase 
                entries={props.knowledgeBase} 
                onAdd={(entry) => props.setKnowledgeBase([...props.knowledgeBase, entry])} 
                onRemove={(id) => props.setKnowledgeBase(props.knowledgeBase.filter(k => k.id !== id))}
                theme={theme}
             />
         )}
      </div>
    </div>
  );
};

export default AppSidebar;