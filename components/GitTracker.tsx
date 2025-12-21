import React, { useState, useEffect } from 'react';
import { X, GitBranch, GitCommit, Upload, Download, CheckCircle, AlertCircle, RefreshCw, Loader2, CheckCheck } from 'lucide-react';
import { Project, ProjectFile, CodeLanguage, FileChange } from '../types';
import { GitHubService, parseGitHubUrl } from '../services/githubApiService';
import { GitService } from '../services/gitService';

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

  useEffect(() => {
    setIsAuthenticated(gitHubService.isAuthenticated());
  }, [gitHubService]);

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

    setPulling(true);
    try {
      const remoteFiles = await gitHubService.pullChanges(parsed.owner, parsed.repo);
      
      // Convert to ProjectFile format
      const projectFiles: ProjectFile[] = remoteFiles.map((rf: any) => ({
        id: rf.path,
        name: rf.path,
        content: rf.content,
        language: getLanguageFromPath(rf.path)
      }));

      await onPull(projectFiles);
      
      alert(`Successfully pulled ${projectFiles.length} file(s) from GitHub!`);
      setRemoteChanges(false);
      
      // Reload git status after pulling
      await loadGitStatus();
    } catch (error: any) {
      console.error('Pull failed:', error);
      alert(`Failed to pull: ${error.message}`);
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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className={`${theme.bgApp} border ${theme.border} rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme.border}`}>
          <div className="flex items-center gap-3">
            <GitBranch className="w-6 h-6 text-green-400" />
            <div>
              <h2 className={`text-xl font-bold ${theme.textMain}`}>Git Changes Tracker</h2>
              <p className={`text-sm ${theme.textMuted}`}>
                {currentProject.githubUrl || 'No remote repository connected'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={loadGitStatus}
              disabled={loadingStatus}
              className={`p-2 rounded-lg hover:bg-white/5 ${theme.textMuted} hover:text-blue-400 transition-colors disabled:opacity-50`}
              title="Refresh Git Status"
            >
              <RefreshCw className={`w-5 h-5 ${loadingStatus ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className={`p-2 rounded-lg hover:bg-white/5 ${theme.textMuted} hover:text-white transition-colors`}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Banner */}
        {currentProject.githubUrl && (
          <div className={`p-3 ${remoteChanges ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-blue-500/10 border-blue-500/20'} border-b flex items-center gap-2`}>
            {checkingRemote ? (
              <>
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm text-blue-400">Checking remote repository...</span>
              </>
            ) : remoteChanges ? (
              <>
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-yellow-400">
                  Remote has {commitCount} commit(s). Click to pull latest updates.
                </span>
                <button 
                  onClick={handlePull}
                  disabled={pulling}
                  className="ml-auto px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors text-sm flex items-center gap-1 disabled:opacity-50"
                >
                  <Download className="w-3 h-3" /> {pulling ? 'Pulling...' : 'Pull Changes'}
                </button>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">Repository up to date ({localCommitCount} local commit{localCommitCount !== 1 ? 's' : ''})</span>
                <button 
                  onClick={checkRemoteChanges}
                  className="ml-auto px-3 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors text-sm flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </>
            )}
          </div>
        )}

        {/* Modified Files */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          <div>
            <h3 className={`text-sm font-semibold ${theme.textMuted} mb-3 uppercase tracking-wider flex items-center gap-2`}>
              <RefreshCw className="w-4 h-4" />
              Changes ({gitChanges.length})
              {loadingStatus && <Loader2 className="w-3 h-3 animate-spin" />}
            </h3>
            
            {gitChanges.length === 0 ? (
              <div className={`text-center py-8 ${theme.textMuted} opacity-50`}>
                <CheckCircle className="w-12 h-12 mx-auto mb-2" />
                <p>No changes detected</p>
                <p className="text-xs mt-1">Working tree clean</p>
              </div>
            ) : (
              <div className="space-y-2">
                {gitChanges.map(change => {
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
                      className={`p-3 rounded-lg border ${theme.border} cursor-pointer transition-all ${
                        isSelected ? 'bg-blue-500/10 border-blue-500/30' : `${theme.bgPanel} hover:border-blue-500/20`
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                          isSelected 
                            ? 'bg-blue-500 border-blue-500' 
                            : `border-gray-600 ${theme.bgApp}`
                        }`}>
                          {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${theme.textMain}`}>{fileName}</p>
                          <p className={`text-xs ${theme.textMuted} capitalize`}>{change.type}</p>
                        </div>
                        <div className={`px-2 py-1 rounded text-xs bg-${statusColor}-500/20 text-${statusColor}-400 border border-${statusColor}-500/30 font-mono`}>
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
            <div className="pt-4 border-t border-gray-700">
              <h3 className={`text-sm font-semibold ${theme.textMuted} mb-3 uppercase tracking-wider flex items-center gap-2`}>
                <GitCommit className="w-4 h-4" />
                Commit Changes ({selectedFiles.length} files)
              </h3>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message (e.g., 'feat: add user authentication')"
                className={`w-full px-4 py-3 rounded-lg ${theme.bgPanel} border ${theme.border} ${theme.textMain} text-sm outline-none focus:ring-2 focus:ring-blue-500/50 resize-none`}
                rows={3}
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleCommit}
                  disabled={!commitMessage.trim()}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors ${
                    commitMessage.trim()
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <GitCommit className="w-4 h-4" />
                  Commit Locally
                </button>
                {currentProject.githubUrl && (
                  <button
                    onClick={handlePush}
                    disabled={pushing || selectedFiles.length === 0}
                    className="px-4 py-2 rounded-lg text-sm flex items-center gap-2 bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {pushing ? 'Pushing...' : 'Push'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${theme.border} flex items-center justify-between`}>
          <p className={`text-xs ${theme.textMuted}`}>
            💡 Tip: Select files to stage and commit them
          </p>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm ${theme.bgPanel} ${theme.textMuted} hover:text-white border ${theme.border} hover:bg-white/5 transition-colors`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
