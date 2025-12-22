import React, { useState, useEffect } from 'react';
import { X, GitBranch, GitCommit, Upload, Download, CheckCircle, AlertCircle, RefreshCw, Loader2, CheckCheck, Sparkles } from 'lucide-react';
import { Project, ProjectFile, CodeLanguage, FileChange } from '../types';
import { GitHubService, parseGitHubUrl } from '../services/githubApiService';
import { GitService } from '../services/gitService';
import { PullPreviewModal } from './PullPreviewModal';

interface GitTrackerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: any;
  currentProject: Project;
  onCommit: (message: string, files: string[]) => void;
  onPush: (files: ProjectFile[]) => Promise<void>;
  onPull: (files: ProjectFile[]) => Promise<void>;
}

export const GitTracker: React.FC<GitTrackerProps> = ({ 
  isOpen, 
  onClose, 
  theme, 
  currentProject,
  onCommit,
  onPush,
  onPull 
}) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [gitChanges, setGitChanges] = useState<FileChange[]>([]);
  const [remoteChanges, setRemoteChanges] = useState(false);
  const [checkingRemote, setCheckingRemote] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [gitHubService] = useState(() => GitHubService.getInstance());
  const [gitService] = useState(() => GitService.getInstance());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [commitCount, setCommitCount] = useState(0);
  const [localCommitCount, setLocalCommitCount] = useState(0);
  const [showPullPreview, setShowPullPreview] = useState(false);

  useEffect(() => {
    setIsAuthenticated(gitHubService.isAuthenticated());
  }, [gitHubService]);

  // Re-check authentication when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsAuthenticated(gitHubService.isAuthenticated());
    }
  }, [isOpen, gitHubService]);

  const loadGitStatus = async () => {
    setLoadingStatus(true);
    try {
      // Initialize git if not already initialized
      await gitService.init(currentProject.id, {
        remoteUrl: currentProject.githubUrl,
        branch: 'main'
      });

      // Get actual git status
      const status = await gitService.getStatus(currentProject.id, currentProject.files);
      setGitChanges(status.changes);
      setLocalCommitCount(status.ahead);
      
      // If no changes detected, commit current state as baseline
      if (status.changes.length === 0 && currentProject.files.length > 0) {
        const hasInitialCommit = await gitService.hasCommits(currentProject.id);
        if (!hasInitialCommit) {
          await gitService.commit(
            currentProject.id, 
            'Initial commit - Baseline',
            currentProject.files
          );
          // Reload status after initial commit
          const newStatus = await gitService.getStatus(currentProject.id, currentProject.files);
          setGitChanges(newStatus.changes);
        }
      }
    } catch (error) {
      console.error('Failed to load git status:', error);
    } finally {
      setLoadingStatus(false);
    }
  };

  const checkRemoteChanges = async () => {
    if (!currentProject.githubUrl || !isAuthenticated) return;
    
    setCheckingRemote(true);
    try {
      const parsed = parseGitHubUrl(currentProject.githubUrl);
      if (parsed) {
        // Get remote commits
        const commits = await gitHubService.getCommits(parsed.owner, parsed.repo, 'main', 10);
        setCommitCount(commits.length);
        
        // Get local commits
        const localCommits = await gitService.getCommits(currentProject.id);
        const localHeadSha = localCommits[localCommits.length - 1]?.id;
        
        // Check if remote has commits we don't have locally
        // In a real git system, we'd compare commit SHAs
        // Here we use commit count as a simple heuristic
        const hasNewRemoteCommits = commits.length > 0 && (
          !localHeadSha || 
          commits.some(c => !localCommits.find(lc => lc.message === c.commit.message))
        );
        
        setRemoteChanges(hasNewRemoteCommits);
      }
    } catch (error) {
      console.warn('Failed to check remote changes:', error);
      setRemoteChanges(false);
    } finally {
      setCheckingRemote(false);
    }
  };

  const handlePush = async () => {
    if (!isAuthenticated) {
      alert('Please connect your GitHub account first (click the GitHub icon in the header)');
      return;
    }

    if (selectedFiles.length === 0) {
      alert('Please select files to push');
      return;
    }

    const parsed = parseGitHubUrl(currentProject.githubUrl || '');
    if (!parsed) {
      alert('Invalid GitHub URL');
      return;
    }

    setPushing(true);
    try {
      const filesToPush = currentProject.files.filter(f => 
        selectedFiles.includes(f.name)
      );

      await onPush(filesToPush);
      
      setSelectedFiles([]);
      setCommitMessage('');
      alert(`Successfully pushed ${filesToPush.length} file(s) to GitHub!`);
      
      // Refresh git status and remote status
      await loadGitStatus();
      await checkRemoteChanges();
    } catch (error: any) {
      console.error('Push failed:', error);
      alert(`Failed to push: ${error.message}`);
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
    if (!isAuthenticated) {
      alert('Please connect your GitHub account first');
      return;
    }

    const parsed = parseGitHubUrl(currentProject.githubUrl || '');
    if (!parsed) {
      alert('Invalid GitHub URL');
      return;
    }

    // Open the pull preview modal instead of pulling directly
    setShowPullPreview(true);
  };

  const handleConfirmPull = async (filesToPull: ProjectFile[]) => {
    setPulling(true);
    try {
      await onPull(filesToPull);
      
      alert(`Successfully pulled ${filesToPull.length} file(s) from GitHub!`);
      setRemoteChanges(false);
      setShowPullPreview(false);
      
      // Reload git status after pulling
      await loadGitStatus();
    } catch (error: any) {
      console.error('Pull failed:', error);
      alert(`Failed to pull: ${error.message}`);
      throw error; // Re-throw so the modal can handle it
    } finally {
      setPulling(false);
    }
  };

  // Helper to determine language from file path
  const getLanguageFromPath = (path: string): CodeLanguage => {
    const ext = path.split('.').pop()?.toLowerCase();
    const langMap: Record<string, CodeLanguage> = {
      'ts': CodeLanguage.TYPESCRIPT,
      'tsx': CodeLanguage.TYPESCRIPT,
      'js': CodeLanguage.JAVASCRIPT,
      'jsx': CodeLanguage.JAVASCRIPT,
      'py': CodeLanguage.PYTHON,
      'html': CodeLanguage.HTML,
      'css': CodeLanguage.CSS,
      'json': CodeLanguage.JSON,
      'md': CodeLanguage.MARKDOWN
    };
    return langMap[ext || ''] || CodeLanguage.JAVASCRIPT;
  };

  useEffect(() => {
    if (isOpen) {
      // Load actual git status
      loadGitStatus();
      
      // Check for remote changes
      checkRemoteChanges();
    }
  }, [isOpen, currentProject]);

  const toggleFile = (fileName: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileName) 
        ? prev.filter(f => f !== fileName)
        : [...prev, fileName]
    );
  };

  const handleCommit = () => {
    if (commitMessage.trim() && selectedFiles.length > 0) {
      onCommit(commitMessage, selectedFiles);
      setCommitMessage('');
      setSelectedFiles([]);
    }
  };

  if (!isOpen) return null;

  const hasGitHubUrl = Boolean(currentProject.githubUrl);
  const canPull = hasGitHubUrl && isAuthenticated;
  const canPush = hasGitHubUrl && isAuthenticated && selectedFiles.length > 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className={`${theme.bgApp} border ${theme.border} rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl backdrop-blur-xl animate-slideUp`}>
        {/* Animated gradient border effect */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 blur-xl opacity-50 animate-pulse pointer-events-none" />
        
        <div className="relative z-10 flex flex-col h-full bg-inherit rounded-2xl">
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme.border}`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <GitBranch className="w-6 h-6 text-green-400" />
              {loadingStatus && (
                <div className="absolute -inset-1 bg-green-400/30 rounded-full blur animate-ping" />
              )}
            </div>
            <div>
              <h2 className={`text-xl font-bold ${theme.textMain} flex items-center gap-2`}>
                Git Changes Tracker
                {canPull && <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />}
              </h2>
              <p className={`text-sm ${theme.textMuted} truncate max-w-md`}>
                {currentProject.githubUrl || 'No remote repository connected'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={loadGitStatus}
              disabled={loadingStatus}
              className={`p-2 rounded-lg hover:bg-white/5 ${theme.textMuted} hover:text-blue-400 transition-all disabled:opacity-50 hover:scale-110 active:scale-95`}
              title="Refresh Git Status"
            >
              <RefreshCw className={`w-5 h-5 ${loadingStatus ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={onClose} 
              className={`p-2 rounded-lg hover:bg-white/5 ${theme.textMuted} hover:text-white transition-all hover:scale-110 active:scale-95`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Banner */}
        {hasGitHubUrl && (
          <div className={`p-3 ${remoteChanges ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-blue-500/10 border-blue-500/20'} border-b flex items-center gap-2 transition-all duration-300`}>
            {checkingRemote ? (
              <>
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm text-blue-400 animate-pulse">Checking remote repository...</span>
              </>
            ) : remoteChanges ? (
              <>
                <AlertCircle className="w-4 h-4 text-yellow-400 animate-bounce" />
                <span className="text-sm text-yellow-400">
                  Remote has {commitCount} commit(s). Pull to sync latest changes.
                </span>
                <button 
                  onClick={handlePull}
                  disabled={pulling}
                  className="ml-auto px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-all text-sm flex items-center gap-1 disabled:opacity-50 hover:scale-105 active:scale-95"
                >
                  {pulling ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Pulling...</>
                  ) : (
                    <><Download className="w-3 h-3" /> Pull Now</>
                  )}
                </button>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">
                  Repository up to date ({localCommitCount} local commit{localCommitCount !== 1 ? 's' : ''})
                </span>
                <button 
                  onClick={checkRemoteChanges}
                  className="ml-auto px-3 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all text-sm flex items-center gap-1 hover:scale-105 active:scale-95"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </>
            )}
          </div>
        )}

        {/* Modified Files */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {/* Quick Actions - Pull Section */}
          {hasGitHubUrl && (
            <div className="mb-4">
              <h3 className={`text-sm font-semibold ${theme.textMuted} mb-3 uppercase tracking-wider flex items-center gap-2`}>
                <Download className="w-4 h-4" />
                Quick Actions
              </h3>
              {!isAuthenticated ? (
                <div className="p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative z-10">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className={`text-sm ${theme.textMain} font-medium mb-1`}>GitHub Authentication Required</p>
                        <p className={`text-xs ${theme.textMuted}`}>
                          Connect your GitHub account to pull changes from the remote repository.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => alert('Click the GitHub icon in the top-right header to connect your account')}
                      className="px-4 py-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-all text-sm font-medium hover:scale-105 active:scale-95 flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      How to Connect
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handlePull}
                  disabled={pulling}
                  className="w-full px-4 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  {pulling ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Pulling Changes...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5 group-hover:animate-bounce" />
                      Pull Latest Changes from GitHub
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          <div>
            <h3 className={`text-sm font-semibold ${theme.textMuted} mb-3 uppercase tracking-wider flex items-center gap-2`}>
              <RefreshCw className="w-4 h-4" />
              Changes ({gitChanges.length})
              {loadingStatus && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
            </h3>
            
            {gitChanges.length === 0 ? (
              <div className={`text-center py-12 ${theme.textMuted} opacity-50 animate-fadeIn`}>
                <CheckCircle className="w-16 h-16 mx-auto mb-3 text-green-400/50 animate-pulse" />
                <p className="font-medium">No changes detected</p>
                <p className="text-xs mt-2">Working tree clean ✨</p>
              </div>
            ) : (
              <div className="space-y-2">
                {gitChanges.map((change, index) => {
                  const fileName = change.file.name;
                  const isSelected = selectedFiles.includes(fileName);
                  const statusColor = {
                    'added': 'green',
                    'modified': 'orange',
                    'deleted': 'red'
                  }[change.type];
                  const statusLabel = {
                    'added': 'A',
                    'modified': 'M',
                    'deleted': 'D'
                  }[change.type];
                  
                  return (
                    <div
                      key={fileName}
                      onClick={() => toggleFile(fileName)}
                      className={`p-3 rounded-lg border ${theme.border} cursor-pointer transition-all duration-200 ${
                        isSelected 
                          ? 'bg-blue-500/10 border-blue-500/30 shadow-lg shadow-blue-500/10 scale-[1.02]' 
                          : `${theme.bgPanel} hover:border-blue-500/20 hover:bg-blue-500/5 hover:scale-[1.01]`
                      } animate-slideIn`}
                      style={{
                        animationDelay: `${index * 50}ms`
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 ${
                          isSelected 
                            ? 'bg-blue-500 border-blue-500 scale-110' 
                            : `border-gray-600 ${theme.bgApp} group-hover:border-blue-400`
                        }`}>
                          {isSelected && <CheckCircle className="w-3 h-3 text-white animate-scaleIn" />}
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${theme.textMain}`}>{fileName}</p>
                          <p className={`text-xs ${theme.textMuted} capitalize`}>{change.type}</p>
                        </div>
                        <div className={`px-2 py-1 rounded text-xs bg-${statusColor}-500/20 text-${statusColor}-400 border border-${statusColor}-500/30 font-mono font-semibold transition-transform ${isSelected ? 'scale-110' : ''}`}>
                          {statusLabel}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Commit Section */}
          {selectedFiles.length > 0 && (
            <div className="pt-4 border-t border-gray-700 animate-slideIn">
              <h3 className={`text-sm font-semibold ${theme.textMuted} mb-3 uppercase tracking-wider flex items-center gap-2`}>
                <GitCommit className="w-4 h-4" />
                Commit Changes ({selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''})
              </h3>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message (e.g., 'feat: add user authentication')"
                className={`w-full px-4 py-3 rounded-lg ${theme.bgPanel} border ${theme.border} ${theme.textMain} text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none transition-all`}
                rows={3}
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleCommit}
                  disabled={!commitMessage.trim()}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-all font-medium ${
                    commitMessage.trim()
                      ? 'bg-blue-500 text-white hover:bg-blue-600 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-500/20'
                      : 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <GitCommit className="w-4 h-4" />
                  Commit Locally
                </button>
                {hasGitHubUrl && (
                  <button
                    onClick={handlePush}
                    disabled={pushing || !canPush}
                    className="px-4 py-2 rounded-lg text-sm flex items-center gap-2 bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 border border-green-500/30 hover:from-green-500/30 hover:to-emerald-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] font-medium shadow-lg shadow-green-500/10 relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    {pushing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Pushing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Push to GitHub
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${theme.border} flex items-center justify-between bg-gradient-to-r from-transparent via-blue-500/5 to-transparent`}>
          <div className="flex items-center gap-2">
            <p className={`text-xs ${theme.textMuted} flex items-center gap-1`}>
              <Sparkles className="w-3 h-3" />
              Tip: Select files to stage and commit them
            </p>
          </div>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm ${theme.bgPanel} ${theme.textMuted} hover:text-white border ${theme.border} hover:bg-white/5 transition-all hover:scale-105 active:scale-95`}
          >
            Close
          </button>
        </div>
        </div>
      </div>

      {/* Pull Preview Modal */}
      <PullPreviewModal
        isOpen={showPullPreview}
        onClose={() => setShowPullPreview(false)}
        theme={theme}
        githubUrl={currentProject.githubUrl || ''}
        onConfirmPull={handleConfirmPull}
        currentFiles={currentProject.files}
      />

      {/* Add CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes slideIn {
          from {
            transform: translateX(-10px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            transform: scale(0);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.4s ease-out;
        }

        .animate-slideIn {
          animation: slideIn 0.3s ease-out forwards;
        }

        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
};
