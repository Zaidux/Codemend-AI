import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Sparkles, Play, Wrench, X, Settings, Send, Sidebar as SidebarIcon, Code2, ArrowLeft, Eye, Image as ImageIcon, Mic, StopCircle, BookOpen, Globe, Brain, ListTodo, GitCompare, Plus, Zap, RefreshCw, Pencil, AlertTriangle, Terminal as TerminalIcon } from 'lucide-react';

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
import { ToolsManagementModal } from './components/ToolsManagementModal';
import { GitTracker } from './components/GitTracker'; 
import { CommandPalette } from './components/CommandPalette'; 
import { SnippetsLibrary } from './components/SnippetsLibrary';
import { GitHubAuthModal } from './components/GitHubAuthModal'; 
import { MultiDiffViewer } from './components/MultiDiffViewer';
import { PlannerRoom } from './components/PlannerRoom';
import { TaskApprovalModal } from './components/TaskApprovalModal';
import { ErrorAnalysisPanel } from './components/ErrorAnalysisPanel';

import { THEMES, DEFAULT_LLM_CONFIG, DEFAULT_ROLES } from './constants';
import { GitHubService, parseGitHubUrl, GitHubFile } from './services/githubApiService';
import { CodeLanguage, AppMode, ThemeType, Session, ChatMessage, ViewMode, ProjectFile, LLMConfig, Project, Attachment, AgentRole, KnowledgeEntry, TodoItem, FileDiff, ProjectSummary, DelegatedTask, PlannerKnowledge } from './types';
import { fixCodeWithGemini, streamFixCodeWithGemini } from './services/llmService';
import { fetchRepoContents } from './services/githubService';
import { contextService } from './services/contextService';
import { modelSwitchService } from './services/modelSwitchService';
import { KnowledgeManager } from './services/llmTools';
import { GitService } from './services/gitService';
import { errorDetectionService } from './services/errorDetectionService';

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
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showGitTracker, setShowGitTracker] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [showGitHubAuth, setShowGitHubAuth] = useState(false);
  const [showMultiDiff, setShowMultiDiff] = useState(false);
  const [multiDiffChanges, setMultiDiffChanges] = useState<FileDiff[]>([]);
  const [showPlannerRoom, setShowPlannerRoom] = useState(false);
  const [showErrorAnalysis, setShowErrorAnalysis] = useState(false);
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

  const [plannerSessions, setPlannerSessions] = useState<Session[]>(() => {
      const saved = localStorage.getItem('cm_planner_sessions');
      if (saved) return JSON.parse(saved);
      return [];
  });

  const [delegatedTasks, setDelegatedTasks] = useState<DelegatedTask[]>(() => {
      const saved = localStorage.getItem('cm_delegated_tasks');
      if (saved) return JSON.parse(saved);
      return [];
  });

  const [plannerKnowledge, setPlannerKnowledge] = useState<Record<string, PlannerKnowledge>>(() => {
      const saved = localStorage.getItem('cm_planner_knowledge');
      return saved ? JSON.parse(saved) : {};
  });

  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeEntry[]>(() => {
      const saved = localStorage.getItem('cm_knowledge_enhanced');
      return saved ? JSON.parse(saved) : [];
  });

  const [currentProjectId, setCurrentProjectId] = useState<string>(() => projects[0]?.id || '');
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [currentPlannerSessionId, setCurrentPlannerSessionId] = useState<string>('');
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
  const activePlannerSession = plannerSessions.find(s => s.id === currentPlannerSessionId) || {
      id: 'temp_planner', projectId: activeProject.id, title: 'Planner Session', messages: [], lastModified: Date.now(), mode: 'CHAT' as AppMode, type: 'planner' as const
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
  const terminalRef = useRef<{ openTerminal: () => void } | null>(null);
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
  useEffect(() => { localStorage.setItem('cm_planner_sessions', JSON.stringify(plannerSessions)); }, [plannerSessions]);
  useEffect(() => { localStorage.setItem('cm_delegated_tasks', JSON.stringify(delegatedTasks)); }, [delegatedTasks]);
  useEffect(() => { localStorage.setItem('cm_planner_knowledge', JSON.stringify(plannerKnowledge)); }, [plannerKnowledge]);
  useEffect(() => { localStorage.setItem('cm_knowledge_enhanced', JSON.stringify(knowledgeBase)); }, [knowledgeBase]);
  useEffect(() => { localStorage.setItem('cm_use_streaming', String(useStreaming)); }, [useStreaming]);
  useEffect(() => { localStorage.setItem('cm_project_summaries', JSON.stringify(projectSummaries)); }, [projectSummaries]);
  useEffect(() => { localStorage.setItem('cm_use_compression', String(useCompression)); }, [useCompression]);

  // Initialize Git for all projects
  useEffect(() => {
    const initGitForProjects = async () => {
      const gitService = GitService.getInstance();
      for (const project of projects) {
        await gitService.init(project.id, {
          remoteUrl: project.githubUrl,
          branch: 'main',
          userName: 'Codemend User',
          userEmail: 'user@codemend.ai'
        });
      }
    };
    if (projects.length > 0) {
      initGitForProjects();
    }
  }, [projects.length]); // Only run when project count changes

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

  // Command Palette keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      if (e.key === 'Escape' && showCommandPalette) {
        setShowCommandPalette(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCommandPalette]);

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

  // Generate AI-powered session title
  const generateSessionTitle = async (firstMessage: string) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${llmConfig.gemini?.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Generate a concise 3-5 word title for this conversation:\n\n"${firstMessage.slice(0, 200)}"\n\nRespond ONLY with the title, no quotes or extra text.` }]
          }]
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || firstMessage.slice(0, 30);
        updateSession({ title: title.replace(/^["']|["']$/g, '') });
      }
    } catch (e) {
      console.warn('Failed to generate AI title:', e);
    }
  };

  // --- HELPER FUNCTIONS ---

  const getLanguageFromExtension = (ext: string): CodeLanguage => {
    const extMap: Record<string, CodeLanguage> = {
      'js': CodeLanguage.JAVASCRIPT,
      'jsx': CodeLanguage.JAVASCRIPT,
      'ts': CodeLanguage.TYPESCRIPT,
      'tsx': CodeLanguage.TYPESCRIPT,
      'py': CodeLanguage.PYTHON,
      'html': CodeLanguage.HTML,
      'css': CodeLanguage.CSS,
      'json': CodeLanguage.JSON,
      'md': CodeLanguage.MARKDOWN,
    };
    return extMap[ext.toLowerCase()] || CodeLanguage.JAVASCRIPT;
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
      title: activeSession.messages.length === 0 ? 'New Chat...' : activeSession.title 
    });

    setInputInstruction('');
    setAttachments([]);
    triggerAIResponse(newMessages);
    
    // Generate AI title for first message in background
    if (activeSession.messages.length === 0 && promptText) {
      generateSessionTitle(promptText);
    }
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
        onProposedChanges: (changes) => {
          if (changes.length > 1) {
            // Multiple changes - use MultiDiffViewer
            setMultiDiffChanges(changes);
            setShowMultiDiff(true);
          } else {
            // Single change - use existing single diff overlay
            setPendingDiffs(prev => [...prev, ...changes]);
          }
        },
        onComplete: (fullResponse) => {
          setIsProcessComplete(true);
          const aiMsg: ChatMessage = {
            id: streamingMsgId, role: 'model', content: fullResponse, timestamp: Date.now()
          };
          updateSession({ messages: [...history, aiMsg] });
          
          // Detect errors in AI response (Phase 7)
          const detectedError = errorDetectionService.detectFromMessage(
            aiMsg,
            activeSession.id
          );
          if (detectedError) {
            console.warn('Error detected in AI response:', detectedError);
          }
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
    let newDelegatedTasks = [...delegatedTasks];

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
      } else if (call.name === 'create_todo' && call.metadata) {
        // Planner created a todo
        const { todoId, title, description, priority, estimatedTime, phase, requirements, status } = call.metadata;
        newTodos.push({
          id: todoId,
          task: title,
          phase: phase || 'Planner',
          status: status || 'pending'
        });
        // Track in knowledge graph
        if (currentPlannerSessionId) {
          getOrCreateKnowledgeEntry(currentPlannerSessionId, activeProject.id);
          addDecisionToKnowledge(
            currentPlannerSessionId,
            `Created todo: ${title}`,
            `Priority: ${priority}, Phase: ${phase || 'Planner'}`,
            []
          );
        }
      } else if (call.name === 'update_todo_status' && call.metadata) {
        // Planner updated a todo
        const { todoId, status, completionPercentage } = call.metadata;
        newTodos = newTodos.map(t => 
          t.id === todoId 
            ? { ...t, status: status || t.status } 
            : t
        );
      } else if (call.name === 'delegate_task' && call.metadata) {
        // Planner delegated a task
        const { taskId, title, description, requirements, priority, estimatedTime, targetProject, filesToModify, dependencies } = call.metadata;
        const newTask: DelegatedTask = {
          id: taskId,
          plannerSessionId: currentPlannerSessionId,
          title,
          description,
          requirements: requirements || [],
          estimatedTime,
          priority,
          status: 'pending_approval',
          targetProjectId: targetProject === 'new' ? undefined : activeProject.id,
          filesToModify,
          createdAt: Date.now()
        };
        newDelegatedTasks.push(newTask);
        
        // Track delegation in knowledge graph
        if (currentPlannerSessionId) {
          getOrCreateKnowledgeEntry(currentPlannerSessionId, activeProject.id);
          addDecisionToKnowledge(
            currentPlannerSessionId,
            `Delegated task: ${title}`,
            `Priority: ${priority}, Estimated: ${estimatedTime}, Files: ${filesToModify?.length || 0}`,
            filesToModify
          );
          setPlannerKnowledge(prev => {
            const current = prev[currentPlannerSessionId];
            if (!current) return prev;
            return {
              ...prev,
              [currentPlannerSessionId]: {
                ...current,
                delegationHistory: [
                  ...current.delegationHistory,
                  {
                    taskId,
                    title,
                    status: 'pending_approval',
                    timestamp: Date.now()
                  }
                ],
                lastUpdated: Date.now()
              }
            };
          });
        }
      } else if (call.name === 'read_file' && call.args?.fileName && currentPlannerSessionId) {
        // Track file analysis
        trackFileAnalysis(currentPlannerSessionId, call.args.fileName);
      } else if (call.name === 'verify_implementation' && call.metadata && currentPlannerSessionId) {
        // Track verification
        setPlannerKnowledge(prev => {
          const current = prev[currentPlannerSessionId];
          if (!current) return prev;
          return {
            ...prev,
            [currentPlannerSessionId]: {
              ...current,
              verificationsPerformed: current.verificationsPerformed + 1,
              lastUpdated: Date.now()
            }
          };
        });
      }
    });

    if (newKnowledge.length > knowledgeBase.length) {
      setKnowledgeBase(newKnowledge);
    }
    if (JSON.stringify(newTodos) !== JSON.stringify(todoList)) {
      setTodoList(newTodos);
      setLeftPanelTab('todos');
    }
    if (newDelegatedTasks.length > delegatedTasks.length) {
      setDelegatedTasks(newDelegatedTasks);
    }
  };

  const processAIResponse = (response: any, history: ChatMessage[]) => {
    if (response.toolCalls) processToolCalls(response.toolCalls);
    if (response.proposedChanges) {
      if (response.proposedChanges.length > 1) {
        setMultiDiffChanges(response.proposedChanges);
        setShowMultiDiff(true);
      } else {
        setPendingDiffs(prev => [...prev, ...response.proposedChanges!]);
      }
    }
    const aiMsg: ChatMessage = { id: crypto.randomUUID(), role: 'model', content: response.response, timestamp: Date.now() };
    updateSession({ messages: [...history, aiMsg] });

    // Detect errors in AI response (Phase 7)
    const detectedError = errorDetectionService.detectFromMessage(
      aiMsg,
      activeSession.id
    );
    if (detectedError) {
      console.warn('Error detected in AI response:', detectedError);
    }

    // Auto-verification for delegated tasks (Phase 5)
    checkDelegatedTaskCompletion(aiMsg);
  };

  const checkDelegatedTaskCompletion = async (aiMsg: ChatMessage) => {
    // Check if this is a delegated task session
    if (activeSession.type !== 'delegated' || !activeSession.plannerSessionId) return;

    // Find the associated delegated task
    const task = delegatedTasks.find(t => t.codingSessionId === activeSession.id && t.status === 'in_progress');
    if (!task) return;

    // Check for completion signals in AI response
    const content = aiMsg.content.toLowerCase();
    const completionSignals = [
      'implementation complete',
      'task completed',
      'finished implementing',
      'successfully implemented',
      'all requirements met',
      'done',
      'completed successfully'
    ];

    const hasCompletionSignal = completionSignals.some(signal => content.includes(signal));
    
    // Also check if there are proposed changes (file modifications)
    const hasFileChanges = pendingDiffs.length > 0 || multiDiffChanges.length > 0;

    // Trigger verification if we have completion signals or file changes
    if (hasCompletionSignal || hasFileChanges) {
      await performAutoVerification(task);
    }
  };

  const performAutoVerification = async (task: DelegatedTask) => {
    // Update task status to 'verifying'
    setDelegatedTasks(prev =>
      prev.map(t => t.id === task.id ? { ...t, status: 'verifying' } : t)
    );

    // Get files to verify (either from task.filesToModify or recent diffs)
    const filesToVerify = task.filesToModify && task.filesToModify.length > 0
      ? task.filesToModify
      : [...new Set([...pendingDiffs.map(d => d.fileName), ...multiDiffChanges.map(d => d.fileName)])];

    if (filesToVerify.length === 0) {
      // No files to verify, mark as completed
      completeTask(task, true, 100, []);
      return;
    }

    // Perform verification on each file
    const verificationResults = [];
    for (const filePath of filesToVerify) {
      const file = activeProject.files.find(f => f.name === filePath);
      if (!file) continue;

      // Dual verification: regex + semantic
      const result = await verifyFileImplementation(file, task.requirements);
      verificationResults.push(result);
    }

    // Calculate overall completeness
    const avgCompleteness = verificationResults.length > 0
      ? verificationResults.reduce((sum, r) => sum + r.completeness, 0) / verificationResults.length
      : 0;

    const allPassed = verificationResults.every(r => r.passed);

    // Update task with verification results
    completeTask(task, allPassed, avgCompleteness, verificationResults);
  };

  const verifyFileImplementation = async (file: ProjectFile, requirements: string[]): Promise<VerificationResult> => {
    const content = file.content.toLowerCase();
    const results: string[] = [];
    let passedCount = 0;
    let failedCount = 0;

    // Semantic verification: Check requirements keywords
    requirements.forEach((req: string) => {
      const keywords = req.toLowerCase().split(' ').filter(w => w.length > 3);
      const foundKeywords = keywords.filter(kw => content.includes(kw));
      const matchPercentage = keywords.length > 0 ? (foundKeywords.length / keywords.length) * 100 : 0;
      
      if (matchPercentage >= 70) {
        results.push(`✅ ${req} (${Math.round(matchPercentage)}% match)`);
        passedCount++;
      } else {
        results.push(`⚠️ ${req} (${Math.round(matchPercentage)}% match - needs review)`);
        failedCount++;
      }
    });

    const completeness = passedCount > 0 ? Math.round((passedCount / (passedCount + failedCount)) * 100) : 0;
    const passed = completeness >= 80;

    return {
      timestamp: Date.now(),
      method: 'semantic',
      passed,
      completeness,
      issues: results.filter(r => r.startsWith('⚠️')),
      recommendations: passed ? [] : ['Review implementation against failed requirements', 'Consider requesting planner guidance'],
      verifiedFiles: [file.name]
    };
  };

  const completeTask = (task: DelegatedTask, passed: boolean, completeness: number, verificationResults: VerificationResult[]) => {
    const status = passed ? 'completed' : 'failed';
    
    // Update delegated task
    setDelegatedTasks(prev =>
      prev.map(t => t.id === task.id
        ? {
            ...t,
            status,
            completedAt: Date.now(),
            verificationResults
          }
        : t
      )
    );

    // Notify planner session with verification results
    notifyPlannerOfCompletion(task, passed, completeness, verificationResults);

    // Update related todos
    if (task.todoIds && task.todoIds.length > 0) {
      setTodoList(prev =>
        prev.map(todo =>
          task.todoIds!.includes(todo.id)
            ? { ...todo, status: passed ? 'completed' : 'in_progress' }
            : todo
        )
      );
    }
  };

  const notifyPlannerOfCompletion = (task: DelegatedTask, passed: boolean, completeness: number, verificationResults: VerificationResult[]) => {
    if (!task.plannerSessionId) return;

    // Create notification message for planner
    const statusEmoji = passed ? '✅' : '❌';
    const issuesSummary = verificationResults
      .flatMap(r => r.issues)
      .slice(0, 5)
      .map(issue => `  - ${issue}`)
      .join('\n');

    const notificationContent = `
${statusEmoji} **Task ${passed ? 'Completed' : 'Failed'}: ${task.title}**

**Completeness:** ${completeness}%
**Status:** ${task.status}
**Verified Files:** ${verificationResults.flatMap(r => r.verifiedFiles).join(', ')}

${!passed && issuesSummary ? `**Issues Found:**\n${issuesSummary}\n` : ''}
${passed ? '**All requirements verified successfully!**' : '**Some requirements need attention.**'}

You can review the implementation in the coding session.
    `.trim();

    const notificationMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'model',
      content: notificationContent,
      timestamp: Date.now()
    };

    // Add notification to planner session
    setPlannerSessions(prev =>
      prev.map(s => s.id === task.plannerSessionId
        ? { ...s, messages: [...s.messages, notificationMsg], lastModified: Date.now() }
        : s
      )
    );
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

  // --- PLANNER ROOM HANDLERS ---

  const handlePlannerMessage = async (message: string, attachments?: Attachment[]) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
      attachments
    };

    const newMessages = [...activePlannerSession.messages, userMsg];
    updatePlannerSession({ 
      messages: newMessages,
      title: activePlannerSession.messages.length === 0 ? 'Planning Session...' : activePlannerSession.title 
    });

    setIsLoading(true);
    setError('');
    setProcessSteps([]);
    setIsProcessComplete(false);

    try {
      // Get planner role
      const plannerRole = roles.find(r => r.id === llmConfig.plannerRoleId) || roles.find(r => r.id === 'role_architect');
      
      if (useStreaming) {
        const streamingMsgId = crypto.randomUUID();
        const streamingMsg: ChatMessage = {
          id: streamingMsgId, role: 'model', content: '', timestamp: Date.now()
        };
        updatePlannerSession({ messages: [...newMessages, streamingMsg] });

        await streamFixCodeWithGemini({
          llmConfig,
          history: newMessages,
          currentMessage: message,
          activeFile,
          allFiles: activeProject.files,
          mode: 'CHAT',
          attachments,
          useHighCapacity: highCapacity,
          roles,
          knowledgeBase,
          useInternet,
          currentTodos: todoList
        }, {
          onToken: (token) => {
            updatePlannerSession({
              messages: newMessages.concat([{
                ...streamingMsg,
                content: streamingMsg.content + token
              }])
            });
          },
          onToolCall: (toolCall) => {
            setProcessSteps(prev => [...prev, `🔧 ${toolCall.name}: ${toolCall.description || 'Processing...'}`]);
          },
          onToolCalls: (toolCalls) => processToolCalls(toolCalls),
          onProposedChanges: (changes) => {
            // Planner shouldn't directly propose code changes
            // Instead, this would be handled through task delegation
          },
          onComplete: (fullResponse) => {
            setIsProcessComplete(true);
            const aiMsg: ChatMessage = {
              id: streamingMsgId, role: 'model', content: fullResponse, timestamp: Date.now()
            };
            updatePlannerSession({ messages: [...newMessages, aiMsg] });
          },
          onError: (errMsg) => {
            setError(errMsg);
            updatePlannerSession({ messages: newMessages });
          }
        });
      } else {
        // Non-streaming
        const response = await fixCodeWithGemini({
          llmConfig,
          history: newMessages,
          currentMessage: message,
          activeFile,
          allFiles: activeProject.files,
          mode: 'CHAT',
          attachments,
          useHighCapacity: highCapacity,
          roles,
          knowledgeBase,
          useInternet,
          currentTodos: todoList
        });

        if (response.toolCalls) processToolCalls(response.toolCalls);
        
        const aiMsg: ChatMessage = { 
          id: crypto.randomUUID(), 
          role: 'model', 
          content: response.response, 
          timestamp: Date.now() 
        };
        updatePlannerSession({ messages: [...newMessages, aiMsg] });
      }

      // Generate title for first message
      if (activePlannerSession.messages.length === 0 && message) {
        generatePlannerSessionTitle(message);
      }
    } catch (err: any) {
      console.error('Planner error:', err);
      setError(err.message || 'Failed to get planner response');
    } finally {
      setIsLoading(false);
    }
  };

  const updatePlannerSession = (updates: Partial<Session>) => {
    if (activePlannerSession.id === 'temp_planner') {
      const newSession: Session = {
        ...activePlannerSession,
        ...updates,
        id: crypto.randomUUID(),
        type: 'planner',
        createdAt: Date.now(),
        lastModified: Date.now()
      };
      setPlannerSessions(prev => [...prev, newSession]);
      setCurrentPlannerSessionId(newSession.id);
      // Initialize knowledge graph for new planner session
      getOrCreateKnowledgeEntry(newSession.id, activeProject.id);
    } else {
      setPlannerSessions(prev => 
        prev.map(s => s.id === activePlannerSession.id 
          ? { ...s, ...updates, lastModified: Date.now() }
          : s
        )
      );
    }
  };

  const generatePlannerSessionTitle = async (firstMessage: string) => {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${llmConfig.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Generate a concise 3-5 word title for this planning session:\n\n"${firstMessage.slice(0, 200)}"\n\nRespond ONLY with the title, no quotes or extra text.` }]
          }]
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || firstMessage.slice(0, 30);
        updatePlannerSession({ title: title.replace(/^["']|["']$/g, '') });
      }
    } catch (e) {
      console.warn('Failed to generate planner title:', e);
    }
  };

  const handleDelegateTask = (task: DelegatedTask) => {
    setDelegatedTasks(prev => [...prev, task]);
  };

  // Get the first pending approval task
  const pendingApprovalTask = delegatedTasks.find(t => t.status === 'pending_approval');

  const handleApproveTask = (task: DelegatedTask) => {
    // Update task status to approved
    setDelegatedTasks(prev =>
      prev.map(t => t.id === task.id ? { ...t, status: 'approved', startedAt: Date.now() } : t)
    );

    // Create or find target project
    let targetProject = activeProject;
    if (task.targetProjectId && task.targetProjectId !== 'new') {
      const foundProject = projects.find(p => p.name === task.targetProjectId || p.id === task.targetProjectId);
      if (foundProject) {
        targetProject = foundProject;
        setCurrentProjectId(foundProject.id);
      }
    } else if (task.targetProjectId === 'new') {
      // Create new project
      const newProj = createNewProject();
      newProj.name = task.title.slice(0, 30); // Use task title as project name
      setProjects(prev => [...prev, newProj]);
      setCurrentProjectId(newProj.id);
      targetProject = newProj;
    }

    // Create new coding session for this task
    const newSession = createNewSession(targetProject.id);
    newSession.title = task.title;
    newSession.type = 'delegated';
    newSession.plannerSessionId = task.plannerSessionId;
    
    // Create initial message with full task context
    const taskMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `# Delegated Task from Planner\n\n## ${task.title}\n\n${task.description}\n\n### Requirements:\n${task.requirements.map(r => `- ${r}`).join('\n')}\n\n${task.filesToModify && task.filesToModify.length > 0 ? `### Files to Modify:\n${task.filesToModify.map(f => `- ${f}`).join('\n')}\n\n` : ''}${task.dependencies && task.dependencies.length > 0 ? `### Dependencies:\n${task.dependencies.map(d => `- ${d}`).join('\n')}\n\n` : ''}Please implement this task according to the requirements. Priority: ${task.priority.toUpperCase()}${task.estimatedTime ? ` | Estimated Time: ${task.estimatedTime}` : ''}`,
      timestamp: Date.now()
    };

    newSession.messages = [taskMessage];
    setSessions(prev => [...prev, newSession]);
    
    // Update task with coding session ID
    setDelegatedTasks(prev =>
      prev.map(t => t.id === task.id ? { ...t, codingSessionId: newSession.id, status: 'in_progress' } : t)
    );

    // Link sessions in knowledge graph
    linkSessions(task.plannerSessionId, newSession.id);

    // Update planner session with delegation reference
    setPlannerSessions(prev =>
      prev.map(s => s.id === task.plannerSessionId
        ? { 
            ...s, 
            delegatedTaskIds: [...(s.delegatedTaskIds || []), task.id]
          }
        : s
      )
    );

    // Switch to coding session
    setCurrentSessionId(newSession.id);
    setShowPlannerRoom(false);

    // Auto-send the task to the AI
    handleSendMessage('', [], newSession.id);
  };

  const handleEditTask = (task: DelegatedTask, feedback: string) => {
    // Remove task from delegated tasks (or mark as rejected)
    setDelegatedTasks(prev => prev.filter(t => t.id !== task.id));

    // Switch to planner room
    setShowPlannerRoom(true);

    // Find or create planner session
    let plannerSession = plannerSessions.find(s => s.id === task.plannerSessionId);
    if (!plannerSession) {
      plannerSession = createNewSession('');
      plannerSession.type = 'planner';
      plannerSession.title = 'Planning Session';
      setPlannerSessions(prev => [...prev, plannerSession!]);
      setCurrentPlannerSessionId(plannerSession.id);
    } else {
      setCurrentPlannerSessionId(plannerSession.id);
    }

    // Add feedback message to planner session
    const feedbackMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `I've reviewed the delegated task "${task.title}" and have some feedback:\n\n${feedback}\n\nPlease revise the plan accordingly.`,
      timestamp: Date.now()
    };

    setPlannerSessions(prev =>
      prev.map(s => s.id === plannerSession!.id
        ? { ...s, messages: [...s.messages, feedbackMessage], lastModified: Date.now() }
        : s
      )
    );

    // Auto-send to planner AI
    handlePlannerMessage(feedbackMessage.content, [], plannerSession.id);
  };

  const handleCancelTask = (taskId: string) => {
    setDelegatedTasks(prev => prev.filter(t => t.id !== taskId));
  };

  // --- KNOWLEDGE GRAPH FUNCTIONS ---

  /**
   * Initialize or get knowledge entry for a planner session
   */
  const getOrCreateKnowledgeEntry = (plannerSessionId: string, projectId: string): PlannerKnowledge => {
    if (plannerKnowledge[plannerSessionId]) {
      return plannerKnowledge[plannerSessionId];
    }

    const newKnowledge: PlannerKnowledge = {
      plannerSessionId,
      projectId,
      decisionsLog: [],
      delegationHistory: [],
      verificationsPerformed: 0,
      filesAnalyzed: [],
      insightsGenerated: [],
      relatedSessions: [],
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };

    setPlannerKnowledge(prev => ({ ...prev, [plannerSessionId]: newKnowledge }));
    return newKnowledge;
  };

  /**
   * Add a decision to the knowledge graph
   */
  const addDecisionToKnowledge = (
    plannerSessionId: string, 
    decision: string, 
    reasoning: string, 
    relatedFiles?: string[]
  ) => {
    setPlannerKnowledge(prev => {
      const current = prev[plannerSessionId];
      if (!current) return prev;

      return {
        ...prev,
        [plannerSessionId]: {
          ...current,
          decisionsLog: [
            ...current.decisionsLog,
            {
              decision,
              reasoning,
              timestamp: Date.now(),
              relatedFiles
            }
          ],
          lastUpdated: Date.now()
        }
      };
    });
  };

  /**
   * Add an insight to the knowledge graph
   */
  const addInsightToKnowledge = (
    plannerSessionId: string,
    insight: string,
    category: 'architecture' | 'performance' | 'security' | 'best-practice' | 'bug' | 'optimization'
  ) => {
    setPlannerKnowledge(prev => {
      const current = prev[plannerSessionId];
      if (!current) return prev;

      return {
        ...prev,
        [plannerSessionId]: {
          ...current,
          insightsGenerated: [
            ...current.insightsGenerated,
            {
              insight,
              category,
              timestamp: Date.now()
            }
          ],
          lastUpdated: Date.now()
        }
      };
    });
  };

  /**
   * Track file analysis in knowledge graph
   */
  const trackFileAnalysis = (plannerSessionId: string, fileName: string) => {
    setPlannerKnowledge(prev => {
      const current = prev[plannerSessionId];
      if (!current) return prev;

      if (current.filesAnalyzed.includes(fileName)) return prev;

      return {
        ...prev,
        [plannerSessionId]: {
          ...current,
          filesAnalyzed: [...current.filesAnalyzed, fileName],
          lastUpdated: Date.now()
        }
      };
    });
  };

  /**
   * Link related sessions in knowledge graph
   */
  const linkSessions = (plannerSessionId: string, relatedSessionId: string) => {
    setPlannerKnowledge(prev => {
      const current = prev[plannerSessionId];
      if (!current) return prev;

      if (current.relatedSessions.includes(relatedSessionId)) return prev;

      return {
        ...prev,
        [plannerSessionId]: {
          ...current,
          relatedSessions: [...current.relatedSessions, relatedSessionId],
          lastUpdated: Date.now()
        }
      };
    });
  };

  /**
   * Search planner sessions by content, tags, or date range
   */
  const searchPlannerSessions = (
    query: string,
    options?: {
      tags?: string[];
      dateFrom?: number;
      dateTo?: number;
      projectId?: string;
    }
  ): Session[] => {
    const lowerQuery = query.toLowerCase();

    return plannerSessions.filter(session => {
      // Text search in title and messages
      const textMatch = !query || 
        session.title.toLowerCase().includes(lowerQuery) ||
        session.messages.some(m => m.content.toLowerCase().includes(lowerQuery));

      // Tag filter
      const tagMatch = !options?.tags || 
        options.tags.some(tag => session.tags?.includes(tag));

      // Date range filter
      const dateMatch = (!options?.dateFrom || session.createdAt! >= options.dateFrom) &&
                       (!options?.dateTo || session.createdAt! <= options.dateTo);

      // Project filter
      const projectMatch = !options?.projectId || session.projectId === options.projectId;

      return textMatch && tagMatch && dateMatch && projectMatch;
    });
  };

  /**
   * Export planner session with full knowledge graph
   */
  const exportPlannerSession = (sessionId: string) => {
    const session = plannerSessions.find(s => s.id === sessionId);
    if (!session) return;

    const knowledge = plannerKnowledge[sessionId];
    const relatedTasks = delegatedTasks.filter(t => t.plannerSessionId === sessionId);
    const relatedCodingSessions = sessions.filter(s => s.plannerSessionId === sessionId);

    const exportData = {
      session,
      knowledge,
      delegatedTasks: relatedTasks,
      codingSessions: relatedCodingSessions,
      exportedAt: Date.now(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planner-session-${session.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Archive old planner sessions
   */
  const archivePlannerSession = (sessionId: string) => {
    setPlannerSessions(prev =>
      prev.map(s => s.id === sessionId ? { ...s, archived: true } : s)
    );
  };

  /**
   * Get planner session statistics
   */
  const getPlannerSessionStats = (sessionId: string) => {
    const session = plannerSessions.find(s => s.id === sessionId);
    const knowledge = plannerKnowledge[sessionId];
    const tasks = delegatedTasks.filter(t => t.plannerSessionId === sessionId);

    if (!session || !knowledge) return null;

    return {
      totalMessages: session.messages.length,
      decisionsLogged: knowledge.decisionsLog.length,
      tasksCreated: tasks.length,
      tasksCompleted: tasks.filter(t => t.status === 'completed').length,
      verificationsRun: knowledge.verificationsPerformed,
      filesAnalyzed: knowledge.filesAnalyzed.length,
      insightsGenerated: knowledge.insightsGenerated.length,
      duration: session.lastModified - (session.createdAt || session.lastModified)
    };
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
            setShowToolsModal={setShowToolsModal}
            setShowGitTracker={setShowGitTracker}
        />
      )}

      <div className="flex-grow flex flex-col min-w-0 h-full relative">
        <Header 
          theme={theme} 
          viewMode={viewMode} 
          onOpenSettings={() => setShowSettings(true)}
          onOpenGitHubAuth={() => setShowGitHubAuth(true)}
          isGitHubConnected={!!localStorage.getItem('gh_token')}
          onOpenPlannerRoom={() => setShowPlannerRoom(true)}
        />

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
                         className={`w-full ${theme.bgApp} border ${theme.border} rounded-xl pl-12 px-4 py-3 pr-16 text-sm outline-none resize-none`} 
                         rows={3} 
                         style={{minHeight: '80px'}}
                       />
                       {/* Photo and Microphone buttons for classic mode */}
                       <div className="flex flex-wrap gap-1 absolute left-2 top-2 z-10 max-w-[calc(100%-100px)]">
                         <input type="file" ref={imageInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                         <button onClick={() => imageInputRef.current?.click()} className={`${theme.textMuted} hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors`} title="Upload image"><ImageIcon className="w-4 h-4" /></button>
                         <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.js,.ts,.jsx,.tsx,.html,.css,.py,.java,.json" className="hidden" />
                         <button onClick={() => fileInputRef.current?.click()} className={`${theme.textMuted} hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors`} title="Upload code file"><Code2 className="w-4 h-4" /></button>
                         <button onClick={toggleRecording} className={`${isRecording ? 'text-red-500 animate-pulse' : theme.textMuted} hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors`} title="Record audio"><Mic className="w-4 h-4" /></button>
                         <button onClick={() => setShowSnippets(true)} className={`${theme.textMuted} hover:text-purple-400 p-1.5 rounded-full hover:bg-purple-500/10 transition-colors`} title="Code Snippets"><BookOpen className="w-4 h-4" /></button>
                         <button onClick={() => setShowToolsModal(true)} className={`${theme.textMuted} hover:text-blue-400 p-1.5 rounded-full hover:bg-blue-500/10 transition-colors`} title="Manage AI Tools"><Wrench className="w-4 h-4" /></button>
                         <button onClick={() => setShowGitTracker(true)} className={`${theme.textMuted} hover:text-green-400 p-1.5 rounded-full hover:bg-green-500/10 transition-colors`} title="Git Changes"><GitCompare className="w-4 h-4" /></button>
                         <button onClick={() => setShowErrorAnalysis(true)} className={`${theme.textMuted} hover:text-orange-400 p-1.5 rounded-full hover:bg-orange-500/10 transition-colors`} title="Error Analysis"><AlertTriangle className="w-4 h-4" /></button>
                       </div>
                       <button onClick={handleSendMessage} disabled={isLoading} className={`absolute right-2 bottom-2 p-2.5 rounded-lg transition-all ${isLoading ? 'bg-white/5 text-slate-500 cursor-not-allowed' : `${theme.button} ${theme.buttonHover} text-white shadow-lg`}`}>
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
                       <button onClick={() => terminalRef.current?.openTerminal()} className={`p-1.5 rounded-full hover:bg-white/10 transition-colors ${theme.textMuted} hover:text-white`} title="Open Terminal"><TerminalIcon className="w-4 h-4" /></button>
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
                              <div>
                                <MarkdownRenderer content={msg.content} theme={theme} />
                                {/* Show tool errors as copyable text blocks */}
                                {msg.content.includes('Error:') && msg.content.includes('Tool') && (
                                  <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                                    <div className="flex items-start gap-2">
                                      <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-red-400 mb-1">Tool Execution Error</p>
                                        <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono overflow-x-auto">{msg.content.match(/Error:.*$/m)?.[0] || 'Unknown error'}</pre>
                                        <button 
                                          onClick={() => navigator.clipboard.writeText(msg.content)}
                                          className="mt-2 text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                                        >
                                          Copy Full Error
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
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
                     <div className="flex flex-col gap-2">
                        {/* Attachment buttons row */}
                        <div className="flex items-center gap-2 px-2">
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
                        {/* Input row */}
                        <div className="relative flex items-end gap-2">
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
                              className={`flex-1 ${theme.bgApp} border ${theme.border} rounded-xl px-4 py-3 text-sm outline-none resize-none max-h-32 custom-scrollbar shadow-inner`} 
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
                 </div>
             )}
          </div>
        </div>
      </div>

      {/* TERMINAL OVERLAY */}
      <Terminal 
        ref={terminalRef}
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
      
      {/* Tools Management Modal */}
      <ToolsManagementModal
        isOpen={showToolsModal}
        onClose={() => setShowToolsModal(false)}
        theme={theme}
      />

      {/* Code Snippets Library */}
      <SnippetsLibrary
        isOpen={showSnippets}
        onClose={() => setShowSnippets(false)}
        onInsertSnippet={(code) => {
          // Insert snippet into active file
          const activeFile = activeProject.files.find(f => f.id === activeProject.activeFileId);
          if (activeFile) {
            updateFile(activeFile.id, {
              content: activeFile.content + '\n\n' + code
            });
          }
        }}
      />
      
      {/* Git Tracker Modal */}
      <GitTracker
        isOpen={showGitTracker}
        onClose={() => setShowGitTracker(false)}
        theme={theme}
        currentProject={activeProject}
        onCommit={(message, files) => {
          const gitService = GitService.getInstance();
          gitService.commit(activeProject.id, message, files.map(name => ({
            fileName: name,
            content: activeProject.files.find(f => f.name === name)?.content || '',
            status: 'modified' as const
          })));
          setShowGitTracker(false);
        }}
        onPush={async (files) => {
          const gitHubService = GitHubService.getInstance();
          
          if (!gitHubService.isAuthenticated()) {
            alert('Please connect your GitHub account first (click the GitHub icon in the header)');
            return;
          }

          if (!activeProject.githubUrl) {
            alert('No remote repository configured. Import from GitHub or add a remote URL.');
            return;
          }

          const parsed = parseGitHubUrl(activeProject.githubUrl);
          if (!parsed) {
            alert('Invalid GitHub URL');
            return;
          }

          try {
            const gitHubFiles: GitHubFile[] = files.map(f => ({
              path: f.name,
              content: f.content
            }));

            await gitHubService.pushMultipleFiles(
              parsed.owner,
              parsed.repo,
              gitHubFiles,
              'Update files from Codemend AI',
              'main'
            );
            alert(`Successfully pushed ${files.length} file(s) to GitHub!`);
            setShowGitTracker(false);
          } catch (error: any) {
            console.error('Push failed:', error);
            alert(`Failed to push: ${error.message || 'Unknown error'}`);
          }
        }}
        onPull={async (files) => {
          const gitHubService = GitHubService.getInstance();
          
          if (!gitHubService.isAuthenticated()) {
            alert('Please connect your GitHub account first');
            return;
          }

          if (!activeProject.githubUrl) {
            alert('No remote repository configured.');
            return;
          }

          const parsed = parseGitHubUrl(activeProject.githubUrl);
          if (!parsed) {
            alert('Invalid GitHub URL');
            return;
          }

          try {
            const remoteFiles = await gitHubService.pullChanges(parsed.owner, parsed.repo);
            
            // Update project files
            const updatedFiles = remoteFiles.map((rf: any) => ({
              id: activeProject.files.find(f => f.name === rf.path)?.id || crypto.randomUUID(),
              name: rf.path,
              content: rf.content,
              language: getLanguageFromExtension(rf.path.split('.').pop() || '')
            }));

            setProjects(projects.map(p => 
              p.id === activeProject.id 
                ? { ...p, files: updatedFiles, lastModified: Date.now() }
                : p
            ));

            alert(`Successfully pulled ${updatedFiles.length} file(s) from GitHub!`);
            setShowGitTracker(false);
          } catch (error: any) {
            console.error('Pull failed:', error);
            alert(`Failed to pull: ${error.message || 'Unknown error'}`);
          }
        }}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        theme={theme}
        projects={projects}
        sessions={sessions}
        activeProject={activeProject}
        onSelectFile={(fileId) => { updateProject({ activeFileId: fileId }); setShowCommandPalette(false); }}
        onSelectSession={(sessionId) => { setCurrentSessionId(sessionId); setShowCommandPalette(false); }}
        onSelectProject={(projectId) => { setCurrentProjectId(projectId); setShowCommandPalette(false); }}
        onCreateFile={handleCreateFile}
        onCreateSession={handleCreateSession}
        onCreateProject={handleCreateProject}
        onOpenSettings={() => { setShowSettings(true); setShowCommandPalette(false); }}
        onTogglePreview={() => { setIsEditorOpen(!isEditorOpen); setShowCommandPalette(false); }}
        onOpenTerminal={() => { terminalRef.current?.openTerminal(); setShowCommandPalette(false); }}
        onOpenGitTracker={() => { setShowGitTracker(true); setShowCommandPalette(false); }}
        onOpenTools={() => { setShowToolsModal(true); setShowCommandPalette(false); }}
        onOpenSnippets={() => { setShowSnippets(true); setShowCommandPalette(false); }}
        onOpenErrorAnalysis={() => { setShowErrorAnalysis(true); setShowCommandPalette(false); }}
      />

      {/* GitHub Authentication Modal */}
      <GitHubAuthModal
        isOpen={showGitHubAuth}
        onClose={() => setShowGitHubAuth(false)}
        theme={theme}
      />

      {/* Planner Room */}
      <PlannerRoom
        isOpen={showPlannerRoom}
        onClose={() => setShowPlannerRoom(false)}
        theme={theme}
        plannerSession={activePlannerSession}
        onUpdateSession={updatePlannerSession}
        delegatedTasks={delegatedTasks}
        onDelegateTask={handleDelegateTask}
        llmConfig={llmConfig}
        roles={roles}
        knowledgeBase={knowledgeBase}
        projectFiles={activeProject.files}
        isLoading={isLoading}
        onSendMessage={handlePlannerMessage}
      />

      {/* Error Analysis Panel */}
      {showErrorAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowErrorAnalysis(false)}>
          <div className={`w-full max-w-4xl h-[80vh] ${theme.bgApp} rounded-xl shadow-2xl overflow-hidden`} onClick={e => e.stopPropagation()}>
            <div className={`flex items-center justify-between p-4 border-b ${theme.border}`}>
              <h2 className="text-lg font-semibold">Error Analysis</h2>
              <button onClick={() => setShowErrorAnalysis(false)} className={`p-1 rounded hover:${theme.hover}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <ErrorAnalysisPanel
              sessionId={activeSession.id}
              theme={theme}
            />
          </div>
        </div>
      )}

      {/* Task Approval Modal */}
      {pendingApprovalTask && (
        <TaskApprovalModal
          task={pendingApprovalTask}
          onApprove={handleApproveTask}
          onEdit={handleEditTask}
          onCancel={handleCancelTask}
        />
      )}

      {/* Multi Diff Viewer */}
      {showMultiDiff && multiDiffChanges.length > 0 && (
        <MultiDiffViewer
          changes={multiDiffChanges}
          theme={theme}
          onClose={() => setShowMultiDiff(false)}
          onApprove={(changeId) => {
            const change = multiDiffChanges.find(c => c.id === changeId);
            if (change) handleApplyDiff(change);
            setMultiDiffChanges(prev => prev.filter(c => c.id !== changeId));
            if (multiDiffChanges.length === 1) {
              setShowMultiDiff(false);
            }
          }}
          onReject={(changeId) => {
            setMultiDiffChanges(prev => prev.filter(c => c.id !== changeId));
            if (multiDiffChanges.length === 1) {
              setShowMultiDiff(false);
            }
          }}
          onApproveAll={() => {
            multiDiffChanges.forEach(change => handleApplyDiff(change));
            setMultiDiffChanges([]);
            setShowMultiDiff(false);
          }}
          onRejectAll={() => {
            setMultiDiffChanges([]);
            setShowMultiDiff(false);
          }}
          onSaveForLater={(changesToSave) => {
            // Save all pending changes for later
            setShowMultiDiff(false);
          }}
        />
      )}
    </div>
  );
};

export default App;