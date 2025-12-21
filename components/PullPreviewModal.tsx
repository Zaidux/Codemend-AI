import React, { useState, useEffect } from 'react';
import { X, Download, AlertCircle, FileText, RefreshCw, CheckCircle, FileCode } from 'lucide-react';
import { GitHubService, parseGitHubUrl } from '../services/githubApiService';
import { ProjectFile, CodeLanguage } from '../types';

interface RemoteFileInfo {
  path: string;
  content: string;
  sha: string;
  size: number;
  lastModified?: string;
}

interface PullPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: any;
  githubUrl: string;
  onConfirmPull: (files: ProjectFile[]) => Promise<void>;
  currentFiles: ProjectFile[];
}

export const PullPreviewModal: React.FC<PullPreviewModalProps> = ({
  isOpen,
  onClose,
  theme,
  githubUrl,
  onConfirmPull,
  currentFiles
}) => {
  const [loading, setLoading] = useState(false);
  const [remoteFiles, setRemoteFiles] = useState<RemoteFileInfo[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const gitHubService = GitHubService.getInstance();

  useEffect(() => {
    if (isOpen) {
      loadRemoteChanges();
    }
  }, [isOpen]);

  const loadRemoteChanges = async () => {
    setLoading(true);
    setError(null);
    try {
      const parsed = parseGitHubUrl(githubUrl);
      if (!parsed) {
        throw new Error('Invalid GitHub URL');
      }

      // Fetch remote files
      const files = await gitHubService.pullChanges(parsed.owner, parsed.repo);
      setRemoteFiles(files);
      
      // Auto-select all files by default
      setSelectedFiles(files.map((f: RemoteFileInfo) => f.path));
    } catch (err: any) {
      console.error('Failed to load remote changes:', err);
      setError(err.message || 'Failed to fetch remote changes');
    } finally {
      setLoading(false);
    }
  };

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

  const getFileStatus = (remotePath: string): 'new' | 'modified' | 'unchanged' => {
    const localFile = currentFiles.find(f => f.name === remotePath);
    if (!localFile) return 'new';
    
    const remoteFile = remoteFiles.find(rf => rf.path === remotePath);
    if (!remoteFile) return 'unchanged';
    
    // Simple content comparison
    if (localFile.content !== remoteFile.content) return 'modified';
    
    return 'unchanged';
  };

  const toggleFile = (path: string) => {
    setSelectedFiles(prev =>
      prev.includes(path)
        ? prev.filter(p => p !== path)
        : [...prev, path]
    );
  };

  const toggleAll = () => {
    if (selectedFiles.length === remoteFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(remoteFiles.map(f => f.path));
    }
  };

  const handlePull = async () => {
    if (selectedFiles.length === 0) {
      alert('Please select at least one file to pull');
      return;
    }

    setPulling(true);
    try {
      const filesToPull: ProjectFile[] = remoteFiles
        .filter(rf => selectedFiles.includes(rf.path))
        .map(rf => ({
          id: rf.path,
          name: rf.path,
          content: rf.content,
          language: getLanguageFromPath(rf.path)
        }));

      await onConfirmPull(filesToPull);
      onClose();
    } catch (err: any) {
      console.error('Pull failed:', err);
      setError(err.message || 'Failed to pull changes');
    } finally {
      setPulling(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className={`${theme.bgApp} border ${theme.border} rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme.border}`}>
          <div className="flex items-center gap-3">
            <Download className="w-6 h-6 text-blue-400" />
            <div>
              <h2 className={`text-xl font-bold ${theme.textMain}`}>Pull Changes from Remote</h2>
              <p className={`text-sm ${theme.textMuted}`}>
                {githubUrl}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={loadRemoteChanges}
              disabled={loading}
              className={`p-2 rounded-lg hover:bg-white/5 ${theme.textMuted} hover:text-blue-400 transition-colors disabled:opacity-50`}
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className={`p-2 rounded-lg hover:bg-white/5 ${theme.textMuted} hover:text-white transition-colors`}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400 font-medium">Error loading remote changes</p>
                <p className="text-xs text-red-400/80 mt-1">{error}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-4" />
              <p className={`${theme.textMuted}`}>Fetching remote changes...</p>
            </div>
          ) : remoteFiles.length === 0 ? (
            <div className={`text-center py-12 ${theme.textMuted}`}>
              <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No remote files found</p>
              <p className="text-xs mt-1">The remote repository appears to be empty</p>
            </div>
          ) : (
            <>
              {/* Selection Controls */}
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${theme.textMuted} uppercase tracking-wider`}>
                  Remote Files ({remoteFiles.length})
                </h3>
                <button
                  onClick={toggleAll}
                  className={`text-xs px-3 py-1 rounded ${theme.bgPanel} ${theme.textMuted} hover:text-blue-400 transition-colors`}
                >
                  {selectedFiles.length === remoteFiles.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* File List */}
              <div className="space-y-2">
                {remoteFiles.map(file => {
                  const isSelected = selectedFiles.includes(file.path);
                  const status = getFileStatus(file.path);
                  const statusConfig = {
                    'new': { color: 'green', label: 'NEW', icon: FileText },
                    'modified': { color: 'orange', label: 'MOD', icon: FileCode },
                    'unchanged': { color: 'gray', label: 'SAME', icon: CheckCircle }
                  }[status];

                  return (
                    <div
                      key={file.path}
                      onClick={() => toggleFile(file.path)}
                      className={`p-4 rounded-lg border ${theme.border} cursor-pointer transition-all ${
                        isSelected ? 'bg-blue-500/10 border-blue-500/30' : `${theme.bgPanel} hover:border-blue-500/20`
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all flex-shrink-0 mt-0.5 ${
                          isSelected 
                            ? 'bg-blue-500 border-blue-500' 
                            : `border-gray-600 ${theme.bgApp}`
                        }`}>
                          {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className={`text-sm font-medium ${theme.textMain} truncate`}>{file.path}</p>
                            <div className={`px-2 py-0.5 rounded text-xs bg-${statusConfig.color}-500/20 text-${statusConfig.color}-400 border border-${statusConfig.color}-500/30 font-mono flex-shrink-0`}>
                              {statusConfig.label}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{formatFileSize(file.size)}</span>
                            {file.lastModified && (
                              <span>Modified: {new Date(file.lastModified).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>

                        <statusConfig.icon className={`w-4 h-4 text-${statusConfig.color}-400 flex-shrink-0`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={`p-6 border-t ${theme.border} flex items-center justify-between`}>
          <div className={`text-sm ${theme.textMuted}`}>
            {selectedFiles.length > 0 ? (
              <span className="text-blue-400 font-medium">
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
              </span>
            ) : (
              <span>Select files to pull from remote</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg text-sm ${theme.bgPanel} ${theme.textMuted} hover:text-white border ${theme.border} hover:bg-white/5 transition-colors`}
            >
              Cancel
            </button>
            <button
              onClick={handlePull}
              disabled={selectedFiles.length === 0 || pulling || loading}
              className={`px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                selectedFiles.length > 0 && !pulling && !loading
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
              }`}
            >
              <Download className="w-4 h-4" />
              {pulling ? 'Pulling...' : `Pull ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
