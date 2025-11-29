import React from 'react';
import { 
  MessageSquare, 
  FolderOpen, 
  Book, 
  Plus, 
  Github, 
  Trash2, 
  FileCode, 
  FilePlus, 
  X, 
  Folder,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  MoreVertical
} from 'lucide-react';
import { Project, Session, KnowledgeEntry, ThemeType, ProjectFile } from '../types';
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
  setSessions: (sessions: Session[]) => void;
  handleCreateFile: () => void;
  handleDeleteFile: (e: React.MouseEvent, id: string) => void;
  updateProject: (updates: Partial<Project>) => void;
  setKnowledgeBase: (kb: KnowledgeEntry[]) => void;
  viewMode: string;
  setIsEditorOpen: (open: boolean) => void;
}

interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  isExpanded?: boolean;
  file?: ProjectFile;
}

const AppSidebar: React.FC<AppSidebarProps> = (props) => {
  const { theme, activeTab, setActiveTab, isSidebarOpen } = props;
  const projectSessions = props.sessions.filter(s => s.projectId === props.activeProject.id);
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set());
  const [showFolderInput, setShowFolderInput] = React.useState<string | null>(null);
  const [newFolderName, setNewFolderName] = React.useState('');

  // Convert flat files to tree structure
  const buildFileTree = (files: ProjectFile[]): FileNode[] => {
    const root: FileNode[] = [];
    const pathMap = new Map<string, FileNode>();

    files.forEach(file => {
      const pathParts = file.name.split('/');
      let currentPath = '';
      let parentNodes = root;

      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        const isFile = i === pathParts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!pathMap.has(currentPath)) {
          const node: FileNode = {
            id: isFile ? file.id : `folder-${currentPath}`,
            name: part,
            type: isFile ? 'file' : 'folder',
            children: [],
            isExpanded: expandedFolders.has(currentPath),
            file: isFile ? file : undefined
          };

          pathMap.set(currentPath, node);
          parentNodes.push(node);
        }

        if (!isFile) {
          parentNodes = pathMap.get(currentPath)!.children!;
        }
      }
    });

    return root;
  };

  const fileTree = buildFileTree(props.activeProject.files);

  const toggleFolder = (folderPath: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  const handleCreateFolder = (parentPath: string = '') => {
    if (!newFolderName.trim()) {
      setShowFolderInput(null);
      return;
    }

    const folderName = parentPath ? `${parentPath}/${newFolderName}` : newFolderName;
    const folderId = `folder-${folderName}`;
    
    // Add folder to expanded set
    const newExpanded = new Set(expandedFolders);
    newExpanded.add(folderName);
    setExpandedFolders(newExpanded);

    setShowFolderInput(null);
    setNewFolderName('');
  };

  const handleFileClick = (file: ProjectFile) => {
    props.updateProject({ activeFileId: file.id });
    if (props.viewMode === 'chat') {
      props.setIsEditorOpen(true);
    }
  };

  const handleHideFile = (fileId: string) => {
    // Implement file hiding logic - could be a separate state or project property
    console.log('Hide file:', fileId);
  };

  const renderFileTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      const paddingLeft = 12 + (depth * 16);
      
      if (node.type === 'folder') {
        const folderPath = node.name; // Simplified - in real app, use full path
        const isExpanded = expandedFolders.has(folderPath);
        
        return (
          <div key={node.id}>
            <div 
              className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-white/5 ${theme.textMuted} hover:text-white`}
              style={{ paddingLeft: `${paddingLeft}px` }}
            >
              <div 
                className="flex items-center gap-1.5 flex-1"
                onClick={() => toggleFolder(folderPath)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <Folder className="w-3.5 h-3.5 text-blue-400" />
                <span className="truncate">{node.name}</span>
              </div>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFolderInput(folderPath);
                  }}
                  className="p-0.5 hover:bg-white/10 rounded"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            {showFolderInput === folderPath && (
              <div className="px-2 py-1" style={{ paddingLeft: `${paddingLeft + 16}px` }}>
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder(folderPath);
                    if (e.key === 'Escape') setShowFolderInput(null);
                  }}
                  onBlur={() => setShowFolderInput(null)}
                  placeholder="Folder name"
                  className={`w-full text-xs ${theme.bgApp} border ${theme.border} rounded px-2 py-1`}
                />
              </div>
            )}

            {isExpanded && node.children && (
              <div className="ml-2">
                {renderFileTree(node.children, depth + 1)}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div
            key={node.id}
            className={`group flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer ${props.activeProject.activeFileId === node.id ? `${theme.accent} bg-white/5` : `${theme.textMuted} hover:text-white`}`}
            style={{ paddingLeft: `${paddingLeft}px` }}
          >
            <div 
              className="flex items-center gap-1.5 flex-1"
              onClick={() => node.file && handleFileClick(node.file)}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span className="truncate">{node.name}</span>
            </div>
            
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleHideFile(node.id);
                }}
                className="p-0.5 hover:bg-white/10 rounded text-yellow-400"
                title="Hide file"
              >
                <X className="w-3 h-3" />
              </button>
              <button 
                onClick={(e) => props.handleDeleteFile(e, node.id)}
                className="p-0.5 hover:bg-white/10 rounded text-red-400"
                title="Delete file"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      }
    });
  };

  return (
    <div 
      className={`
         flex flex-col flex-shrink-0 ${theme.border} ${theme.bgPanel} 
         transition-all duration-300 ease-in-out border-r
         fixed inset-y-0 left-0 z-40 lg:relative lg:z-0 lg:h-auto
         ${isSidebarOpen ? 'translate-x-0 w-80' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'}
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
                     <div className="flex gap-1">
                         <button onClick={() => props.setShowGithubInput(!props.showGithubInput)} title="Clone from GitHub"><Github className="w-3 h-3 hover:text-white" /></button>
                         <button onClick={props.handleCreateProject}><Plus className="w-3 h-3 hover:text-white" /></button>
                     </div>
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
                    <div className="flex gap-2">
                       <button 
                         onClick={() => setShowFolderInput('root')}
                         title="Create Folder"
                         className="hover:text-white"
                       >
                         <FolderPlus className="w-3.5 h-3.5" />
                       </button>
                       <button 
                         onClick={props.handleCreateFile}
                         title="Create File"
                         className="hover:text-white"
                       >
                         <FilePlus className="w-3.5 h-3.5" />
                       </button>
                    </div>
                 </div>

                 {showFolderInput === 'root' && (
                   <div className="mb-2">
                     <input
                       autoFocus
                       value={newFolderName}
                       onChange={(e) => setNewFolderName(e.target.value)}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter') handleCreateFolder();
                         if (e.key === 'Escape') setShowFolderInput(null);
                       }}
                       onBlur={() => setShowFolderInput(null)}
                       placeholder="Folder name"
                       className={`w-full text-xs ${theme.bgApp} border ${theme.border} rounded px-2 py-1`}
                     />
                   </div>
                 )}

                 <div className="space-y-0.5">
                   {fileTree.length > 0 ? (
                     renderFileTree(fileTree)
                   ) : (
                     <div className={`text-center py-8 ${theme.textMuted} text-xs`}>
                       <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                       <p>No files yet</p>
                       <p className="mt-1">Create a file or folder to get started</p>
                     </div>
                   )}
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