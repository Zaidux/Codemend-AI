import React, { useState } from 'react';
import { X, Check, Save, ChevronLeft, ChevronRight, FileCode, Eye, EyeOff } from 'lucide-react';
import { FileDiff } from '../types';
import DiffViewer from './DiffViewer';
import { addPendingChange } from './PendingChanges';

interface MultiDiffViewerProps {
  changes: FileDiff[];
  theme: any;
  onClose: () => void;
  onApprove: (changeId: string) => void;
  onReject: (changeId: string) => void;
  onApproveAll: () => void;
  onRejectAll: () => void;
  onSaveForLater: (changes: FileDiff[]) => void;
}

export const MultiDiffViewer: React.FC<MultiDiffViewerProps> = ({
  changes,
  theme,
  onClose,
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  onSaveForLater
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [approvedChanges, setApprovedChanges] = useState<Set<string>>(new Set());
  const [rejectedChanges, setRejectedChanges] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(true);

  if (changes.length === 0) return null;

  const currentChange = changes[currentIndex];
  const isApproved = approvedChanges.has(currentChange.id);
  const isRejected = rejectedChanges.has(currentChange.id);

  const handleApprove = () => {
    setApprovedChanges(prev => new Set([...prev, currentChange.id]));
    setRejectedChanges(prev => {
      const next = new Set(prev);
      next.delete(currentChange.id);
      return next;
    });
    onApprove(currentChange.id);
    
    // Move to next change if available
    if (currentIndex < changes.length - 1) {
      setTimeout(() => setCurrentIndex(currentIndex + 1), 300);
    }
  };

  const handleReject = () => {
    setRejectedChanges(prev => new Set([...prev, currentChange.id]));
    setApprovedChanges(prev => {
      const next = new Set(prev);
      next.delete(currentChange.id);
      return next;
    });
    onReject(currentChange.id);
    
    // Move to next change if available
    if (currentIndex < changes.length - 1) {
      setTimeout(() => setCurrentIndex(currentIndex + 1), 300);
    }
  };

  const handleApproveAll = () => {
    changes.forEach(change => {
      setApprovedChanges(prev => new Set([...prev, change.id]));
      onApprove(change.id);
    });
    setRejectedChanges(new Set());
  };

  const handleRejectAll = () => {
    changes.forEach(change => {
      setRejectedChanges(prev => new Set([...prev, change.id]));
      onReject(change.id);
    });
    setApprovedChanges(new Set());
  };

  const handleSaveForLater = () => {
    // Save all unapproved/unrejected changes to pending
    const pendingChanges = changes.filter(c => 
      !approvedChanges.has(c.id) && !rejectedChanges.has(c.id)
    );
    
    pendingChanges.forEach(change => {
      addPendingChange(change);
    });
    
    onSaveForLater(pendingChanges);
    onClose();
  };

  const goToPrevious = () => {
    setCurrentIndex(Math.max(0, currentIndex - 1));
  };

  const goToNext = () => {
    setCurrentIndex(Math.min(changes.length - 1, currentIndex + 1));
  };

  const pendingCount = changes.length - approvedChanges.size - rejectedChanges.size;
  const approvedCount = approvedChanges.size;
  const rejectedCount = rejectedChanges.size;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className={`${theme.bgApp} border ${theme.border} rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${theme.border}`}>
          <div className="flex items-center gap-3">
            <FileCode className="w-6 h-6 text-blue-400" />
            <div>
              <h2 className={`text-xl font-bold ${theme.textMain}`}>Review AI Changes</h2>
              <p className={`text-sm ${theme.textMuted}`}>
                {currentIndex + 1} of {changes.length} files • 
                <span className="text-green-400 ml-2">✓ {approvedCount}</span>
                <span className="text-red-400 ml-2">✗ {rejectedCount}</span>
                <span className="text-orange-400 ml-2">⏳ {pendingCount}</span>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${theme.button} hover:opacity-80`}
              title={showPreview ? "Hide preview" : "Show preview"}
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? 'Hide' : 'Show'} Diff
            </button>
            <button 
              onClick={onClose} 
              className={`p-2 rounded-lg hover:bg-white/5 ${theme.textMuted} hover:text-white`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* File Navigation */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${theme.border} bg-white/5`}>
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevious}
              disabled={currentIndex === 0}
              className={`p-1.5 rounded ${currentIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className={`px-4 py-2 rounded-lg ${
              isApproved ? 'bg-green-500/20 border border-green-500/50' :
              isRejected ? 'bg-red-500/20 border border-red-500/50' :
              'bg-orange-500/20 border border-orange-500/50'
            }`}>
              <div className="flex items-center gap-2">
                <FileCode className={`w-4 h-4 ${
                  isApproved ? 'text-green-400' :
                  isRejected ? 'text-red-400' :
                  'text-orange-400'
                }`} />
                <span className={`font-medium ${theme.textMain}`}>
                  {currentChange.fileName}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  currentChange.type === 'create' ? 'bg-blue-500/30 text-blue-300' :
                  currentChange.type === 'update' ? 'bg-yellow-500/30 text-yellow-300' :
                  'bg-red-500/30 text-red-300'
                }`}>
                  {currentChange.type}
                </span>
                {isApproved && <Check className="w-4 h-4 text-green-400" />}
                {isRejected && <X className="w-4 h-4 text-red-400" />}
              </div>
            </div>
            
            <button
              onClick={goToNext}
              disabled={currentIndex === changes.length - 1}
              className={`p-1.5 rounded ${currentIndex === changes.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10'}`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <div className="text-red-400">
              -{currentChange.originalContent?.split('\n').length || 0} lines
            </div>
            <div className="text-green-400">
              +{currentChange.newContent?.split('\n').length || 0} lines
            </div>
          </div>
        </div>

        {/* Diff Content */}
        {showPreview && (
          <div className="flex-1 overflow-auto p-4">
            <DiffViewer
              original={currentChange.originalContent || ''}
              modified={currentChange.newContent || ''}
              theme={theme}
              fileName={currentChange.fileName}
              maxHeight="calc(90vh - 300px)"
            />
          </div>
        )}

        {/* File List (when preview hidden) */}
        {!showPreview && (
          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-2 gap-2">
              {changes.map((change, index) => (
                <button
                  key={change.id}
                  onClick={() => setCurrentIndex(index)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    index === currentIndex 
                      ? `${theme.border} bg-blue-500/20 border-blue-500` 
                      : `${theme.border} hover:bg-white/5`
                  } ${
                    approvedChanges.has(change.id) ? 'border-green-500/50' :
                    rejectedChanges.has(change.id) ? 'border-red-500/50' :
                    'border-orange-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{change.fileName}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {change.type === 'create' ? '✨ Create' : 
                         change.type === 'update' ? '📝 Update' : 
                         '🗑️ Delete'}
                      </div>
                    </div>
                    {approvedChanges.has(change.id) && <Check className="w-4 h-4 text-green-400" />}
                    {rejectedChanges.has(change.id) && <X className="w-4 h-4 text-red-400" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div className={`flex items-center justify-between p-4 border-t ${theme.border} bg-white/5`}>
          <div className="flex gap-2">
            <button
              onClick={handleApproveAll}
              className="px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Approve All
            </button>
            <button
              onClick={handleRejectAll}
              className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Reject All
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveForLater}
              disabled={pendingCount === 0}
              className={`px-4 py-2 rounded-lg ${
                pendingCount === 0 
                  ? 'bg-gray-500/30 cursor-not-allowed' 
                  : 'bg-purple-500 hover:bg-purple-600'
              } text-white text-sm font-medium flex items-center gap-2`}
              title="Save pending changes for later review"
            >
              <Save className="w-4 h-4" />
              Save {pendingCount > 0 ? `${pendingCount} ` : ''}for Later
            </button>

            <button
              onClick={handleApprove}
              disabled={isApproved}
              className={`px-4 py-2 rounded-lg ${
                isApproved 
                  ? 'bg-green-500/30 cursor-not-allowed' 
                  : 'bg-green-500 hover:bg-green-600'
              } text-white text-sm font-medium flex items-center gap-2`}
            >
              <Check className="w-4 h-4" />
              {isApproved ? 'Approved' : 'Approve'}
            </button>
            
            <button
              onClick={handleReject}
              disabled={isRejected}
              className={`px-4 py-2 rounded-lg ${
                isRejected 
                  ? 'bg-red-500/30 cursor-not-allowed' 
                  : 'bg-red-500 hover:bg-red-600'
              } text-white text-sm font-medium flex items-center gap-2`}
            >
              <X className="w-4 h-4" />
              {isRejected ? 'Rejected' : 'Reject'}
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Help */}
        <div className={`px-4 py-2 border-t ${theme.border} text-xs ${theme.textMuted} flex items-center gap-4`}>
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white/10 rounded">←</kbd>
            <span>Previous</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white/10 rounded">→</kbd>
            <span>Next</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white/10 rounded">Enter</kbd>
            <span>Approve</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white/10 rounded">Delete</kbd>
            <span>Reject</span>
          </div>
        </div>
      </div>
    </div>
  );
};
