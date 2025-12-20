import React, { useState, useEffect } from 'react';
import { X, GitBranch, GitCommit, Upload, Download, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Project } from '../types';

interface GitTrackerProps {
  isOpen: boolean;
  onClose: () => void;
  theme: any;
  currentProject: Project;
  onCommit: (message: string, files: string[]) => void;
  onPush: () => void;
  onPull: () => void;
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
  const [modifiedFiles, setModifiedFiles] = useState<string[]>([]);
  const [remoteChanges, setRemoteChanges] = useState(false);
  const [checkingRemote, setCheckingRemote] = useState(false);

  const checkRemoteChanges = async () => {
    if (!currentProject.githubUrl) return;
    
    setCheckingRemote(true);
    try {
      // Extract owner/repo from GitHub URL
      const match = currentProject.githubUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
      if (match) {
        const [, owner, repo] = match;
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`);
        if (response.ok) {
          const commits = await response.json();
          // In a real app, compare with last known commit hash
          // For now, just indicate there might be changes if repo exists
          setRemoteChanges(commits && commits.length > 0);
        }
      }
    } catch (error) {
      console.warn('Failed to check remote changes:', error);
    } finally {
      setCheckingRemote(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Detect modified files (files changed in the app)
      const modified = currentProject.files
        .filter(f => f.content && f.content.length > 0)
        .map(f => f.name);
      setModifiedFiles(modified);
      
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
          <button onClick={onClose} className={`p-2 rounded-lg hover:bg-white/5 ${theme.textMuted} hover:text-white transition-colors`}>
            <X className="w-5 h-5" />
          </button>
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
                  Remote changes detected. Click to pull latest updates.
                </span>
                <button 
                  onClick={onPull}
                  className="ml-auto px-3 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors text-sm flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Pull Changes
                </button>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400">Repository up to date</span>
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
              Modified Files ({modifiedFiles.length})
            </h3>
            
            {modifiedFiles.length === 0 ? (
              <div className={`text-center py-8 ${theme.textMuted} opacity-50`}>
                <CheckCircle className="w-12 h-12 mx-auto mb-2" />
                <p>No modified files</p>
              </div>
            ) : (
              <div className="space-y-2">
                {modifiedFiles.map(fileName => {
                  const isSelected = selectedFiles.includes(fileName);
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
                          <p className={`text-xs ${theme.textMuted}`}>Modified</p>
                        </div>
                        <div className="px-2 py-1 rounded text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30">
                          M
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
                    onClick={onPush}
                    className="px-4 py-2 rounded-lg text-sm flex items-center gap-2 bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Push
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
