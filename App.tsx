import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Sparkles, Play, Wrench, X, Settings, Send, Sidebar as SidebarIcon, Code2, ArrowLeft, Eye, Image as ImageIcon, Mic, StopCircle, BookOpen, Globe, Brain, ListTodo, GitCompare, Plus, Zap, RefreshCw, Pencil } from 'lucide-react';

import Header from './components/Header';
import MarkdownRenderer from './components/MarkdownRenderer';
import CodeEditor from './components/CodeEditor';
import WebPreview from './components/WebPreview';
import SettingsModal from './components/SettingsModal';
import TodoList from './components/TodoList';
import DiffViewer from './components/DiffViewer';
import AppSidebar from './components/AppSidebar';
import ProcessLog from './components/ProcessLog';
import Terminal from './components/Terminal'; 

import { THEMES, DEFAULT_LLM_CONFIG, DEFAULT_ROLES } from './constants';
import { CodeLanguage, AppMode, ThemeType, Session, ChatMessage, ViewMode, ProjectFile, LLMConfig, Project, Attachment, AgentRole, KnowledgeEntry, TodoItem, FileDiff, ProjectSummary } from './types';
import { fixCodeWithGemini, streamFixCodeWithGemini } from './services/llmService';
import { fetchRepoContents } from './services/githubService';
import { contextService } from './services/contextService';
import { modelSwitchService } from './services/modelSwitchService';
import { KnowledgeManager } from './services/llmTools';

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

// Streaming message component
const StreamingMessage: React.FC<{ content: string; theme: any }> = ({ content, theme }) => {
  return <MarkdownRenderer content={content} theme={theme} />;
};

