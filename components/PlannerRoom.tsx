import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Brain, CheckCircle, Clock, AlertCircle, FileText, Sparkles, Loader2 } from 'lucide-react';
import { Session, ChatMessage, DelegatedTask, ThemeConfig, LLMConfig, ProjectFile, AgentRole, KnowledgeEntry, Attachment } from '../types';
import MarkdownRenderer from './MarkdownRenderer';

interface PlannerRoomProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeConfig;
  plannerSession: Session;
  onUpdateSession: (updates: Partial<Session>) => void;
  delegatedTasks: DelegatedTask[];
  onDelegateTask: (task: DelegatedTask) => void;
  llmConfig: LLMConfig;
  roles: AgentRole[];
  knowledgeBase: KnowledgeEntry[];
  projectFiles: ProjectFile[];
  isLoading: boolean;
  onSendMessage: (message: string, attachments?: Attachment[]) => void;
}

export const PlannerRoom: React.FC<PlannerRoomProps> = ({
  isOpen,
  onClose,
  theme,
  plannerSession,
  onUpdateSession,
  delegatedTasks,
  onDelegateTask,
  llmConfig,
  roles,
  knowledgeBase,
  projectFiles,
  isLoading,
  onSendMessage
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [plannerSession.messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getTaskStatusIcon = (status: DelegatedTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'in_progress':
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'verifying':
        return <Sparkles className="w-4 h-4 text-purple-400" />;
      case 'pending_approval':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTaskStatusColor = (status: DelegatedTask['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'in_progress': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'verifying': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'pending_approval': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getPriorityColor = (priority: DelegatedTask['priority']) => {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className={`w-full max-w-7xl h-[90vh] mx-4 ${theme.bgPanel} border ${theme.border} rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>
        {/* Header */}
        <div className={`${theme.bgPanelHeader} border-b ${theme.border} p-4 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${theme.textMain}`}>Planner Room</h2>
              <p className={`text-xs ${theme.textMuted}`}>Expert Planning & Task Delegation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg hover:bg-white/10 ${theme.textMuted} hover:${theme.textMain} transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content - Split Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {/* Messages */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              {plannerSession.messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="mb-4 inline-block p-4 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                      <Brain className="w-12 h-12 text-purple-400" />
                    </div>
                    <h3 className={`text-xl font-bold ${theme.textMain} mb-2`}>Welcome to Planner Room</h3>
                    <p className={`${theme.textMuted} mb-4`}>
                      Chat with an expert planner to analyze requirements, create detailed plans,
                      and delegate tasks to the coding model.
                    </p>
                    <div className={`text-xs ${theme.textMuted} space-y-1`}>
                      <p>• Create and manage todo lists</p>
                      <p>• Read and analyze files</p>
                      <p>• Create documentation</p>
                      <p>• Delegate tasks to coder</p>
                      <p>• Verify implementations</p>
                      <p>• Track progress automatically</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {plannerSession.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                            : `${theme.bgApp} border ${theme.border}`
                        }`}
                      >
                        {msg.role === 'user' ? (
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        ) : (
                          <MarkdownRenderer content={msg.content} theme={theme} />
                        )}
                        <p
                          className={`text-[10px] mt-2 ${
                            msg.role === 'user' ? 'text-white/60' : theme.textMuted
                          }`}
                        >
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input Area */}
            <div className={`border-t ${theme.border} p-4 ${theme.bgPanelHeader}`}>
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Describe your project, ask for a plan, or delegate tasks..."
                  disabled={isLoading}
                  className={`flex-1 ${theme.bgApp} border ${theme.border} rounded-lg px-4 py-3 text-sm ${theme.textMain} placeholder:${theme.textMuted} resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50`}
                  rows={3}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className={`px-6 rounded-lg transition-all flex items-center gap-2 ${
                    !input.trim() || isLoading
                      ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:shadow-lg hover:scale-105'
                  }`}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Task Panel - Right Side */}
          <div className={`w-80 border-l ${theme.border} ${theme.bgApp} flex flex-col`}>
            <div className={`p-4 border-b ${theme.border}`}>
              <h3 className={`text-sm font-bold ${theme.textMain} flex items-center gap-2`}>
                <FileText className="w-4 h-4" />
                Active Tasks ({delegatedTasks.length})
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {delegatedTasks.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className={`text-sm ${theme.textMuted} text-center`}>
                    No delegated tasks yet.
                    <br />
                    Ask the planner to create a plan.
                  </p>
                </div>
              ) : (
                delegatedTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`border rounded-lg p-3 ${getTaskStatusColor(task.status)}`}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      {getTaskStatusIcon(task.status)}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm truncate">{task.title}</h4>
                        <p className="text-xs opacity-80 line-clamp-2">{task.description}</p>
                      </div>
                      <div className={`w-2 h-2 rounded-full ${getPriorityColor(task.priority)}`} title={task.priority} />
                    </div>

                    {task.requirements && task.requirements.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {task.requirements.slice(0, 3).map((req, idx) => (
                          <div key={idx} className="flex items-start gap-1 text-xs opacity-70">
                            <span>•</span>
                            <span className="line-clamp-1">{req}</span>
                          </div>
                        ))}
                        {task.requirements.length > 3 && (
                          <p className="text-xs opacity-50">+{task.requirements.length - 3} more</p>
                        )}
                      </div>
                    )}

                    {/* Verification Results */}
                    {task.verificationResults && task.verificationResults.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/10">
                        <div className="flex items-center gap-1 text-xs mb-1">
                          <CheckCircle className="w-3 h-3" />
                          <span className="font-semibold">Verification:</span>
                        </div>
                        {task.verificationResults.map((result, idx) => (
                          <div key={idx} className="text-xs opacity-80">
                            <span className={result.passed ? 'text-green-400' : 'text-yellow-400'}>
                              {result.passed ? '✅' : '⚠️'} {result.completeness}% complete
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between text-xs opacity-60">
                      <span>{task.status.replace('_', ' ').toUpperCase()}</span>
                      {task.estimatedTime && <span>{task.estimatedTime}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
