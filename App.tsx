
import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Sparkles, AlertCircle, Play, RotateCcw, Clipboard, CheckCircle2, Copy, Check, BookOpen, Wrench, X, Monitor, Zap, Settings, MessageSquare, Plus, Trash2, Send, Sidebar as SidebarIcon, Layout, LayoutTemplate, FileCode, FolderOpen, FilePlus } from 'lucide-react';
import Header from './components/Header';
import MarkdownRenderer from './components/MarkdownRenderer';
import CodeEditor from './components/CodeEditor';
import { LANGUAGES, DEFAULT_INSTRUCTION, THEMES } from './constants';
import { CodeLanguage, FixRequest, AppMode, ThemeType, Session, ChatMessage, ViewMode, ProjectFile } from './types';
import { fixCodeWithGemini } from './services/geminiService';

// Initial Generator
const createNewFile = (name: string = 'script.js'): ProjectFile => ({
  id: crypto.randomUUID(),
  name,
  language: CodeLanguage.JAVASCRIPT,
  content: ''
});

const createNewSession = (): Session => {
  const rootFile = createNewFile('index.js');
  return {
    id: crypto.randomUUID(),
    title: 'Untitled Project',
    files: [rootFile],
    activeFileId: rootFile.id,
    messages: [],
    lastModified: Date.now(),
    mode: 'FIX'
  };
};