const App: React.FC = () => {
  // --- STATE ---
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

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [showGithubInput, setShowGithubInput] = useState(false);
  const [repoInput, setRepoInput] = useState('');
  const [leftPanelTab, setLeftPanelTab] = useState<'code' | 'preview' | 'todos'>('code');
  const [activeTab, setActiveTab] = useState<'chats' | 'files' | 'knowledge'>('chats');

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
      const saved = localStorage.getItem('cm_knowledge_enhanced');
      return saved ? JSON.parse(saved) : [];
  });

  const [currentProjectId, setCurrentProjectId] = useState<string>(() => projects[0]?.id || '');
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [todoList, setTodoList] = useState<TodoItem[]>([]);
  const [pendingDiffs, setPendingDiffs] = useState<FileDiff[]>([]);
  const [useInternet, setUseInternet] = useState(false);
  const [useStreaming, setUseStreaming] = useState<boolean>(() => localStorage.getItem('cm_use_streaming') !== 'false');
  const [projectSummaries, setProjectSummaries] = useState<Record<string, ProjectSummary>>(() => {
    const saved = localStorage.getItem('cm_project_summaries');
    return saved ? JSON.parse(saved) : {};
  });
  const [useCompression, setUseCompression] = useState<boolean>(() => localStorage.getItem('cm_use_compression') !== 'false');
  const [showModelSwitch, setShowModelSwitch] = useState<boolean>(false);
  const [suggestedModels, setSuggestedModels] = useState<LLMConfig[]>([]);
  const [switchReason, setSwitchReason] = useState<string>('');

  // --- NEW STATE FOR PROCESS LOGS ---
  const [processSteps, setProcessSteps] = useState<string[]>([]);
  const [isProcessComplete, setIsProcessComplete] = useState(false);

  // Derived State
  const activeProject = projects.find(p => p.id === currentProjectId) || projects[0];
  const activeFile = activeProject.files.find(f => f.id === activeProject.activeFileId) || activeProject.files[0];
  const activeSession = sessions.find(s => s.id === currentSessionId) || {
      id: 'temp', projectId: activeProject.id, title: 'New Chat', messages: [], lastModified: Date.now(), mode: 'FIX' as AppMode
  };

  const [inputInstruction, setInputInstruction] = useState<string>('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const theme = THEMES[themeName];

  // Initialize Knowledge Manager
  useEffect(() => {
    const knowledgeManager = KnowledgeManager.getInstance();
    knowledgeManager.loadKnowledge(knowledgeBase);
  }, [knowledgeBase]);

  // --- PERSISTENCE ---
  useEffect(() => { localStorage.setItem('cm_theme', themeName); }, [themeName]);
  useEffect(() => { localStorage.setItem('cm_view_mode', viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem('cm_high_capacity', String(highCapacity)); }, [highCapacity]);
  useEffect(() => { localStorage.setItem('cm_llm_config', JSON.stringify(llmConfig)); }, [llmConfig]);
  useEffect(() => { localStorage.setItem('cm_roles', JSON.stringify(roles)); }, [roles]);
  useEffect(() => { localStorage.setItem('cm_projects', JSON.stringify(projects)); }, [projects]);
  useEffect(() => { localStorage.setItem('cm_sessions_v2', JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { localStorage.setItem('cm_knowledge_enhanced', JSON.stringify(knowledgeBase)); }, [knowledgeBase]);
  useEffect(() => { localStorage.setItem('cm_use_streaming', String(useStreaming)); }, [useStreaming]);
  useEffect(() => { localStorage.setItem('cm_project_summaries', JSON.stringify(projectSummaries)); }, [projectSummaries]);
  useEffect(() => { localStorage.setItem('cm_use_compression', String(useCompression)); }, [useCompression]);

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
    const generateProjectSummary = async () => {
      if (activeProject.files.length > 0 && !projectSummaries[activeProject.id]) {
        try {
          const summary = await contextService.generateProjectSummary(activeProject);
          setProjectSummaries(prev => ({ ...prev, [activeProject.id]: summary }));
        } catch (error) { console.warn('Failed to generate summary:', error); }
      }
    };
    generateProjectSummary();
  }, [activeProject.files, activeProject.id]);

  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [activeSession.messages, isLoading, viewMode, isEditorOpen, streamingContent, processSteps]);

  useEffect(() => {
    if (viewMode === 'classic') { setIsEditorOpen(true); setIsSidebarOpen(false); }
    else { setIsEditorOpen(false); setIsSidebarOpen(true); }
  }, [viewMode]);

  // --- ACTIONS ---
  const updateProject = (updates: Partial<Project>) => {
      setProjects(prev => prev.map(p => p.id === activeProject.id ? { ...p, ...updates, lastModified: Date.now() } : p));
  };

  const updateActiveFileContent = (content: string) => {
    const detected = detectLanguage(content);
    const updatedFiles = activeProject.files.map(f => f.id === activeFile.id ? { ...f, content, language: detected !== CodeLanguage.OTHER ? detected : f.language } : f);
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
          if (diff.fileName.endsWith('.css')) newFile.language = CodeLanguage.CSS;
          if (diff.fileName.endsWith('.html')) newFile.language = CodeLanguage.HTML;
          if (diff.fileName.endsWith('.py')) newFile.language = CodeLanguage.PYTHON;
          updatedFiles.push(newFile);
      } else if (diff.type === 'update') {
          const idx = updatedFiles.findIndex(f => f.name === diff.fileName);
          if (idx !== -1) updatedFiles[idx] = { ...updatedFiles[idx], content: diff.newContent };
      }
      updateProject({ files: updatedFiles });
      setPendingDiffs(prev => prev.filter(d => d.id !== diff.id));
  };

  const handleCreateFile = () => {
    const name = prompt("Enter file name:", "new_file.js");
    if (name) {
      const newFile = createNewFile(name);
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

  const handleImportGithub = async () => {
      if (!repoInput) return;
      setIsLoading(true);
      try {
          const p = await fetchRepoContents(repoInput, llmConfig.github?.personalAccessToken);
          const s = createNewSession(p.id);
          setProjects([p, ...projects]);
          setSessions([...sessions, s]);
          setCurrentProjectId(p.id);
          setCurrentSessionId(s.id);
          setShowGithubInput(false);
          setRepoInput('');
      } catch (e: any) { alert(e.message); } finally { setIsLoading(false); }
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onloadend = () => {
              const content = reader.result as string;
              // For text files, you might want to create a new file in the project
              if (file.type.startsWith('text/')) {
                  const newFile = createNewFile(file.name);
                  newFile.content = content;
                  const updatedFiles = [...activeProject.files, newFile];
                  updateProject({ files: updatedFiles, activeFileId: newFile.id });
              }
          };
          reader.readAsText(file);
      }
  };

  // --- TERMINAL HELP HANDLER ---
  const handleTerminalError = (errorLogs: string) => {
    // 1. Switch to chat to see the discussion
    if (viewMode === 'classic') {
       // In classic mode, chat is on the right, ensure sidebar doesn't block if mobile
       if (window.innerWidth < 1024) setIsSidebarOpen(false); 
    } 

    // 2. Populate input with the error log context
    const helpRequest = `I ran into this error in the terminal:\n\n\`\`\`\n${errorLogs}\n\`\`\`\n\nCan you help me fix this?`;
    setInputInstruction(helpRequest);

    // 3. Focus the chat input (optional, requires ref)
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
          } catch (e) { alert('Microphone access denied.'); }
      }
  };

  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setStreamingMessageId(null);
    setStreamingContent('');
    setIsProcessComplete(true);
  };

  // --- LLM HANDLING ---

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
    triggerAIResponse(newMessages);
  };

  // New function to handle both new messages and retries
  const triggerAIResponse = async (history: ChatMessage[]) => {
    setIsLoading(true);
    setError(null);
    setProcessSteps([]);
    setIsProcessComplete(false);

    // Create a temporary streaming message
    const streamingMsgId = crypto.randomUUID();
    setStreamingMessageId(streamingMsgId);
    setStreamingContent('');

    if (useStreaming && llmConfig.provider !== 'gemini') {
      await handleStreamingResponse(history, streamingMsgId);
    } else {
      await handleRegularResponse(history, streamingMsgId);
    }
  };

  const handleRegularResponse = async (history: ChatMessage[], streamingMsgId: string) => {
    setProcessSteps(['Sending request to AI...', 'Waiting for response...']);
    try {
      const response = await fixCodeWithGemini({
        activeFile, allFiles: activeProject.files, history: history,
        currentMessage: history[history.length - 1].content,
        attachments: history[history.length - 1].attachments,
        mode: activeSession.mode, useHighCapacity: highCapacity, llmConfig,
        roles, knowledgeBase, useInternet, currentTodos: todoList,
        projectSummary: projectSummaries[activeProject.id], useCompression
      });

      if (response.error) { setError(response.error); return; }

      // Update knowledge base if new knowledge was saved
      if (response.newKnowledge && response.newKnowledge.length > 0) {
        setKnowledgeBase(prev => [...prev, ...response.newKnowledge!]);
      }

      setProcessSteps(prev => [...prev, 'Analyzing response...', 'Process complete.']);
      setIsProcessComplete(true);
      processAIResponse(response, history);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setIsLoading(false);
      setStreamingMessageId(null);
      setStreamingContent('');
    }
  };

  const handleStreamingResponse = async (history: ChatMessage[], streamingMsgId: string) => {
    abortControllerRef.current = new AbortController();
    setProcessSteps(['Analyzing request...']);

    try {
      await streamFixCodeWithGemini({
        activeFile, allFiles: activeProject.files, history: history,
        currentMessage: history[history.length - 1].content,
        attachments: history[history.length - 1].attachments,
        mode: activeSession.mode, useHighCapacity: highCapacity, llmConfig,
        roles, knowledgeBase, useInternet, currentTodos: todoList,
        projectSummary: projectSummaries[activeProject.id], useCompression
      }, {
        onContent: (content) => setStreamingContent(prev => prev + content),
        onStatusUpdate: (status) => {
            setProcessSteps(prev => {
                if (prev[prev.length - 1] === status) return prev;
                return [...prev, status];
            });
        },
        onToolCalls: (toolCalls) => processToolCalls(toolCalls),
        onProposedChanges: (changes) => setPendingDiffs(prev => [...prev, ...changes]),
        onComplete: (fullResponse) => {
          setIsProcessComplete(true);
          const aiMsg: ChatMessage = {
            id: streamingMsgId, role: 'model', content: fullResponse, timestamp: Date.now()
          };
          updateSession({ messages: [...history, aiMsg] });
        },
        onError: (error) => setError(error)
      }, abortControllerRef.current.signal);
    } catch (error: any) {
      if (error.name !== 'AbortError') setError(error.message);
    } finally {
      setIsLoading(false);
      setStreamingMessageId(null);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  };

  const processToolCalls = (toolCalls: any[]) => {
    let newKnowledge = [...knowledgeBase];
    let newTodos = [...todoList];

    toolCalls.forEach(call => {
      if (call.name === 'save_knowledge') {
        const newEntry: KnowledgeEntry = {
          id: crypto.randomUUID(),
          tags: call.args.tags,
          content: call.args.content,
          scope: call.args.tags.includes('#global') ? 'global' : 'project',
          timestamp: Date.now()
        };
        newKnowledge.push(newEntry);
      } else if (call.name === 'manage_tasks') {
        const { action, task, phase, taskId, status } = call.args;
        if (action === 'add') newTodos.push({ id: crypto.randomUUID(), task, phase: phase || 'General', status: 'pending' });
        else if (action === 'update' && taskId) newTodos = newTodos.map(t => t.id === taskId ? { ...t, status: status || t.status } : t);
        else if (action === 'complete' && taskId) newTodos = newTodos.map(t => t.id === taskId ? { ...t, status: 'completed' } : t);
        else if (action === 'delete' && taskId) newTodos = newTodos.filter(t => t.id !== taskId);
      }
    });

    if (newKnowledge.length > knowledgeBase.length) {
      setKnowledgeBase(newKnowledge);
    }
    if (JSON.stringify(newTodos) !== JSON.stringify(todoList)) {
      setTodoList(newTodos);
      setLeftPanelTab('todos');
    }
  };

  const processAIResponse = (response: any, history: ChatMessage[]) => {
    if (response.toolCalls) processToolCalls(response.toolCalls);
    if (response.proposedChanges) setPendingDiffs(prev => [...prev, ...response.proposedChanges!]);
    const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'model', content: response.response, timestamp: Date.now() };
    updateSession({ messages: [...history, aiMsg] });
  };

  const handleModelSwitch = async (newConfig: LLMConfig) => {
      setLlmConfig(newConfig);
      setShowModelSwitch(false);
  };

  // --- EDIT & RETRY LOGIC ---
  const handleEditMessage = (msgId: string, newContent: string) => {
    const msgIndex = activeSession.messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;

    // Create a new history up to the edited message
    const newHistory = activeSession.messages.slice(0, msgIndex);
    const editedMsg = { ...activeSession.messages[msgIndex], content: newContent, isEdited: true };
    newHistory.push(editedMsg);

    // Update session immediately with the edit (removing subsequent messages)
    updateSession({ messages: newHistory });

    // Retrigger AI with the new history
    triggerAIResponse(newHistory);
  };

  const handleRetry = () => {
    const lastMsg = activeSession.messages[activeSession.messages.length - 1];
    if (lastMsg.role === 'user') {
        // If last was user, just trigger response
        triggerAIResponse(activeSession.messages);
    } else if (lastMsg.role === 'model') {
        // If last was model, remove it and re-trigger based on the user msg before it
        const newHistory = activeSession.messages.slice(0, -1);
        updateSession({ messages: newHistory });
        triggerAIResponse(newHistory);
    }
  };

  // --- RENDER ---
  return (
    <div className={`flex h-screen overflow-hidden ${theme.bgApp} ${theme.textMain} transition-colors duration-300`}>
      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden" onClick={() => setIsSidebarOpen(false)} />}

      {viewMode === 'chat' && (
        <AppSidebar
            activeTab={activeTab} setActiveTab={setActiveTab} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
            theme={theme} projects={projects} activeProject={activeProject} sessions={sessions} currentSessionId={currentSessionId}
            knowledgeBase={knowledgeBase} showGithubInput={showGithubInput} repoInput={repoInput}
            setShowGithubInput={setShowGithubInput} setRepoInput={setRepoInput} handleImportGithub={handleImportGithub}
            handleCreateProject={handleCreateProject} setCurrentProjectId={setCurrentProjectId} handleCreateSession={handleCreateSession}
            setCurrentSessionId={setCurrentSessionId} setSessions={setSessions} handleCreateFile={handleCreateFile}
            handleDeleteFile={handleDeleteFile} updateProject={updateProject} setKnowledgeBase={setKnowledgeBase}
            viewMode={viewMode} setIsEditorOpen={setIsEditorOpen}
            setProjects={setProjects} // <--- ADDED THIS PROP
        />
      )}

      <div className="flex-grow flex flex-col min-w-0 h-full relative">
        <Header theme={theme} viewMode={viewMode} onOpenSettings={() => setShowSettings(true)} />

        <div className="flex-grow flex flex-col lg:flex-row overflow-hidden relative">
          {/* EDITOR / PREVIEW PANEL */}
          <div className={`flex flex-col border-b lg:border-b-0 lg:border-r ${theme.border} transition-all duration-300 ${viewMode === 'classic' ? 'w-full h-1/2 lg:h-auto lg:w-1/2' : isEditorOpen ? 'w-full h-full lg:w-1/2 absolute lg:relative z-20 lg:z-0 bg-slate-900 lg:bg-transparent' : 'hidden lg:w-0'}`}>
             <div className={`${theme.bgPanel} border-b ${theme.border} flex items-center justify-between h-12 flex-shrink-0 px-2`}>
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar mask-gradient-right max-w-[60%]">
                   {viewMode === 'chat' && <button onClick={() => setIsEditorOpen(false)} className="lg:hidden p-2 mr-2 hover:bg-white/10 rounded"><ArrowLeft className="w-4 h-4" /></button>}
                   {viewMode === 'classic' && <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-2 mr-2 rounded hover:bg-white/5 ${theme.textMuted} lg:hidden`}><SidebarIcon className="w-4 h-4" /></button>}
                   {activeProject.files.map(file => (
                       <button key={file.id} onClick={() => updateProject({ activeFileId: file.id })} className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-medium border-t border-x border-transparent transition-all min-w-[80px] max-w-[150px] ${activeProject.activeFileId === file.id ? `${theme.bgApp} ${theme.textMain} border-${theme.border.replace('border-', '')} border-b-${theme.bgApp}` : `hover:bg-white/5 ${theme.textMuted} border-b-${theme.border.replace('border-', '')}`}`} style={{ marginBottom: '-1px' }}>
                           <span className="truncate">{file.name}</span>
                       </button>
                   ))}
                   <button onClick={handleCreateFile} className={`p-1.5 rounded hover:bg-white/10 ${theme.textMuted}`}><Plus className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center gap-1 pl-2 border-l border-white/5">
                   <button onClick={() => setLeftPanelTab('code')} className={`p-2 rounded transition-colors ${leftPanelTab === 'code' ? `${theme.accentBg} ${theme.accent}` : `${theme.textMuted} hover:text-white`}`} title="Code"><Code2 className="w-4 h-4"/></button>
                   <button onClick={() => setLeftPanelTab('preview')} className={`p-2 rounded transition-colors ${leftPanelTab === 'preview' ? `${theme.accentBg} ${theme.accent}` : `${theme.textMuted} hover:text-white`}`} title="Preview"><Eye className="w-4 h-4"/></button>
                   <button onClick={() => setLeftPanelTab('todos')} className={`p-2 rounded transition-colors ${leftPanelTab === 'todos' ? `${theme.accentBg} ${theme.accent}` : `${theme.textMuted} hover:text-white`} relative`} title="Plan & Tasks"><ListTodo className="w-4 h-4"/></button>
                </div>
             </div>
             <div className={`flex-grow relative min-h-0 ${theme.codeBg}`}>
                {leftPanelTab === 'preview' && <WebPreview files={activeProject.files} theme={theme} />}
                {leftPanelTab === 'todos' && <TodoList todos={todoList} theme={theme} onToggle={(id) => setTodoList(prev => prev.map(t => t.id === id ? {...t, status: t.status === 'completed' ? 'pending' : 'completed'} : t))} />}
                {leftPanelTab === 'code' && <CodeEditor value={activeFile.content} onChange={updateActiveFileContent} language={activeFile.language.toLowerCase()} theme={theme} themeType={themeName} />}
             </div>
             {viewMode === 'classic' && (
                <div className={`p-4 border-t ${theme.border} ${theme.bgPanel} flex-shrink-0`}>
                   <div className="relative">
                       <textarea 
                         value={inputInstruction} 
                         onChange={(e) => setInputInstruction(e.target.value)} 
                         onKeyDown={(e) => {
                           if(e.key === 'Enter' && !e.shiftKey) {
                             e.preventDefault(); 
                             handleSendMessage();
                           }
                         }} 
                         placeholder="Instructions..." 
                         className={`w-full ${theme.bgApp} border ${theme.border} rounded-xl pl-12 px-4 py-3 pr-14 text-sm outline-none resize-none`} 
                         rows={2} 
                       />
                       {/* Photo and Microphone buttons for classic mode */}
                       <div className="flex flex-col gap-1 absolute left-2 bottom-3 z-10">
                         <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                         <button onClick={() => imageInputRef.current?.click()} className={`${theme.textMuted} hover:text-white p-1.5 rounded-full hover:bg-white/10`}><ImageIcon className="w-4 h-4" /></button>
                         <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.js,.ts,.jsx,.tsx,.html,.css,.py,.java,.json" className="hidden" />
                         <button onClick={() => fileInputRef.current?.click()} className={`${theme.textMuted} hover:text-white p-1.5 rounded-full hover:bg-white/10`}><Code2 className="w-4 h-4" /></button>
                         <button onClick={toggleRecording} className={`${isRecording ? 'text-red-500 animate-pulse' : theme.textMuted} hover:text-white p-1.5 rounded-full hover:bg-white/10`}><Mic className="w-4 h-4" /></button>
                       </div>
                       <button onClick={handleSendMessage} disabled={isLoading} className={`absolute right-2 bottom-2 p-2 rounded-lg ${isLoading ? 'bg-white/5 text-slate-500 cursor-not-allowed' : `${theme.button} text-white`}`}>
                         {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"/> : <Play className="w-5 h-5 fill-current"/>}
                       </button>
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
                     <div className="flex items-center gap-2">
                       <button onClick={() => setUseStreaming(!useStreaming)} className={`text-xs px-2 py-1 rounded border ${useStreaming ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>{useStreaming ? 'Streaming: ON' : 'Streaming: OFF'}</button>
                       <button onClick={() => setIsEditorOpen(!isEditorOpen)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${isEditorOpen ? `${theme.accentBg} ${theme.accent} border-${theme.accent}/20` : `${theme.bgApp} border-${theme.border} ${theme.textMuted}`}`}><Code2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{isEditorOpen ? 'Hide Code' : 'View Code'}</span></button>
                     </div>
                  </div>
             )}

             <div ref={chatContainerRef} className="flex-grow overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
                {activeSession.messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-40 text-center p-8">
                        <Sparkles className="w-12 h-12 mb-4 text-yellow-500"/>
                        <p>Start a conversation, ask for fixes, or create new features.</p>
                        <p className="text-sm mt-2 opacity-70">Teach me your preferences and I'll remember them across sessions!</p>
                    </div>
                )}
                {activeSession.messages.map((msg, idx) => (
                    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} group relative`}>
                        <div className={`max-w-[90%] lg:max-w-[85%] rounded-2xl px-5 py-4 shadow-sm ${msg.role === 'user' ? `${theme.accentBg} border border-${theme.accent}/20 rounded-tr-none` : `${theme.bgPanel} border ${theme.border} rounded-tl-none`}`}>
                            {msg.role === 'user' ? (
                                <div className="space-y-2 relative group">
                                    {msg.attachments?.map((att, i) => (
                                      <div key={i} className="mb-2 rounded overflow-hidden border border-white/10">
                                        {att.type === 'image' ? (
                                          <img src={`data:${att.mimeType};base64,${att.content}`} className="max-h-48 object-cover" alt="Attachment" />
                                        ) : att.type === 'audio' ? (
                                          <div className="p-2 flex items-center gap-2 bg-white/5">
                                            <Mic className="w-4 h-4"/> Audio Clip
                                          </div>
                                        ) : null}
                                      </div>
                                    ))}
                                    <p className={`whitespace-pre-wrap text-sm ${theme.textMain}`}>{msg.content}</p>
                                    {msg.isEdited && (
                                      <span className="text-[10px] opacity-60 absolute -bottom-5 right-0">edited</span>
                                    )}
                                    {/* Edit Pencil Button */}
                                    <button 
                                      onClick={() => {
                                        const newText = prompt("Edit your message:", msg.content);
                                        if (newText !== null && newText !== msg.content) {
                                          handleEditMessage(msg.id, newText);
                                        }
                                      }}
                                      className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-all duration-200"
                                      title="Edit message"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                              <MarkdownRenderer content={msg.content} theme={theme} />
                            )}
                        </div>

                        {/* Retry Button for the last AI message */}
                        {msg.role === 'model' && idx === activeSession.messages.length - 1 && !isLoading && (
                          <div className="mt-1 flex gap-2">
                             <button onClick={handleRetry} className="text-[10px] flex items-center gap-1 opacity-50 hover:opacity-100 hover:text-white transition-opacity">
                                <RefreshCw className="w-3 h-3" /> Retry
                             </button>
                          </div>
                        )}
                    </div>
                ))}

                {/* --- PROCESS LOG INDICATOR --- */}
                {(isLoading || streamingMessageId) && (
                    <div className="flex flex-col items-start w-full max-w-[90%] lg:max-w-[85%]">
                        <ProcessLog steps={processSteps} isComplete={isProcessComplete} theme={theme} />
                        {streamingContent && (
                            <div className={`rounded-2xl px-5 py-4 shadow-sm ${theme.bgPanel} border ${theme.border} rounded-tl-none w-full`}>
                                <StreamingMessage content={streamingContent} theme={theme} />
                            </div>
                        )}
                    </div>
                )}

                {error && (
                  <div className="w-full flex flex-col items-center gap-2">
                    <div className="bg-red-500/10 text-red-400 px-4 py-2 rounded-lg text-sm border border-red-500/20">{error}</div>
                    <button onClick={handleRetry} className={`text-xs flex items-center gap-1 ${theme.textMain} hover:underline`}><RefreshCw className="w-3 h-3"/> Retry Request</button>
                  </div>
                )}
             </div>

             {/* PENDING DIFFS OVERLAY */}
             {pendingDiffs.length > 0 && (
                 <div className={`absolute bottom-20 left-4 right-4 z-20 ${theme.bgPanel} border ${theme.border} rounded-xl shadow-2xl flex flex-col max-h-[60%]`}>
                     <div className={`p-3 border-b ${theme.border} flex justify-between items-center ${theme.bgPanelHeader}`}>
                         <span className="text-xs font-bold uppercase flex items-center gap-2"><GitCompare className="w-4 h-4 text-blue-400"/> Review Proposed Changes ({pendingDiffs.length})</span>
                         <span className={`text-[10px] ${theme.textMuted}`}>{pendingDiffs[0].fileName}</span>
                     </div>
                     <div className="flex-1 overflow-hidden p-2 bg-black/50"><DiffViewer original={pendingDiffs[0].originalContent} modified={pendingDiffs[0].newContent} theme={theme} /></div>
                     <div className="p-3 border-t border-white/5 flex justify-end gap-2">
                         <button onClick={() => setPendingDiffs(prev => prev.filter(d => d.id !== pendingDiffs[0].id))} className="px-4 py-2 rounded-lg text-xs font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20">Reject</button>
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
                             {att.type === 'image' ? (
                               <img src={`data:${att.mimeType};base64,${att.content}`} className="h-16 w-16 object-cover rounded border border-white/20" alt="Attachment" />
                             ) : att.type === 'audio' ? (
                               <div className="h-16 w-16 flex items-center justify-center bg-white/10 rounded border border-white/20">
                                 <Mic className="w-6 h-6"/>
                               </div>
                             ) : null}
                             <button 
                               onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))} 
                               className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                             >
                               <X className="w-3 h-3"/>
                             </button>
                           </div>
                         ))}
                       </div>
                     )}
                     <div className="flex gap-2 mb-2 overflow-x-auto pb-1 no-scrollbar">
                        <button onClick={() => updateSession({ mode: 'FIX' })} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${activeSession.mode === 'FIX' ? `${theme.button} border-transparent text-white` : `border-${theme.border} ${theme.textMuted}`}`}><Wrench className="w-3 h-3"/> Fix</button>
                        <button onClick={() => updateSession({ mode: 'EXPLAIN' })} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${activeSession.mode === 'EXPLAIN' ? `${theme.button} border-transparent text-white` : `border-${theme.border} ${theme.textMuted}`}`}><BookOpen className="w-3 h-3"/> Explain</button>
                        <button onClick={() => setUseInternet(!useInternet)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${useInternet ? `bg-blue-600 border-transparent text-white` : `border-${theme.border} ${theme.textMuted}`}`}><Globe className="w-3 h-3"/> Internet</button>
                         {/* COMPRESSION BUTTON */}
                         <button 
                          onClick={() => setUseCompression(!useCompression)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${useCompression ? 'bg-purple-600 border-transparent text-white' : `border-${theme.border} ${theme.textMuted}`}`}
                          title="Context Compression"
                        >
                          <Zap className="w-3 h-3" /> Compress
                        </button>
                        {isLoading && (
                          <button onClick={stopStreaming} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 bg-red-600 border-transparent text-white`}>
                            <StopCircle className="w-3 h-3"/> Stop
                          </button>
                        )}
                     </div>
                     <div className="relative flex items-end gap-2">
                        {/* Photo, File, and Microphone buttons for chat mode */}
                        <div className="flex flex-col gap-1 absolute left-2 bottom-3 z-10">
                            <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                            <button onClick={() => imageInputRef.current?.click()} className={`${theme.textMuted} hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors`} title="Upload image">
                              <ImageIcon className="w-4 h-4" />
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.js,.ts,.jsx,.tsx,.html,.css,.py,.java,.json" className="hidden" />
                            <button onClick={() => fileInputRef.current?.click()} className={`${theme.textMuted} hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors`} title="Upload code file">
                              <Code2 className="w-4 h-4" />
                            </button>
                            <button onClick={toggleRecording} className={`${isRecording ? 'text-red-500 animate-pulse' : theme.textMuted} hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors`} title="Record audio">
                              <Mic className="w-4 h-4" />
                            </button>
                        </div>
                        <textarea 
                          value={inputInstruction} 
                          onChange={(e) => setInputInstruction(e.target.value)} 
                          onKeyDown={(e) => { 
                            if (e.key === 'Enter' && !e.shiftKey) { 
                              e.preventDefault(); 
                              handleSendMessage(); 
                            } 
                          }} 
                          placeholder="Message..." 
                          className={`w-full ${theme.bgApp} border ${theme.border} rounded-xl pl-12 px-4 py-3 text-sm outline-none resize-none max-h-32 custom-scrollbar shadow-inner`} 
                          rows={1} 
                          style={{minHeight: '46px'}} 
                        />
                        <button 
                          onClick={handleSendMessage} 
                          disabled={isLoading} 
                          className={`p-3 rounded-xl flex-shrink-0 transition-all ${isLoading ? 'bg-white/5 text-slate-500 cursor-not-allowed' : `${theme.button} ${theme.buttonHover} text-white shadow-lg`}`}
                        >
                          <Send className="w-5 h-5" />
                        </button>
                     </div>
                 </div>
             )}
          </div>
        </div>
      </div>

      {/* TERMINAL OVERLAY */}
      <Terminal 
        files={activeProject.files}
        theme={theme}
        onAIHelpRequest={handleTerminalError}
      />

      {showSettings && (
        <SettingsModal 
          theme={theme} 
          themeName={themeName} 
          setThemeName={setThemeName} 
          viewMode={viewMode} 
          setViewMode={setViewMode} 
          highCapacity={highCapacity} 
          setHighCapacity={setHighCapacity} 
          llmConfig={llmConfig} 
          setLlmConfig={setLlmConfig} 
          roles={roles} 
          setRoles={setRoles} 
          useStreaming={useStreaming} 
          setUseStreaming={setUseStreaming} 
          onClose={() => setShowSettings(false)} 
        />
      )}
    </div>
  );
};

export default App;