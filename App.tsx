
import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Sparkles, Play, Wrench, X, Settings, MessageSquare, Plus, Trash2, Send, Sidebar as SidebarIcon, LayoutTemplate, FileCode, FolderOpen, FilePlus, Code2, ArrowLeft, Eye, Image as ImageIcon, Mic, StopCircle, BookOpen, Book, Globe, Brain, Check, ListTodo, GitCompare } from 'lucide-react';
import Header from './components/Header';
import MarkdownRenderer from './components/MarkdownRenderer';
import CodeEditor from './components/CodeEditor';
import WebPreview from './components/WebPreview';
import SettingsModal from './components/SettingsModal';
import KnowledgeBase from './components/KnowledgeBase';
import TodoList from './components/TodoList';
import DiffViewer from './components/DiffViewer';
import { THEMES, DEFAULT_LLM_CONFIG, DEFAULT_ROLES } from './constants';
import { CodeLanguage, AppMode, ThemeType, Session, ChatMessage, ViewMode, ProjectFile, LLMConfig, Project, Attachment, AgentRole, KnowledgeEntry, TodoItem, FileDiff } from './types';
import { fixCodeWithGemini } from './services/llmService';

// --- FACTORY FUNCTIONS ---

const createNewFile = (name: string = 'script.js'): ProjectFile => ({
  id: crypto.randomUUID(),
  name,
  language: CodeLanguage.JAVASCRIPT,
  content: ''
});

const createNewProject = (): Project => {
    const rootFile = createNewFile('index.js');
    return {
        id: crypto.randomUUID(),
        name: 'My Project',
        files: [rootFile],
        activeFileId: rootFile.id,
        lastModified: Date.now()
    };
};

const createNewSession = (projectId: string): Session => ({
    id: crypto.randomUUID(),
    projectId,
    title: 'New Conversation',
    messages: [],
    lastModified: Date.now(),
    mode: 'FIX'
});