const App: React.FC = () => {
  // --- STATE ---
  
  // Settings & Meta
  const [themeName, setThemeName] = useState<ThemeType>(() => 
    (localStorage.getItem('cm_theme') as ThemeType) || 'cosmic'
  );
  const [viewMode, setViewMode] = useState<ViewMode>(() => 
    (localStorage.getItem('cm_view_mode') as ViewMode) || 'classic'
  );
  const [highCapacity, setHighCapacity] = useState<boolean>(() => 
    localStorage.getItem('cm_high_capacity') === 'true'
  );
  
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Sessions / Projects
  const [sessions, setSessions] = useState<Session[]>(() => {
    const saved = localStorage.getItem('cm_sessions');
    return saved ? JSON.parse(saved) : [createNewSession()];
  });
  
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return localStorage.getItem('cm_current_session_id') || sessions[0]?.id || '';
  });

  // Derived Active State
  const activeSession = sessions.find(s => s.id === currentSessionId) || sessions[0];
  const activeFile = activeSession.files.find(f => f.id === activeSession.activeFileId) || activeSession.files[0];

  // Temporary Inputs
  const [inputInstruction, setInputInstruction] = useState<string>('');
  const [copied, setCopied] = useState(false);
  
  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const theme = THEMES[themeName];

  // --- PERSISTENCE ---
  useEffect(() => { localStorage.setItem('cm_theme', themeName); }, [themeName]);
  useEffect(() => { localStorage.setItem('cm_view_mode', viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem('cm_high_capacity', String(highCapacity)); }, [highCapacity]);
  useEffect(() => { localStorage.setItem('cm_sessions', JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => { localStorage.setItem('cm_current_session_id', currentSessionId); }, [currentSessionId]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [activeSession.messages, isLoading, viewMode]);

  // --- LOGIC ---

  const detectLanguage = (text: string): CodeLanguage => {
    const trimmed = text.trim();
    if (!trimmed) return CodeLanguage.OTHER;
    if (trimmed.startsWith('<html') || trimmed.includes('</div>')) return CodeLanguage.HTML;
    if (trimmed.includes('import React')) return CodeLanguage.TYPESCRIPT;
    if (trimmed.includes('def ')) return CodeLanguage.PYTHON;
    if (trimmed.includes('public class')) return CodeLanguage.JAVA;
    return CodeLanguage.JAVASCRIPT;
  };

  const updateActiveSession = (updates: Partial<Session>) => {
    setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, ...updates, lastModified: Date.now() } : s));
  };

  const updateActiveFile = (content: string) => {
    const detected = detectLanguage(content);
    const updatedFiles = activeSession.files.map(f => 
      f.id === activeFile.id 
      ? { ...f, content, language: detected !== CodeLanguage.OTHER ? detected : f.language } 
      : f
    );
    updateActiveSession({ files: updatedFiles });
  };

  const handleCreateFile = () => {
    const name = prompt("Enter file name (e.g., style.css):", "new_file.js");
    if (name) {
      const newFile = createNewFile(name);
      // Basic extension detection
      if (name.endsWith('.css')) newFile.language = CodeLanguage.CSS;
      if (name.endsWith('.html')) newFile.language = CodeLanguage.HTML;
      if (name.endsWith('.py')) newFile.language = CodeLanguage.PYTHON;
      if (name.endsWith('.ts') || name.endsWith('.tsx')) newFile.language = CodeLanguage.TYPESCRIPT;
      
      const updatedFiles = [...activeSession.files, newFile];
      updateActiveSession({ files: updatedFiles, activeFileId: newFile.id });
    }
  };

  const handleDeleteFile = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    if (activeSession.files.length <= 1) return; // Prevent deleting last file
    const confirm = window.confirm("Delete this file?");
    if (confirm) {
       const updatedFiles = activeSession.files.filter(f => f.id !== fileId);
       const nextId = updatedFiles[0].id;
       updateActiveSession({ files: updatedFiles, activeFileId: nextId });
    }
  };

  const handleCreateSession = () => {
    const newSession = createNewSession();
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setInputInstruction('');
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    if (newSessions.length === 0) {
      const fresh = createNewSession();
      setSessions([fresh]);
      setCurrentSessionId(fresh.id);
    } else {
      setSessions(newSessions);
      if (currentSessionId === id) setCurrentSessionId(newSessions[0].id);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      updateActiveFile(text);
    } catch (err) {
      console.error("Failed to read clipboard", err);
    }
  };

  // --- AGENT TOOL EXECUTION ---
  
  const executeToolCalls = (toolCalls: any[], currentFiles: ProjectFile[]) => {
     let updatedFiles = [...currentFiles];
     const results: string[] = [];

     toolCalls.forEach(call => {
       if (call.name === 'create_file') {
         const { name, content, language } = call.args;
         const existing = updatedFiles.find(f => f.name === name);
         if (existing) {
           results.push(`Error: File ${name} already exists. Used update_file instead.`);
         } else {
           const newFile = createNewFile(name);
           newFile.content = content;
           if (language) newFile.language = language as CodeLanguage;
           updatedFiles.push(newFile);
           results.push(`File created: ${name}`);
         }
       } else if (call.name === 'update_file') {
         const { name, content } = call.args;
         const existingIndex = updatedFiles.findIndex(f => f.name === name);
         if (existingIndex >= 0) {
           updatedFiles[existingIndex] = { ...updatedFiles[existingIndex], content };
           results.push(`File updated: ${name}`);
         } else {
           results.push(`Error: File ${name} not found.`);
         }
       }
     });

     return { updatedFiles, results };
  };

  const handleSendMessage = async () => {
    const promptText = inputInstruction.trim() || (activeSession.mode === 'FIX' ? DEFAULT_INSTRUCTION : "Explain this code.");
    
    // Add User Message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: promptText,
      timestamp: Date.now()
    };

    const newMessages = [...activeSession.messages, userMsg];
    
    updateActiveSession({ 
      messages: newMessages,
      title: activeSession.messages.length === 0 ? promptText.slice(0, 30) + '...' : activeSession.title 
    });
    setInputInstruction('');
    setIsLoading(true);
    setError(null);

    // 1. Initial Call
    const response = await fixCodeWithGemini({
      activeFile: activeFile,
      allFiles: activeSession.files,
      history: newMessages,
      currentMessage: promptText,
      mode: activeSession.mode,
      useHighCapacity: highCapacity
    });

    if (response.error) {
      setError(response.error);
      setIsLoading(false);
      return;
    }

    let finalMessages = [...newMessages];

    // 2. Handle Tool Calls (Agent Loop)
    if (response.toolCalls && response.toolCalls.length > 0) {
       // A. Execute changes to virtual file system
       const { updatedFiles, results } = executeToolCalls(response.toolCalls, activeSession.files);
       
       // B. Update React State with new files
       updateActiveSession({ files: updatedFiles });

       // C. Add Tool Output to history
       const toolOutputMsg: ChatMessage = {
         id: crypto.randomUUID(),
         role: 'user', // System feedback acts as user role in this simple schema or 'function' role if supported
         content: `Tool Execution Results:\n${results.join('\n')}`,
         timestamp: Date.now(),
         isToolCall: true
       };
       
       finalMessages.push(toolOutputMsg);

       // D. Call Gemini again with the tool output to get the final explanation
       const followUpResponse = await fixCodeWithGemini({
         activeFile: updatedFiles.find(f => f.id === activeFile.id) || updatedFiles[0],
         allFiles: updatedFiles,
         history: finalMessages,
         currentMessage: "Confirm the changes to the user.",
         mode: activeSession.mode,
         useHighCapacity: highCapacity
       });

       const finalAiMsg: ChatMessage = {
         id: crypto.randomUUID(),
         role: 'model',
         content: followUpResponse.response,
         timestamp: Date.now()
       };
       finalMessages.push(finalAiMsg);

    } else {
      // Normal text response
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        content: response.response,
        timestamp: Date.now()
      };
      finalMessages.push(aiMsg);
    }
      
    updateActiveSession({ messages: finalMessages });
    setIsLoading(false);
  };

  const handleCopyAll = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getWordCount = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;
  const getTokenCount = (text: string) => Math.ceil(text.length / 4);
  
  const wordCount = getWordCount(activeFile.content);
  const tokenCount = getTokenCount(activeFile.content);

  const lastModelMessage = [...activeSession.messages].reverse().find(m => m.role === 'model');

  // RENDER HELPERS
  const renderSidebar = () => (
    <div 
      className={`
         flex flex-col flex-shrink-0 ${theme.border} ${theme.bgPanel} 
         transition-all duration-300 ease-in-out border-r
         fixed inset-y-0 left-0 z-40 lg:relative lg:z-0 lg:h-auto
         ${isSidebarOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'}
      `}
    >
     {/* Projects Header */}
     <div className={`p-4 border-b ${theme.border} ${theme.bgPanelHeader} flex items-center justify-between h-16`}>
       <div className="flex items-center gap-2 font-bold text-sm">
         <FolderOpen className="w-4 h-4" />
         <span>Projects</span>
       </div>
       <button onClick={handleCreateSession} className={`p-1.5 rounded-md ${theme.button} hover:opacity-90 transition`}>
         <Plus className="w-4 h-4 text-white" />
       </button>
     </div>
     
     {/* Projects List */}
     <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
       {sessions.map(session => (
         <div 
           key={session.id}
           onClick={() => { setCurrentSessionId(session.id); if (window.innerWidth < 1024 && viewMode === 'chat') setIsSidebarOpen(false); }}
           className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer text-sm transition-colors ${
             currentSessionId === session.id ? `${theme.accentBg} ${theme.accent} border border-${theme.accent}/20` : `hover:bg-white/5 ${theme.textMuted}`
           }`}
         >
           <div className="flex items-center gap-3 overflow-hidden">
             <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-70" />
             <div className="flex flex-col truncate">
               <span className="truncate font-medium">{session.title}</span>
               <span className="text-xs opacity-60">{session.files.length} files • {new Date(session.lastModified).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
             </div>
           </div>
           <button 
             onClick={(e) => handleDeleteSession(e, session.id)}
             className={`opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-all`}
           >
             <Trash2 className="w-3.5 h-3.5" />
           </button>
         </div>
       ))}
     </div>
     
     {/* Files Section (Visible in Sidebar for context) */}
     <div className={`p-3 border-t ${theme.border} bg-black/20`}>
        <div className={`text-xs uppercase font-semibold ${theme.textMuted} mb-2 flex justify-between items-center`}>
            <span>Files in Project</span>
            <button onClick={handleCreateFile} className="hover:text-white"><FilePlus className="w-3.5 h-3.5" /></button>
        </div>
        <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
            {activeSession.files.map(file => (
                <div 
                  key={file.id} 
                  onClick={() => updateActiveSession({ activeFileId: file.id })}
                  className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer ${
                     activeSession.activeFileId === file.id ? `${theme.accent} bg-white/5` : `${theme.textMuted} hover:text-white`
                  }`}
                >
                    <div className="flex items-center gap-2 truncate">
                        <FileCode className="w-3.5 h-3.5" />
                        <span className="truncate">{file.name}</span>
                    </div>
                    {activeSession.files.length > 1 && (
                        <button onClick={(e) => handleDeleteFile(e, file.id)} className="opacity-50 hover:opacity-100 hover:text-red-400">
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            ))}
        </div>
     </div>
   </div>
  );

  return (
    <div className={`flex h-screen overflow-hidden ${theme.bgApp} ${theme.textMain} transition-colors duration-300`}>
      
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Render Sidebar Logic */}
      {viewMode === 'chat' ? renderSidebar() : null}
      {/* In Classic mode, we can show a drawer or just put files in left panel. For now, keep files in left panel toolbar */}

      {/* MAIN CONTENT */}
      <div className="flex-grow flex flex-col min-w-0 h-full relative">
        <Header 
          theme={theme} 
          viewMode={viewMode}
          onOpenSettings={() => setShowSettings(true)} 
        />

        <div className="flex-grow flex flex-col lg:flex-row overflow-hidden relative">
          
          {/* LEFT: CODE EDITOR & FILE TABS */}
          <div className={`w-full lg:w-1/2 flex flex-col border-b lg:border-b-0 lg:border-r ${theme.border} h-1/2 lg:h-auto`}>
             
             {/* Toolbar / File Tabs */}
             <div className={`${theme.bgPanel} border-b ${theme.border} flex items-center justify-between h-12 flex-shrink-0 px-2`}>
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar mask-gradient-right max-w-[70%]">
                   {/* Sidebar Toggle */}
                   <button 
                       onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                       className={`p-2 mr-2 rounded hover:bg-white/5 ${theme.textMuted} lg:hidden`}
                   >
                        <SidebarIcon className="w-4 h-4" />
                   </button>
                   
                   {/* Desktop Sidebar Toggle for Chat Mode */}
                   {viewMode === 'chat' && (
                     <button 
                       onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                       className={`p-2 mr-2 rounded hover:bg-white/5 ${theme.textMuted} hidden lg:block`}
                     >
                        <SidebarIcon className="w-4 h-4" />
                     </button>
                   )}

                   {/* File Tabs */}
                   {activeSession.files.map(file => (
                       <button
                         key={file.id}
                         onClick={() => updateActiveSession({ activeFileId: file.id })}
                         className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-medium border-t border-x border-transparent transition-all min-w-[100px] max-w-[150px] ${
                             activeSession.activeFileId === file.id 
                             ? `${theme.bgApp} ${theme.textMain} border-${theme.border.replace('border-', '')} border-b-${theme.bgApp}` 
                             : `hover:bg-white/5 ${theme.textMuted} border-b-${theme.border.replace('border-', '')}`
                         }`}
                         style={{ marginBottom: '-1px' }}
                       >
                           <FileCode className="w-3 h-3 flex-shrink-0" />
                           <span className="truncate">{file.name}</span>
                           {activeSession.files.length > 1 && activeSession.activeFileId === file.id && (
                               <div onClick={(e) => handleDeleteFile(e, file.id)} className="ml-auto hover:bg-red-500/20 rounded-full p-0.5">
                                   <X className="w-2.5 h-2.5" />
                               </div>
                           )}
                       </button>
                   ))}
                   <button onClick={handleCreateFile} className={`p-1.5 rounded hover:bg-white/10 ${theme.textMuted}`}>
                       <Plus className="w-3.5 h-3.5" />
                   </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 pl-2 border-l border-white/5">
                   <button onClick={handlePaste} className={`p-2 hover:bg-white/10 rounded ${theme.textMuted} hover:text-white`} title="Paste">
                      <Clipboard className="w-4 h-4" />
                   </button>
                   <button onClick={() => updateActiveFile('')} className={`p-2 hover:bg-white/10 rounded ${theme.textMuted} hover:text-white`} title="Clear">
                      <RotateCcw className="w-4 h-4" />
                   </button>
                </div>
             </div>

             {/* Code Area with Syntax Highlighting */}
             <div className={`flex-grow relative min-h-0 ${theme.codeBg}`}>
                <CodeEditor
                  value={activeFile.content}
                  onChange={updateActiveFile}
                  language={activeFile.language.toLowerCase()}
                  theme={theme}
                  themeType={themeName}
                  placeholder="// Select a file or paste code here..."
                />
             </div>
                
             {/* Stats Footer */}
             <div className={`${theme.bgPanel} border-t ${theme.border} px-4 py-1 text-[10px] ${theme.textMuted} flex justify-between items-center h-7 flex-shrink-0 uppercase tracking-wider`}>
                  <div className="flex items-center gap-3">
                      <span>{activeFile.language}</span>
                      <span className="opacity-30">|</span>
                      <span>{wordCount.toLocaleString()} words</span>
                  </div>
                  {highCapacity && <span className="text-emerald-500 flex items-center gap-1"><Zap className="w-3 h-3"/> HC Active</span>}
             </div>

             {/* CLASSIC MODE ONLY: Input Controls */}
             {viewMode === 'classic' && (
               <div className={`p-4 border-t ${theme.border} ${theme.bgPanel} flex-shrink-0`}>
                 <div className="flex gap-2 mb-3">
                    <button 
                      onClick={() => updateActiveSession({ mode: 'FIX' })}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
                        activeSession.mode === 'FIX' ? `${theme.button} border-transparent text-white` : `border-${theme.border} ${theme.textMuted} hover:bg-white/5`
                      }`}
                    >
                      <Wrench className="w-4 h-4" /> Fix Code
                    </button>
                    <button 
                      onClick={() => updateActiveSession({ mode: 'EXPLAIN' })}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
                        activeSession.mode === 'EXPLAIN' ? `${theme.button} border-transparent text-white` : `border-${theme.border} ${theme.textMuted} hover:bg-white/5`
                      }`}
                    >
                      <BookOpen className="w-4 h-4" /> Explain
                    </button>
                 </div>
                 
                 <div className="relative">
                    <textarea
                      value={inputInstruction}
                      onChange={(e) => setInputInstruction(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                      placeholder={activeSession.mode === 'FIX' ? "Instructions (optional)..." : "What should I explain?"}
                      className={`w-full ${theme.bgApp} border ${theme.border} rounded-xl px-4 py-3 pr-14 text-sm focus:ring-2 focus:ring-${theme.accent}/50 outline-none resize-none shadow-inner`}
                      rows={2}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={isLoading || (!activeFile.content.trim())}
                      className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all ${
                        isLoading || (!activeFile.content.trim())
                        ? 'bg-white/5 text-slate-500 cursor-not-allowed'
                        : `${theme.button} ${theme.buttonHover} text-white shadow-lg`
                      }`}
                    >
                      {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Play className="w-5 h-5 fill-current" />}
                    </button>
                 </div>
               </div>
             )}
          </div>

          {/* RIGHT PANEL */}
          {viewMode === 'classic' ? (
            /* CLASSIC INTERFACE */
            <div className={`flex-grow flex flex-col w-full lg:w-1/2 ${theme.bgPanel} relative h-1/2 lg:h-auto`}>
               <div className={`px-4 h-12 border-b ${theme.border} ${theme.bgPanelHeader} flex items-center justify-between flex-shrink-0`}>
                  <h3 className={`font-semibold ${theme.textMain} flex items-center gap-2 text-sm`}>
                     <Sparkles className={`w-4 h-4 ${theme.accent}`} />
                     <span>Analysis Result</span>
                  </h3>
                  {lastModelMessage && (
                    <button 
                      onClick={() => handleCopyAll(lastModelMessage.content)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${copied ? 'bg-emerald-500/10 text-emerald-400' : `${theme.textMuted} hover:text-white hover:bg-white/10`}`}
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy All'}
                    </button>
                  )}
               </div>
               <div className="flex-grow overflow-y-auto p-6 custom-scrollbar">
                  {isLoading ? (
                    <div className="space-y-4 animate-pulse">
                      <div className={`h-4 w-3/4 rounded ${theme.bgPanelHeader}`}></div>
                      <div className={`h-4 w-1/2 rounded ${theme.bgPanelHeader}`}></div>
                      <div className={`h-32 w-full rounded ${theme.bgPanelHeader}`}></div>
                    </div>
                  ) : lastModelMessage ? (
                    <MarkdownRenderer content={lastModelMessage.content} theme={theme} />
                  ) : (
                    <div className={`flex flex-col items-center justify-center h-full opacity-40 text-center p-8 ${theme.textMuted}`}>
                       <Layout className="w-12 h-12 mb-4 opacity-50" />
                       <p>Ready to analyze. <br/>Use the controls on the left.</p>
                    </div>
                  )}
               </div>
            </div>
          ) : (
            /* CHAT INTERFACE */
            <div className={`flex-grow flex flex-col w-full lg:w-1/2 bg-black/20 h-1/2 lg:h-auto border-l ${theme.border}`}>
              <div className={`${theme.bgPanel} px-4 h-12 border-b ${theme.border} flex items-center justify-between flex-shrink-0`}>
                 <div className="flex items-center gap-3 lg:gap-2">
                   <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="lg:hidden p-1.5 rounded hover:bg-white/5">
                      <SidebarIcon className="w-4 h-4" />
                   </button>
                   <MessageSquare className={`hidden lg:block w-4 h-4 ${theme.accent}`} />
                   <span className={`text-sm font-semibold ${theme.textMain} truncate max-w-[200px]`}>
                      {activeSession.title}
                   </span>
                 </div>
                 <div className={`text-xs ${theme.textMuted} px-2 py-1 rounded bg-white/5`}>
                    {activeSession.messages.length} messages
                 </div>
              </div>

              <div ref={chatContainerRef} className="flex-grow overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
                {activeSession.messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-60 text-center p-8">
                     <div className={`${theme.accentBg} p-6 rounded-full mb-4`}>
                        <MessageSquare className={`w-10 h-10 ${theme.accent}`} />
                     </div>
                     <h3 className="text-lg font-medium mb-2">Interactive Mode</h3>
                     <p className={`text-sm ${theme.textMuted} max-w-sm`}>
                       The AI can read all files in your project. Ask it to fix bugs, create new files, or explain the codebase.
                     </p>
                  </div>
                ) : (
                  activeSession.messages.map((msg) => (
                    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' && !msg.isToolCall ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[95%] lg:max-w-[85%] rounded-2xl px-5 py-4 shadow-sm ${
                        msg.isToolCall 
                        ? `${theme.bgPanelHeader} border border-dashed ${theme.border} w-full text-xs font-mono opacity-80`
                        : msg.role === 'user' 
                          ? `${theme.accentBg} border border-${theme.accent}/20 rounded-tr-none` 
                          : `${theme.bgPanel} border ${theme.border} rounded-tl-none`
                      }`}>
                        {msg.role === 'user' && !msg.isToolCall ? (
                          <p className={`whitespace-pre-wrap text-sm ${theme.textMain}`}>{msg.content}</p>
                        ) : (
                          <MarkdownRenderer content={msg.content} theme={theme} />
                        )}
                      </div>
                      <span className={`text-[10px] mt-1.5 opacity-40 mx-1 ${theme.textMuted}`}>
                        {msg.isToolCall ? 'System Action' : (msg.role === 'user' ? 'You' : 'Gemini')} • {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                      </span>
                    </div>
                  ))
                )}
                
                {isLoading && (
                   <div className="flex flex-col items-start animate-pulse">
                      <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl rounded-tl-none px-5 py-4 flex items-center gap-3`}>
                         <div className={`w-2 h-2 rounded-full ${theme.accent} bg-current animate-bounce`} style={{animationDelay: '0ms'}}></div>
                         <div className={`w-2 h-2 rounded-full ${theme.accent} bg-current animate-bounce`} style={{animationDelay: '150ms'}}></div>
                         <div className={`w-2 h-2 rounded-full ${theme.accent} bg-current animate-bounce`} style={{animationDelay: '300ms'}}></div>
                      </div>
                      <span className={`text-[10px] mt-1.5 opacity-40 mx-1 ${theme.textMuted}`}>Thinking & Processing Files...</span>
                   </div>
                )}
                {error && (
                  <div className="w-full flex justify-center">
                     <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" /> {error}
                     </div>
                  </div>
                )}
              </div>

              <div className={`p-4 border-t ${theme.border} ${theme.bgPanel} flex-shrink-0`}>
                 <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
                    <button onClick={() => updateActiveSession({ mode: 'FIX' })} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 whitespace-nowrap ${activeSession.mode === 'FIX' ? `${theme.button} border-transparent text-white` : `border-${theme.border} ${theme.textMuted} hover:text-white`}`}>
                      <Wrench className="w-3 h-3" /> Fix Mode
                    </button>
                    <button onClick={() => updateActiveSession({ mode: 'EXPLAIN' })} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 whitespace-nowrap ${activeSession.mode === 'EXPLAIN' ? `${theme.button} border-transparent text-white` : `border-${theme.border} ${theme.textMuted} hover:text-white`}`}>
                      <BookOpen className="w-3 h-3" /> Explain Mode
                    </button>
                 </div>
                 
                 <div className="relative flex items-end gap-2">
                    <textarea
                      value={inputInstruction}
                      onChange={(e) => setInputInstruction(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                      placeholder={activeSession.messages.length === 0 ? (activeSession.mode === 'FIX' ? DEFAULT_INSTRUCTION : "What should I explain?") : "Ask follow-up or request file changes..."}
                      className={`w-full ${theme.bgApp} border ${theme.border} rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-${theme.accent}/50 outline-none resize-none max-h-32 custom-scrollbar shadow-inner`}
                      rows={1}
                      style={{minHeight: '46px'}}
                    />
                    <button onClick={handleSendMessage} disabled={isLoading} className={`p-3 rounded-xl flex-shrink-0 transition-all ${isLoading ? 'bg-white/5 text-slate-500 cursor-not-allowed' : `${theme.button} ${theme.buttonHover} text-white shadow-lg`}`}>
                      <Send className="w-5 h-5" />
                    </button>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>

       {/* SETTINGS MODAL */}
       {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl w-full max-w-md shadow-2xl p-6 relative`}>
                  <button onClick={() => setShowSettings(false)} className={`absolute top-4 right-4 ${theme.textMuted} hover:text-white`}><X className="w-5 h-5" /></button>
                  <h2 className={`text-xl font-bold ${theme.textMain} mb-6 flex items-center gap-2`}><Settings className="w-5 h-5" /> App Settings</h2>
                  <div className="space-y-6">
                      <div>
                          <label className={`block text-sm font-medium ${theme.textMuted} mb-3 uppercase tracking-wider`}>Interface Layout</label>
                          <div className="flex gap-2">
                              <button onClick={() => { setViewMode('classic'); setShowSettings(false); }} className={`flex-1 px-3 py-3 rounded-lg text-sm font-medium border transition-all flex flex-col items-center gap-2 ${viewMode === 'classic' ? `${theme.button} border-transparent text-white ring-2 ring-offset-2 ring-offset-black/50 ring-white/20` : `bg-white/5 border-transparent ${theme.textMuted} hover:bg-white/10 hover:text-white`}`}>
                                  <LayoutTemplate className="w-5 h-5" /> <span>Classic</span>
                              </button>
                              <button onClick={() => { setViewMode('chat'); setShowSettings(false); setIsSidebarOpen(true); }} className={`flex-1 px-3 py-3 rounded-lg text-sm font-medium border transition-all flex flex-col items-center gap-2 ${viewMode === 'chat' ? `${theme.button} border-transparent text-white ring-2 ring-offset-2 ring-offset-black/50 ring-white/20` : `bg-white/5 border-transparent ${theme.textMuted} hover:bg-white/10 hover:text-white`}`}>
                                  <MessageSquare className="w-5 h-5" /> <span>Chat Interface</span>
                              </button>
                          </div>
                      </div>
                      <div className={`h-px ${theme.border} bg-current opacity-20`} />
                      <div>
                          <label className={`block text-sm font-medium ${theme.textMuted} mb-3 uppercase tracking-wider`}>Theme</label>
                          <div className="grid grid-cols-3 gap-2">
                              {Object.keys(THEMES).map((tKey) => (
                                  <button key={tKey} onClick={() => setThemeName(tKey as ThemeType)} className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all capitalize ${themeName === tKey ? `${theme.button} border-transparent text-white ring-2 ring-offset-2 ring-offset-black/50 ring-white/20` : `bg-white/5 border-transparent ${theme.textMuted} hover:bg-white/10 hover:text-white`}`}>
                                      {tKey}
                                  </button>
                              ))}
                          </div>
                      </div>
                      <div className={`h-px ${theme.border} bg-current opacity-20`} />
                      <div>
                          <div className="flex items-center justify-between mb-2">
                              <label className={`flex items-center gap-2 text-sm font-medium ${theme.textMain}`}><Zap className={highCapacity ? "text-yellow-400 w-4 h-4" : "text-slate-500 w-4 h-4"} /> High Capacity Mode</label>
                              <button onClick={() => setHighCapacity(!highCapacity)} className={`w-12 h-6 rounded-full transition-colors relative ${highCapacity ? theme.button : 'bg-slate-700'}`}>
                                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${highCapacity ? 'left-7' : 'left-1'}`} />
                              </button>
                          </div>
                          <p className={`text-xs ${theme.textMuted} leading-relaxed`}>Enabling this allows the AI to process large context windows and files.</p>
                      </div>
                      <div className={`h-px ${theme.border} bg-current opacity-20`} />
                      <div className={`text-center`}>
                          <button onClick={() => setShowSettings(false)} className={`w-full py-2.5 rounded-lg font-medium bg-white/5 hover:bg-white/10 ${theme.textMain} transition-colors`}>Close</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
