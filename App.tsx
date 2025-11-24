
import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Sparkles, AlertCircle, Play, RotateCcw, Clipboard, CheckCircle2, Copy, Check, BookOpen, Wrench, X, Monitor, Zap, Settings, MessageSquare, Plus, Trash2, Send, Sidebar as SidebarIcon, Layout } from 'lucide-react';
import Header from './components/Header';
import MarkdownRenderer from './components/MarkdownRenderer';
import { LANGUAGES, DEFAULT_INSTRUCTION, THEMES } from './constants';
import { CodeLanguage, FixRequest, AppMode, ThemeType, Session, ChatMessage, ViewMode } from './types';
import { fixCodeWithGemini } from './services/geminiService';

// Initial Session Generator
const createNewSession = (): Session => ({
  id: crypto.randomUUID(),
  title: 'Untitled Session',
  code: '',
  language: CodeLanguage.JAVASCRIPT,
  messages: [],
  lastModified: Date.now(),
  mode: 'FIX'
});

const App: React.FC = () => {
  // --- STATE ---
  
  // Settings & Meta
  const [themeName, setThemeName] = useState<ThemeType>(() => 
    (localStorage.getItem('cm_theme') as ThemeType) || 'cosmic'
  );
  const [viewMode, setViewMode] = useState<ViewMode>(() => 
    (localStorage.getItem('cm_view_mode') as ViewMode) || 'chat'
  );
  const [highCapacity, setHighCapacity] = useState<boolean>(() => 
    localStorage.getItem('cm_high_capacity') === 'true'
  );
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Sessions
  const [sessions, setSessions] = useState<Session[]>(() => {
    const saved = localStorage.getItem('cm_sessions');
    return saved ? JSON.parse(saved) : [createNewSession()];
  });
  
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return localStorage.getItem('cm_current_session_id') || sessions[0]?.id || '';
  });

  // Derived Current Session State
  const activeSession = sessions.find(s => s.id === currentSessionId) || sessions[0];

  // Temporary Inputs (Not persisted in session until sent)
  const [inputInstruction, setInputInstruction] = useState<string>('');
  const [copied, setCopied] = useState(false);
  
  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for scrolling
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Derived Theme Config
  const theme = THEMES[themeName];

  // --- PERSISTENCE EFFECTS ---
  useEffect(() => {
    localStorage.setItem('cm_theme', themeName);
  }, [themeName]);

  useEffect(() => {
    localStorage.setItem('cm_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('cm_high_capacity', String(highCapacity));
  }, [highCapacity]);

  useEffect(() => {
    localStorage.setItem('cm_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('cm_current_session_id', currentSessionId);
  }, [currentSessionId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [activeSession.messages, isLoading, viewMode]);

  // --- LOGIC ---

  const detectLanguage = (text: string): CodeLanguage => {
    const trimmed = text.trim();
    if (!trimmed) return CodeLanguage.OTHER;
    if (trimmed.startsWith('<html') || trimmed.includes('</div>') || trimmed.includes('<!DOCTYPE html>')) return CodeLanguage.HTML;
    if (trimmed.includes('import React') || trimmed.includes('interface ') || (trimmed.includes('type ') && trimmed.includes(' = '))) return CodeLanguage.TYPESCRIPT;
    if (trimmed.includes('def ') && (trimmed.includes(':') || trimmed.includes('->')) && !trimmed.includes('function')) return CodeLanguage.PYTHON;
    if ((trimmed.includes('public class') || trimmed.includes('System.out.println')) && trimmed.includes(';')) return CodeLanguage.JAVA;
    if ((trimmed.includes('#include <iostream>') || trimmed.includes('std::cout'))) return CodeLanguage.CPP;
    if (trimmed.includes('using System;') || trimmed.includes('Console.WriteLine')) return CodeLanguage.CSHARP;
    if (trimmed.includes('package main') && trimmed.includes('func ') && trimmed.includes('fmt.')) return CodeLanguage.GO;
    if (trimmed.includes('fn main()') && trimmed.includes('println!')) return CodeLanguage.RUST;
    if ((trimmed.includes('SELECT ') && trimmed.includes('FROM ')) || trimmed.includes('CREATE TABLE')) return CodeLanguage.SQL;
    if (trimmed.startsWith('{') && trimmed.endsWith('}') && trimmed.includes('"')) return CodeLanguage.JSON;
    if (trimmed.includes('<?php') || trimmed.includes('echo $')) return CodeLanguage.PHP;
    if (trimmed.startsWith('#!/bin/bash') || trimmed.includes('echo "') && trimmed.includes('fi')) return CodeLanguage.BASH;
    if (trimmed.includes('function ') || trimmed.includes('const ') || trimmed.includes('let ') || trimmed.includes('console.log')) return CodeLanguage.JAVASCRIPT;
    if (trimmed.includes('{') && trimmed.includes('}') && trimmed.includes(':') && !trimmed.includes('"')) return CodeLanguage.CSS;
    return CodeLanguage.OTHER;
  };

  const updateActiveSession = (updates: Partial<Session>) => {
    setSessions(prev => prev.map(s => s.id === activeSession.id ? { ...s, ...updates, lastModified: Date.now() } : s));
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
      if (currentSessionId === id) {
        setCurrentSessionId(newSessions[0].id);
      }
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const detected = detectLanguage(text);
      updateActiveSession({ code: text, language: detected !== CodeLanguage.OTHER ? detected : activeSession.language });
    } catch (err) {
      console.error("Failed to read clipboard", err);
    }
  };

  const handleSendMessage = async () => {
    const promptText = inputInstruction.trim() || (activeSession.mode === 'FIX' ? DEFAULT_INSTRUCTION : "Explain this code.");
    
    if (!activeSession.code.trim()) {
      setError("Please paste some code first.");
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Add User Message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: promptText,
      timestamp: Date.now()
    };

    const newMessages = [...activeSession.messages, userMsg];
    
    // Optimistic Update
    updateActiveSession({ 
      messages: newMessages,
      title: activeSession.messages.length === 0 ? promptText.slice(0, 30) + '...' : activeSession.title 
    });
    setInputInstruction('');
    setIsLoading(true);
    setError(null);

    // Call API
    const response = await fixCodeWithGemini({
      code: activeSession.code,
      language: activeSession.language,
      history: newMessages, // Send full history including new message
      currentMessage: promptText,
      mode: activeSession.mode,
      useHighCapacity: highCapacity
    });

    if (response.error) {
      setError(response.error);
    } else {
      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        content: response.response,
        timestamp: Date.now()
      };
      
      let finalMessages = [...newMessages];
      if (response.contextSummarized) {
        // Handle summarization visual cue if needed
      }
      finalMessages.push(aiMsg);
      
      updateActiveSession({ messages: finalMessages });
    }

    setIsLoading(false);
  };

  const handleCopyAll = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getWordCount = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;
  const getTokenCount = (text: string) => Math.ceil(text.length / 4);
  
  const wordCount = getWordCount(activeSession.code);
  const tokenCount = getTokenCount(activeSession.code);

  const lastModelMessage = [...activeSession.messages].reverse().find(m => m.role === 'model');

  return (
    <div className={`flex h-screen overflow-hidden ${theme.bgApp} ${theme.textMain} transition-colors duration-300`}>
      
      {/* SIDEBAR - Only visible in Chat Mode */}
      <div 
        className={`${viewMode === 'chat' && isSidebarOpen ? 'w-72 border-r' : 'w-0'} flex-shrink-0 flex flex-col ${theme.border} ${theme.bgPanel} transition-all duration-300 overflow-hidden relative`}
      >
        <div className={`p-4 border-b ${theme.border} ${theme.bgPanelHeader} flex items-center justify-between`}>
          <div className="flex items-center gap-2 font-bold text-sm">
            <SidebarIcon className="w-4 h-4" />
            <span>History</span>
          </div>
          <button onClick={handleCreateSession} className={`p-1.5 rounded-md ${theme.button} hover:opacity-90 transition`}>
            <Plus className="w-4 h-4 text-white" />
          </button>
        </div>
        
        <div className="flex-grow overflow-y-auto p-2 space-y-1">
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => setCurrentSessionId(session.id)}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer text-sm transition-colors ${
                currentSessionId === session.id ? `${theme.accentBg} ${theme.accent} border border-${theme.accent}/20` : `hover:bg-white/5 ${theme.textMuted}`
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-70" />
                <div className="flex flex-col truncate">
                  <span className="truncate font-medium">{session.title}</span>
                  <span className="text-xs opacity-60">{new Date(session.lastModified).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
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
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-grow flex flex-col min-w-0 h-full relative">
        <Header 
          theme={theme} 
          viewMode={viewMode}
          onToggleViewMode={setViewMode}
          onOpenSettings={() => setShowSettings(true)} 
        />

        <div className="flex-grow flex overflow-hidden">
          
          {/* LEFT: CODE EDITOR & INPUT */}
          <div className={`w-full lg:w-1/2 flex flex-col border-r ${theme.border} min-w-[300px]`}>
             
             {/* Toolbar */}
             <div className={`${theme.bgPanel} px-4 py-3 border-b ${theme.border} flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                   {viewMode === 'chat' && (
                     <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-1.5 rounded hover:bg-white/5 ${theme.textMuted}`}>
                        <SidebarIcon className="w-4 h-4" />
                     </button>
                   )}
                   <select 
                      value={activeSession.language}
                      onChange={(e) => updateActiveSession({ language: e.target.value as CodeLanguage })}
                      className={`bg-white/5 ${theme.textMain} text-xs rounded border-none py-1.5 pl-2 pr-6 cursor-pointer`}
                    >
                      {LANGUAGES.map((lang) => <option key={lang} value={lang} className="text-black">{lang}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                   <button onClick={handlePaste} className={`p-1.5 hover:bg-white/10 rounded ${theme.textMuted} hover:text-white text-xs flex items-center gap-1.5`}>
                      <Clipboard className="w-3.5 h-3.5" /> Paste
                   </button>
                   <button onClick={() => updateActiveSession({ code: '' })} className={`p-1.5 hover:bg-white/10 rounded ${theme.textMuted} hover:text-white text-xs flex items-center gap-1.5`}>
                      <RotateCcw className="w-3.5 h-3.5" /> Clear
                   </button>
                </div>
             </div>

             {/* Code Area */}
             <div className="flex-grow relative flex flex-col">
                <textarea
                  value={activeSession.code}
                  onChange={(e) => updateActiveSession({ code: e.target.value })}
                  placeholder="// Paste your code or logs here..."
                  className={`flex-grow w-full p-4 ${theme.codeBg} text-sm code-font ${theme.textMain} resize-none outline-none border-none`}
                  spellCheck={false}
                />
                
                {/* Stats Footer */}
                <div className={`${theme.bgPanel} border-t ${theme.border} px-4 py-2 text-xs ${theme.textMuted} flex justify-between items-center`}>
                    <div className="flex items-center gap-3">
                        <span>{wordCount.toLocaleString()} words</span>
                        <span className="opacity-30">|</span>
                        <span>~{tokenCount.toLocaleString()} tokens</span>
                    </div>
                    {highCapacity && <span className="text-emerald-500 flex items-center gap-1"><Zap className="w-3 h-3"/> High Capacity</span>}
                </div>
             </div>

             {/* CLASSIC MODE: Input Controls at bottom of Left Panel */}
             {viewMode === 'classic' && (
               <div className={`p-4 border-t ${theme.border} ${theme.bgPanel}`}>
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
                      disabled={isLoading || (!activeSession.code.trim())}
                      className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all ${
                        isLoading || (!activeSession.code.trim())
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

          {/* RIGHT PANEL - Conditional Render */}
          {viewMode === 'classic' ? (
            /* CLASSIC INTERFACE: Result Only */
            <div className={`flex-grow flex flex-col w-full lg:w-1/2 ${theme.bgPanel} relative`}>
               <div className={`p-3 border-b ${theme.border} ${theme.bgPanelHeader} flex items-center justify-between`}>
                  <h3 className={`font-semibold ${theme.textMain} flex items-center gap-2`}>
                     <Sparkles className={`w-4 h-4 ${theme.accent}`} />
                     <span>Result</span>
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
                       <p>Ready to analyze. <br/>Select a mode and run the agent.</p>
                    </div>
                  )}
               </div>
            </div>
          ) : (
            /* CHAT INTERFACE: Conversation */
            <div className={`flex-grow flex flex-col w-full lg:w-1/2 bg-black/20`}>
              
              {/* Mobile Sidebar Toggle */}
              <div className={`lg:hidden ${theme.bgPanel} p-2 border-b ${theme.border} flex items-center justify-between`}>
                 <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2">
                    <SidebarIcon className="w-5 h-5" />
                 </button>
                 <span className="text-sm font-medium">Session: {activeSession.title}</span>
              </div>

              {/* Messages */}
              <div ref={chatContainerRef} className="flex-grow overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
                {activeSession.messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-60 text-center p-8">
                     <div className={`${theme.accentBg} p-6 rounded-full mb-4`}>
                        <Sparkles className={`w-10 h-10 ${theme.accent}`} />
                     </div>
                     <h3 className="text-lg font-medium mb-2">Start the conversation</h3>
                     <p className={`text-sm ${theme.textMuted} max-w-sm`}>
                       Paste your code, then ask me to fix bugs, explain logic, or optimize performance.
                     </p>
                  </div>
                ) : (
                  activeSession.messages.map((msg) => (
                    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[90%] lg:max-w-[85%] rounded-2xl px-5 py-4 shadow-sm ${
                        msg.role === 'user' 
                        ? `${theme.accentBg} border border-${theme.accent}/20 rounded-tr-none` 
                        : `${theme.bgPanel} border ${theme.border} rounded-tl-none`
                      }`}>
                        {msg.role === 'user' ? (
                          <p className={`whitespace-pre-wrap text-sm ${theme.textMain}`}>{msg.content}</p>
                        ) : (
                          <MarkdownRenderer content={msg.content} theme={theme} />
                        )}
                      </div>
                      <span className={`text-[10px] mt-1.5 opacity-40 mx-1 ${theme.textMuted}`}>
                        {msg.role === 'user' ? 'You' : 'Gemini'} • {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
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
                      <span className={`text-[10px] mt-1.5 opacity-40 mx-1 ${theme.textMuted}`}>Thinking...</span>
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

              {/* Chat Input Area */}
              <div className={`p-4 border-t ${theme.border} ${theme.bgPanel}`}>
                 <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                    <button 
                      onClick={() => updateActiveSession({ mode: 'FIX' })}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 whitespace-nowrap ${
                        activeSession.mode === 'FIX' ? `${theme.button} border-transparent text-white` : `border-${theme.border} ${theme.textMuted} hover:text-white`
                      }`}
                    >
                      <Wrench className="w-3 h-3" /> Fix Mode
                    </button>
                    <button 
                      onClick={() => updateActiveSession({ mode: 'EXPLAIN' })}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 whitespace-nowrap ${
                        activeSession.mode === 'EXPLAIN' ? `${theme.button} border-transparent text-white` : `border-${theme.border} ${theme.textMuted} hover:text-white`
                      }`}
                    >
                      <BookOpen className="w-3 h-3" /> Explain Mode
                    </button>
                 </div>
                 
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
                      placeholder={activeSession.messages.length === 0 
                        ? (activeSession.mode === 'FIX' ? DEFAULT_INSTRUCTION : "What should I explain?") 
                        : "Ask a follow-up question..."}
                      className={`w-full ${theme.bgApp} border ${theme.border} rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-${theme.accent}/50 outline-none resize-none max-h-32 custom-scrollbar shadow-inner`}
                      rows={1}
                      style={{minHeight: '46px'}}
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={isLoading || (!inputInstruction.trim() && activeSession.messages.length > 0)}
                      className={`p-3 rounded-xl flex-shrink-0 transition-all ${
                        isLoading || (!inputInstruction.trim() && activeSession.messages.length > 0)
                        ? 'bg-white/5 text-slate-500 cursor-not-allowed'
                        : `${theme.button} ${theme.buttonHover} text-white shadow-lg`
                      }`}
                    >
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
                  <button 
                    onClick={() => setShowSettings(false)}
                    className={`absolute top-4 right-4 ${theme.textMuted} hover:text-white`}
                  >
                      <X className="w-5 h-5" />
                  </button>

                  <h2 className={`text-xl font-bold ${theme.textMain} mb-6 flex items-center gap-2`}>
                      <Settings className="w-5 h-5" />
                      App Settings
                  </h2>

                  <div className="space-y-6">
                      
                      {/* Theme Selector */}
                      <div>
                          <label className={`block text-sm font-medium ${theme.textMuted} mb-3 uppercase tracking-wider`}>Theme</label>
                          <div className="grid grid-cols-3 gap-2">
                              {Object.keys(THEMES).map((tKey) => (
                                  <button
                                      key={tKey}
                                      onClick={() => setThemeName(tKey as ThemeType)}
                                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all capitalize ${
                                          themeName === tKey 
                                          ? `${theme.button} border-transparent text-white ring-2 ring-offset-2 ring-offset-black/50 ring-white/20`
                                          : `bg-white/5 border-transparent ${theme.textMuted} hover:bg-white/10 hover:text-white`
                                      }`}
                                  >
                                      {tKey}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className={`h-px ${theme.border} bg-current opacity-20`} />

                      {/* Capacity Toggle */}
                      <div>
                          <div className="flex items-center justify-between mb-2">
                              <label className={`flex items-center gap-2 text-sm font-medium ${theme.textMain}`}>
                                  <Zap className={highCapacity ? "text-yellow-400 w-4 h-4" : "text-slate-500 w-4 h-4"} />
                                  High Capacity Mode
                              </label>
                              <button 
                                  onClick={() => setHighCapacity(!highCapacity)}
                                  className={`w-12 h-6 rounded-full transition-colors relative ${highCapacity ? theme.button : 'bg-slate-700'}`}
                              >
                                  <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${highCapacity ? 'left-7' : 'left-1'}`} />
                              </button>
                          </div>
                          <p className={`text-xs ${theme.textMuted} leading-relaxed`}>
                              Enabling this allows the AI to process large context windows. If the conversation gets too long, the system will auto-summarize previous messages to save tokens.
                          </p>
                      </div>

                      <div className={`h-px ${theme.border} bg-current opacity-20`} />

                      <div className={`text-center`}>
                          <button 
                            onClick={() => setShowSettings(false)}
                            className={`w-full py-2.5 rounded-lg font-medium bg-white/5 hover:bg-white/10 ${theme.textMain} transition-colors`}
                          >
                              Close
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