const App: React.FC = () => {
  // --- STATE ---
  
  // Settings
  const [themeName, setThemeName] = useState<ThemeType>(() => (localStorage.getItem('cm_theme') as ThemeType) || 'cosmic');
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('cm_view_mode') as ViewMode) || 'classic');
  const [highCapacity, setHighCapacity] = useState<boolean>(() => localStorage.getItem('cm_high_capacity') === 'true');
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => {
    const saved = localStorage.getItem('cm_llm_config');
    return saved ? JSON.parse(saved) : DEFAULT_LLM_CONFIG;
  });
  const [roles, setRoles] = useState<AgentRole[]>(() => {
    const saved = localStorage.getItem('cm_roles');
    return saved ? JSON.parse(saved) : DEFAULT_ROLES;
  });
  
  // UI Flags
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  
  // Left Panel Tab State
  const [leftPanelTab, setLeftPanelTab] = useState<'code' | 'preview' | 'todos'>('code');

  const [activeTab, setActiveTab] = useState<'chats' | 'files' | 'knowledge'>('chats');

  // Data
  const [projects, setProjects] = useState<Project[]>(() => {
      const saved = localStorage.getItem('cm_projects');
      if (saved) return JSON.parse(saved);
      return [createNewProject()];
  });
  
  const [sessions, setSessions] = useState<Session[]>(() => {
      const saved = localStorage.getItem('cm_sessions_v2');
      if (saved) return JSON.parse(saved);
      return [];
  });
  
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeEntry[]>(() => {
      const saved = localStorage.getItem('cm_knowledge');
      return saved ? JSON.parse(saved) : [];
  });

  const [currentProjectId, setCurrentProjectId] = useState<string>(() => projects[0]?.id || '');
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  
  // To-Do List & Diff Engine
  const [todoList, setTodoList] = useState<TodoItem[]>([]);
  const [pendingDiffs, setPendingDiffs] = useState<FileDiff[]>([]);
  
  // Features
  const [useInternet, setUseInternet] = useState(false);

  // Derived State
  const activeProject = projects.find(p => p.id === currentProjectId) || projects[0];
  const activeFile = activeProject.files.find(f => f.id === activeProject.activeFileId) || activeProject.files[0];
  
  const activeSession = sessions.find(s => s.id === currentSessionId) || {
      id: 'temp', projectId: activeProject.id, title: 'New Chat', messages: [], lastModified: Date.now(), mode: 'FIX' as AppMode
  };

  // Inputs
  const [inputInstruction, setInputInstruction] = useState<string>('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  // Status
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const theme = THEMES[themeName];

  // --- PERSISTENCE ---
  useEffect(() => { localStorage.setItem('cm_theme', themeName); }, [themeName]);
  useEffect(() => { localStorage.setItem('cm_view_mode', viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem('cm_high_capacity', String(highCapacity)); }, [highCapacity]);
  useEffect(() => { localStorage.setItem('cm_llm_config', JSON.stringify(llmConfig)); }, [llmConfig]);
  useEffect(() => { localStorage.setItem('cm_roles', JSON.stringify(roles)); }, [roles]);
  useEffect(() => { localStorage.setItem('cm_projects', JSON.stringify(projects)); }, [projects]);
  useEffect(() => { localStorage.setItem('cm_sessions_v2', JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { localStorage.setItem('cm_knowledge', JSON.stringify(knowledgeBase)); }, [knowledgeBase]);

  // Ensure a session exists
  useEffect(() => {
     if (!sessions.find(s => s.projectId === currentProjectId)) {
         const newSess = createNewSession(currentProjectId);
         setSessions(prev => [...prev, newSess]);
         setCurrentSessionId(newSess.id);
     } else if (!sessions.find(s => s.id === currentSessionId)) {
         const projSess = sessions.find(s => s.projectId === currentProjectId);
         if (projSess) setCurrentSessionId(projSess.id);
     }
  }, [currentProjectId]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [activeSession.messages, isLoading, viewMode, isEditorOpen]);

  useEffect(() => {
    if (viewMode === 'classic') {
      setIsEditorOpen(true);
      setIsSidebarOpen(false);
    } else {
      setIsEditorOpen(false); 
      setIsSidebarOpen(true);
    }
  }, [viewMode]);

  // --- LOGIC ---

  const updateProject = (updates: Partial<Project>) => {
      setProjects(prev => prev.map(p => p.id === activeProject.id ? { ...p, ...updates, lastModified: Date.now() } : p));
  };

  const updateActiveFileContent = (content: string) => {
    const detected = detectLanguage(content);
    const updatedFiles = activeProject.files.map(f => 
      f.id === activeFile.id 
      ? { ...f, content, language: detected !== CodeLanguage.OTHER ? detected : f.language } 
      : f
    );
    updateProject({ files: updatedFiles });
  };

  const updateSession = (updates: Partial<Session>) => {
      setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, ...updates, lastModified: Date.now() } : s));
  };

  const detectLanguage = (text: string): CodeLanguage => {
    const trimmed = text.trim();
    if (!trimmed) return CodeLanguage.OTHER;
    if (trimmed.startsWith('<html') || trimmed.includes('</div>')) return CodeLanguage.HTML;
    if (trimmed.includes('import React')) return CodeLanguage.TYPESCRIPT;
    if (trimmed.includes('def ')) return CodeLanguage.PYTHON;
    if (trimmed.includes('public class')) return CodeLanguage.JAVA;
    return CodeLanguage.JAVASCRIPT;
  };
  
  const handleApplyDiff = (diff: FileDiff) => {
      const updatedFiles = [...activeProject.files];
      if (diff.type === 'create') {
          const newFile = createNewFile(diff.fileName);
          newFile.content = diff.newContent;
          // Simple lang detection
          if (diff.fileName.endsWith('.html')) newFile.language = CodeLanguage.HTML;
          else if (diff.fileName.endsWith('.css')) newFile.language = CodeLanguage.CSS;
          else if (diff.fileName.endsWith('.py')) newFile.language = CodeLanguage.PYTHON;
          updatedFiles.push(newFile);
      } else if (diff.type === 'update') {
          const idx = updatedFiles.findIndex(f => f.name === diff.fileName);
          if (idx !== -1) {
              updatedFiles[idx] = { ...updatedFiles[idx], content: diff.newContent };
          }
      }
      updateProject({ files: updatedFiles });
      setPendingDiffs(prev => prev.filter(d => d.id !== diff.id));
  };

  const handleRejectDiff = (id: string) => {
      setPendingDiffs(prev => prev.filter(d => d.id !== id));
  };

  // --- ACTIONS ---

  const handleCreateFile = () => {
    const name = prompt("Enter file name:", "new_file.js");
    if (name) {
      const newFile = createNewFile(name);
      if (name.endsWith('.css')) newFile.language = CodeLanguage.CSS;
      if (name.endsWith('.html')) newFile.language = CodeLanguage.HTML;
      if (name.endsWith('.py')) newFile.language = CodeLanguage.PYTHON;
      const updatedFiles = [...activeProject.files, newFile];
      updateProject({ files: updatedFiles, activeFileId: newFile.id });
      if (viewMode === 'chat') setIsEditorOpen(true);
    }
  };

  const handleDeleteFile = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (activeProject.files.length <= 1) return;
    if (window.confirm("Delete this file?")) {
       const updatedFiles = activeProject.files.filter(f => f.id !== fileId);
       updateProject({ files: updatedFiles, activeFileId: updatedFiles[0].id });
    }
  };

  const handleCreateProject = () => {
      const p = createNewProject();
      const s = createNewSession(p.id);
      setProjects([p, ...projects]);
      setSessions([...sessions, s]);
      setCurrentProjectId(p.id);
      setCurrentSessionId(s.id);
  };
  
  const handleCreateSession = () => {
      const s = createNewSession(currentProjectId);
      setSessions([...sessions, s]);
      setCurrentSessionId(s.id);
  };
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              setAttachments([...attachments, { type: 'image', content: base64, mimeType: file.type }]);
          };
          reader.readAsDataURL(file);
      }
  };

  const toggleRecording = async () => {
      if (isRecording && mediaRecorder) {
          mediaRecorder.stop();
          setIsRecording(false);
      } else {
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              const recorder = new MediaRecorder(stream);
              const chunks: BlobPart[] = [];
              recorder.ondataavailable = (e) => chunks.push(e.data);
              recorder.onstop = () => {
                  const blob = new Blob(chunks, { type: 'audio/webm' });
                  const reader = new FileReader();
                  reader.onloadend = () => {
                      const base64 = (reader.result as string).split(',')[1];
                      setAttachments(prev => [...prev, { type: 'audio', content: base64, mimeType: 'audio/webm' }]);
                  };
                  reader.readAsDataURL(blob);
              };
              recorder.start();
              setMediaRecorder(recorder);
              setIsRecording(true);
          } catch (e) {
              alert('Microphone access denied.');
          }
      }
  };

  // --- LLM ---

  const handleSendMessage = async () => {
    const promptText = inputInstruction.trim();
    if (!promptText && attachments.length === 0) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: promptText || (attachments.length ? '[Sent Attachments]' : ''),
      timestamp: Date.now(),
      attachments: attachments.length ? [...attachments] : undefined
    };

    const newMessages = [...activeSession.messages, userMsg];
    updateSession({ 
      messages: newMessages,
      title: activeSession.messages.length === 0 ? (promptText ? promptText.slice(0, 30) : 'Multimodal Chat') : activeSession.title 
    });
    
    setInputInstruction('');
    setAttachments([]);
    setIsLoading(true);
    setError(null);

    const response = await fixCodeWithGemini({
      activeFile: activeFile,
      allFiles: activeProject.files,
      history: newMessages,
      currentMessage: promptText || "Analyze.",
      attachments: userMsg.attachments,
      mode: activeSession.mode,
      useHighCapacity: highCapacity,
      llmConfig: llmConfig,
      roles: roles,
      knowledgeBase: knowledgeBase,
      useInternet: useInternet,
      currentTodos: todoList
    });

    if (response.error) {
      setError(response.error);
      setIsLoading(false);
      return;
    }

    // Handle Tool Calls (Tasks & Knowledge)
    // Pending Diffs are handled separately via proposedChanges
    if (response.toolCalls && response.toolCalls.length > 0) {
       let newKnowledge = [...knowledgeBase];
       let newTodos = [...todoList];
       
       response.toolCalls.forEach(call => {
           if (call.name === 'save_knowledge') {
                const entry: KnowledgeEntry = {
                    id: crypto.randomUUID(),
                    tags: call.args.tags,
                    content: call.args.content,
                    scope: 'global',
                    timestamp: Date.now()
                };
                newKnowledge.push(entry);
           } else if (call.name === 'manage_tasks') {
               const { action, task, phase, taskId, status } = call.args;
               if (action === 'add') {
                   newTodos.push({ id: crypto.randomUUID(), task, phase: phase || 'General', status: 'pending' });
               } else if (action === 'update' && taskId) {
                   newTodos = newTodos.map(t => t.id === taskId ? { ...t, status: status || t.status } : t);
               } else if (action === 'complete' && taskId) {
                   newTodos = newTodos.map(t => t.id === taskId ? { ...t, status: 'completed' } : t);
               } else if (action === 'delete' && taskId) {
                   newTodos = newTodos.filter(t => t.id !== taskId);
               }
           }
       });
       if (newKnowledge.length > knowledgeBase.length) setKnowledgeBase(newKnowledge);
       if (JSON.stringify(newTodos) !== JSON.stringify(todoList)) {
           setTodoList(newTodos);
           // Auto-switch to Todos tab if task was added
           setLeftPanelTab('todos');
       }
    }

    // Handle Proposed Changes (Diffs)
    if (response.proposedChanges && response.proposedChanges.length > 0) {
        setPendingDiffs(prev => [...prev, ...response.proposedChanges!]);
    }

    const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        content: response.response,
        timestamp: Date.now()
    };
    updateSession({ messages: [...newMessages, aiMsg] });
    setIsLoading(false);
  };

  // --- RENDER ---
  const renderSidebar = () => {
      const projectSessions = sessions.filter(s => s.projectId === activeProject.id);

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
                         <button onClick={handleCreateProject}><Plus className="w-3 h-3 hover:text-white" /></button>
                     </div>
                     <div className="space-y-1 mb-4">
                         {projects.map(p => (
                             <div key={p.id} onClick={() => setCurrentProjectId(p.id)} className={`flex justify-between px-3 py-2 rounded text-xs cursor-pointer ${activeProject.id === p.id ? `${theme.accentBg} ${theme.accent}` : `${theme.textMuted} hover:bg-white/5`}`}>
                                 <span className="truncate font-medium">{p.name}</span>
                             </div>
                         ))}
                     </div>
                     <div className={`px-2 py-2 text-xs font-bold uppercase ${theme.textMuted} flex justify-between`}>
                         <span>Sessions</span>
                         <button onClick={handleCreateSession}><Plus className="w-3 h-3 hover:text-white" /></button>
                     </div>
                     {projectSessions.map(session => (
                        <div key={session.id} onClick={() => { setCurrentSessionId(session.id); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} className={`flex justify-between p-2 rounded cursor-pointer text-sm ${currentSessionId === session.id ? `${theme.bgApp} border border-${theme.border.replace('border-', '')} ${theme.textMain}` : `hover:bg-white/5 ${theme.textMuted}`}`}>
                           <span className="truncate">{session.title}</span>
                           <button onClick={(e) => { e.stopPropagation(); setSessions(sessions.filter(s => s.id !== session.id)); }} className="opacity-0 hover:opacity-100"><Trash2 className="w-3 h-3 text-red-500"/></button>
                        </div>
                     ))}
                 </div>
             )}

             {/* FILES TAB */}
             {activeTab === 'files' && (
                 <div className="p-3">
                     <div className={`flex justify-between items-center text-xs uppercase font-semibold ${theme.textMuted} mb-3`}>
                        <span>Workspace</span>
                        <button onClick={handleCreateFile}><FilePlus className="w-3.5 h-3.5 hover:text-white" /></button>
                     </div>
                     <div className="space-y-1">
                        {activeProject.files.map(file => (
                            <div key={file.id} onClick={() => { updateProject({ activeFileId: file.id }); if(viewMode === 'chat') setIsEditorOpen(true); }} className={`flex justify-between px-2 py-2 rounded text-xs cursor-pointer ${activeProject.activeFileId === file.id ? `${theme.accent} bg-white/5` : `${theme.textMuted} hover:text-white`}`}>
                                <div className="flex items-center gap-2 truncate"><FileCode className="w-3.5 h-3.5" /> <span>{file.name}</span></div>
                                <button onClick={(e) => handleDeleteFile(e, file.id)} className="opacity-0 hover:opacity-100"><X className="w-3 h-3 text-red-500" /></button>
                            </div>
                        ))}
                     </div>
                 </div>
             )}

             {/* KNOWLEDGE TAB */}
             {activeTab === 'knowledge' && (
                 <KnowledgeBase 
                    entries={knowledgeBase} 
                    onAdd={(entry) => setKnowledgeBase([...knowledgeBase, entry])} 
                    onRemove={(id) => setKnowledgeBase(knowledgeBase.filter(k => k.id !== id))}
                    theme={theme}
                 />
             )}
         </div>
       </div>
      );
  }

  return (
    <div className={`flex h-screen overflow-hidden ${theme.bgApp} ${theme.textMain} transition-colors duration-300`}>
      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}
      {viewMode === 'chat' && renderSidebar()}

      <div className="flex-grow flex flex-col min-w-0 h-full relative">
        <Header theme={theme} viewMode={viewMode} onOpenSettings={() => setShowSettings(true)} />

        <div className="flex-grow flex flex-col lg:flex-row overflow-hidden relative">
          
          {/* EDITOR / PREVIEW / TODO PANEL */}
          <div className={`flex flex-col border-b lg:border-b-0 lg:border-r ${theme.border} transition-all duration-300 ${viewMode === 'classic' ? 'w-full h-1/2 lg:h-auto lg:w-1/2' : isEditorOpen ? 'w-full h-full lg:w-1/2 absolute lg:relative z-20 lg:z-0 bg-slate-900 lg:bg-transparent' : 'hidden lg:w-0'}`}>
             <div className={`${theme.bgPanel} border-b ${theme.border} flex items-center justify-between h-12 flex-shrink-0 px-2`}>
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar mask-gradient-right max-w-[60%]">
                   {viewMode === 'chat' && <button onClick={() => setIsEditorOpen(false)} className="lg:hidden p-2 mr-2 hover:bg-white/10 rounded"><ArrowLeft className="w-4 h-4" /></button>}
                   {viewMode === 'classic' && <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-2 mr-2 rounded hover:bg-white/5 ${theme.textMuted} lg:hidden`}><SidebarIcon className="w-4 h-4" /></button>}
                   
                   {activeProject.files.map(file => (
                       <button
                         key={file.id}
                         onClick={() => updateProject({ activeFileId: file.id })}
                         className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-medium border-t border-x border-transparent transition-all min-w-[80px] max-w-[150px] ${activeProject.activeFileId === file.id ? `${theme.bgApp} ${theme.textMain} border-${theme.border.replace('border-', '')} border-b-${theme.bgApp}` : `hover:bg-white/5 ${theme.textMuted} border-b-${theme.border.replace('border-', '')}`}`}
                         style={{ marginBottom: '-1px' }}
                       >
                           <span className="truncate">{file.name}</span>
                       </button>
                   ))}
                   <button onClick={handleCreateFile} className={`p-1.5 rounded hover:bg-white/10 ${theme.textMuted}`}><Plus className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center gap-1 pl-2 border-l border-white/5">
                   {/* Panel Tabs */}
                   <button onClick={() => setLeftPanelTab('code')} className={`p-2 rounded transition-colors ${leftPanelTab === 'code' ? `${theme.accentBg} ${theme.accent}` : `${theme.textMuted} hover:text-white`}`} title="Code"><Code2 className="w-4 h-4"/></button>
                   <button onClick={() => setLeftPanelTab('preview')} className={`p-2 rounded transition-colors ${leftPanelTab === 'preview' ? `${theme.accentBg} ${theme.accent}` : `${theme.textMuted} hover:text-white`}`} title="Preview"><Eye className="w-4 h-4"/></button>
                   <button onClick={() => setLeftPanelTab('todos')} className={`p-2 rounded transition-colors ${leftPanelTab === 'todos' ? `${theme.accentBg} ${theme.accent}` : `${theme.textMuted} hover:text-white`} relative`} title="Plan & Tasks">
                       <ListTodo className="w-4 h-4"/>
                       {todoList.filter(t => t.status === 'pending').length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
                   </button>
                </div>
             </div>

             <div className={`flex-grow relative min-h-0 ${theme.codeBg}`}>
                {leftPanelTab === 'preview' && <WebPreview files={activeProject.files} theme={theme} />}
                {leftPanelTab === 'todos' && <TodoList todos={todoList} theme={theme} onToggle={(id) => setTodoList(prev => prev.map(t => t.id === id ? {...t, status: t.status === 'completed' ? 'pending' : 'completed'} : t))} />}
                {leftPanelTab === 'code' && <CodeEditor value={activeFile.content} onChange={updateActiveFileContent} language={activeFile.language.toLowerCase()} theme={theme} themeType={themeName} />}
             </div>
             
             {viewMode === 'classic' && (
                <div className={`p-4 border-t ${theme.border} ${theme.bgPanel} flex-shrink-0`}>
                   <div className="flex gap-2 mb-3">
                       <button onClick={() => updateSession({ mode: 'FIX' })} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all flex justify-center gap-2 ${activeSession.mode === 'FIX' ? theme.button : `border-${theme.border}`}`}><Wrench className="w-4 h-4"/> Fix Code</button>
                       <button onClick={() => updateSession({ mode: 'EXPLAIN' })} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all flex justify-center gap-2 ${activeSession.mode === 'EXPLAIN' ? theme.button : `border-${theme.border}`}`}><BookOpen className="w-4 h-4"/> Explain</button>
                   </div>
                   <div className="relative">
                       <textarea value={inputInstruction} onChange={(e) => setInputInstruction(e.target.value)} onKeyDown={(e) => {if(e.key === 'Enter' && !e.shiftKey) {e.preventDefault(); handleSendMessage();}}} placeholder="Instructions..." className={`w-full ${theme.bgApp} border ${theme.border} rounded-xl px-4 py-3 pr-14 text-sm outline-none resize-none`} rows={2} />
                       <button onClick={handleSendMessage} disabled={isLoading} className={`absolute right-2 bottom-2 p-2 rounded-lg ${theme.button} text-white`}>{isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"/> : <Play className="w-5 h-5 fill-current"/>}</button>
                   </div>
                </div>
             )}
          </div>

          {/* CHAT / RESULT PANEL */}
          <div className={`flex-col relative ${viewMode === 'classic' ? `flex w-full h-1/2 lg:h-auto lg:w-1/2 ${theme.bgPanel}` : `flex ${isEditorOpen ? 'hidden lg:flex lg:w-1/2' : 'w-full'} bg-black/20 h-full border-l ${theme.border}`}`}>
             {viewMode === 'chat' && (
                  <div className={`${theme.bgPanel} px-4 h-12 border-b ${theme.border} flex items-center justify-between flex-shrink-0`}>
                     <div className="flex items-center gap-3 lg:gap-2">
                       <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden p-1.5 rounded hover:bg-white/5"><SidebarIcon className="w-4 h-4" /></button>
                       <span className={`text-sm font-semibold ${theme.textMain} truncate`}>{activeProject.name} / {activeSession.title}</span>
                     </div>
                     <button onClick={() => setIsEditorOpen(!isEditorOpen)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${isEditorOpen ? `${theme.accentBg} ${theme.accent} border-${theme.accent}/20` : `${theme.bgApp} border-${theme.border} ${theme.textMuted}`}`}>
                        <Code2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{isEditorOpen ? 'Hide Code' : 'View Code'}</span>
                     </button>
                  </div>
             )}

             <div ref={chatContainerRef} className="flex-grow overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
                {activeSession.messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-40 text-center p-8">
                        <Sparkles className="w-12 h-12 mb-4 text-yellow-500"/>
                        <p>Start a conversation, ask for fixes, or create new features.</p>
                        <p className="text-xs mt-2 opacity-70">Use #tags to recall learned concepts.</p>
                    </div>
                )}
                
                {activeSession.messages.map((msg) => (
                    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[90%] lg:max-w-[85%] rounded-2xl px-5 py-4 shadow-sm ${msg.role === 'user' ? `${theme.accentBg} border border-${theme.accent}/20 rounded-tr-none` : `${theme.bgPanel} border ${theme.border} rounded-tl-none`}`}>
                            {msg.role === 'user' ? (
                                <div className="space-y-2">
                                    {msg.attachments?.map((att, i) => (
                                        <div key={i} className="mb-2 rounded overflow-hidden border border-white/10">
                                            {att.type === 'image' ? <img src={`data:${att.mimeType};base64,${att.content}`} className="max-h-48 object-cover" /> : <div className="p-2 flex items-center gap-2 bg-white/5"><Mic className="w-4 h-4"/> Audio Clip</div>}
                                        </div>
                                    ))}
                                    <p className={`whitespace-pre-wrap text-sm ${theme.textMain}`}>{msg.content}</p>
                                </div>
                            ) : (
                                <MarkdownRenderer content={msg.content} theme={theme} />
                            )}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex flex-col items-start animate-pulse">
                        <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl rounded-tl-none px-5 py-4 flex items-center gap-3`}>
                             <div className={`w-2 h-2 rounded-full ${theme.accent} bg-current animate-bounce`}></div>
                             <div className={`w-2 h-2 rounded-full ${theme.accent} bg-current animate-bounce delay-75`}></div>
                             <div className={`w-2 h-2 rounded-full ${theme.accent} bg-current animate-bounce delay-150`}></div>
                        </div>
                    </div>
                )}
                {error && <div className="w-full flex justify-center"><div className="bg-red-500/10 text-red-400 px-4 py-2 rounded-lg text-sm border border-red-500/20">{error}</div></div>}
             </div>

             {/* PENDING DIFFS OVERLAY */}
             {pendingDiffs.length > 0 && (
                 <div className={`absolute bottom-20 left-4 right-4 z-20 ${theme.bgPanel} border ${theme.border} rounded-xl shadow-2xl flex flex-col max-h-[60%]`}>
                     <div className={`p-3 border-b ${theme.border} flex justify-between items-center ${theme.bgPanelHeader}`}>
                         <span className="text-xs font-bold uppercase flex items-center gap-2"><GitCompare className="w-4 h-4 text-blue-400"/> Review Proposed Changes ({pendingDiffs.length})</span>
                         <span className={`text-[10px] ${theme.textMuted}`}>{pendingDiffs[0].fileName}</span>
                     </div>
                     <div className="flex-1 overflow-hidden p-2 bg-black/50">
                         <DiffViewer original={pendingDiffs[0].originalContent} modified={pendingDiffs[0].newContent} theme={theme} />
                     </div>
                     <div className="p-3 border-t border-white/5 flex justify-end gap-2">
                         <button onClick={() => handleRejectDiff(pendingDiffs[0].id)} className="px-4 py-2 rounded-lg text-xs font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20">Reject</button>
                         <button onClick={() => handleApplyDiff(pendingDiffs[0])} className="px-4 py-2 rounded-lg text-xs font-bold bg-green-500/10 text-green-500 hover:bg-green-500/20">Apply Change</button>
                     </div>
                 </div>
             )}

             {viewMode === 'chat' && (
                 <div className={`p-4 border-t ${theme.border} ${theme.bgPanel} flex-shrink-0`}>
                     {attachments.length > 0 && (
                         <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
                             {attachments.map((att, i) => (
                                 <div key={i} className="relative group flex-shrink-0">
                                     {att.type === 'image' ? <img src={`data:${att.mimeType};base64,${att.content}`} className="h-16 w-16 object-cover rounded border border-white/20" /> : <div className="h-16 w-16 flex items-center justify-center bg-white/10 rounded border border-white/20"><Mic className="w-6 h-6"/></div>}
                                     <button onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3"/></button>
                                 </div>
                             ))}
                         </div>
                     )}

                     <div className="flex gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
                        <button onClick={() => updateSession({ mode: 'FIX' })} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${activeSession.mode === 'FIX' ? `${theme.button} border-transparent text-white` : `border-${theme.border} ${theme.textMuted}`}`}><Wrench className="w-3 h-3"/> Fix</button>
                        <button onClick={() => updateSession({ mode: 'EXPLAIN' })} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${activeSession.mode === 'EXPLAIN' ? `${theme.button} border-transparent text-white` : `border-${theme.border} ${theme.textMuted}`}`}><BookOpen className="w-3 h-3"/> Explain</button>
                        <button onClick={() => updateSession({ mode: 'NORMAL' })} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${activeSession.mode === 'NORMAL' ? `${theme.button} border-transparent text-white` : `border-${theme.border} ${theme.textMuted}`}`}><Brain className="w-3 h-3"/> Normal</button>
                        <button onClick={() => setUseInternet(!useInternet)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${useInternet ? `bg-blue-600 border-transparent text-white` : `border-${theme.border} ${theme.textMuted}`}`}><Globe className="w-3 h-3"/> Internet</button>
                     </div>
                     
                     <div className="relative flex items-end gap-2">
                        <div className="flex flex-col gap-1 absolute left-2 bottom-3 z-10">
                            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                            <button onClick={() => fileInputRef.current?.click()} className={`${theme.textMuted} hover:text-white p-1.5 rounded-full hover:bg-white/10`}><ImageIcon className="w-4 h-4" /></button>
                            <button onClick={toggleRecording} className={`${isRecording ? 'text-red-500 animate-pulse' : theme.textMuted} hover:text-white p-1.5 rounded-full hover:bg-white/10`}><Mic className="w-4 h-4" /></button>
                        </div>
                        <textarea
                          value={inputInstruction}
                          onChange={(e) => setInputInstruction(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                          placeholder="Message..."
                          className={`w-full ${theme.bgApp} border ${theme.border} rounded-xl pl-10 px-4 py-3 text-sm outline-none resize-none max-h-32 custom-scrollbar shadow-inner`}
                          rows={1}
                          style={{minHeight: '46px'}}
                        />
                        <button onClick={handleSendMessage} disabled={isLoading} className={`p-3 rounded-xl flex-shrink-0 transition-all ${isLoading ? 'bg-white/5 text-slate-500 cursor-not-allowed' : `${theme.button} ${theme.buttonHover} text-white shadow-lg`}`}>
                          <Send className="w-5 h-5" />
                        </button>
                     </div>
                 </div>
             )}
          </div>
        </div>
      </div>
      {showSettings && <SettingsModal theme={theme} themeName={themeName} setThemeName={setThemeName} viewMode={viewMode} setViewMode={setViewMode} highCapacity={highCapacity} setHighCapacity={setHighCapacity} llmConfig={llmConfig} setLlmConfig={setLlmConfig} roles={roles} setRoles={setRoles} onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default App;
