import React, { useState, useEffect } from 'react';
import { FileCode, Check, X, Eye, Clock, AlertCircle } from 'lucide-react';
import { FileDiff } from '../types';

interface PendingChangesProps {
  theme: any;
  onApprove: (changeId: string) => void;
  onReject: (changeId: string) => void;
  onView: (change: FileDiff) => void;
}

interface StoredChange extends FileDiff {
  timestamp: number;
  status: 'pending' | 'approved' | 'rejected';
  sessionId?: string;
}

export const PendingChanges: React.FC<PendingChangesProps> = ({
  theme,
  onApprove,
  onReject,
  onView
}) => {
  const [changes, setChanges] = useState<StoredChange[]>(() => {
    const saved = localStorage.getItem('cm_pending_changes');
    return saved ? JSON.parse(saved) : [];
  });

  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  // Save to localStorage whenever changes update
  useEffect(() => {
    localStorage.setItem('cm_pending_changes', JSON.stringify(changes));
  }, [changes]);

  // Listen for new changes from parent
  useEffect(() => {
    const handleNewChange = (event: CustomEvent<FileDiff>) => {
      const newChange: StoredChange = {
        ...event.detail,
        timestamp: Date.now(),
        status: 'pending'
      };
      setChanges(prev => [newChange, ...prev]);
    };

    window.addEventListener('cm:new-change' as any, handleNewChange);
    return () => window.removeEventListener('cm:new-change' as any, handleNewChange);
  }, []);

  const handleApprove = (changeId: string) => {
    setChanges(prev => prev.map(c => 
      c.id === changeId ? { ...c, status: 'approved' as const } : c
    ));
    onApprove(changeId);
  };

  const handleReject = (changeId: string) => {
    setChanges(prev => prev.map(c => 
      c.id === changeId ? { ...c, status: 'rejected' as const } : c
    ));
    onReject(changeId);
  };

  const handleClearAll = () => {
    if (confirm('Clear all pending changes? This cannot be undone.')) {
      setChanges([]);
    }
  };

  const filteredChanges = changes.filter(c => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  const pendingCount = changes.filter(c => c.status === 'pending').length;
  const approvedCount = changes.filter(c => c.status === 'approved').length;
  const rejectedCount = changes.filter(c => c.status === 'rejected').length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`p-3 border-b ${theme.border} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-orange-400" />
          <span className="font-semibold text-sm">Pending Changes</span>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
              {pendingCount}
            </span>
          )}
        </div>
        {changes.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-xs text-gray-400 hover:text-red-400"
            title="Clear all changes"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className={`flex border-b ${theme.border} text-xs`}>
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 py-2 ${filter === 'all' ? theme.accent : theme.textMuted} hover:bg-white/5`}
        >
          All ({changes.length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`flex-1 py-2 ${filter === 'pending' ? theme.accent : theme.textMuted} hover:bg-white/5`}
        >
          Pending ({pendingCount})
        </button>
        <button
          onClick={() => setFilter('approved')}
          className={`flex-1 py-2 ${filter === 'approved' ? theme.accent : theme.textMuted} hover:bg-white/5`}
        >
          ✓ ({approvedCount})
        </button>
        <button
          onClick={() => setFilter('rejected')}
          className={`flex-1 py-2 ${filter === 'rejected' ? theme.accent : theme.textMuted} hover:bg-white/5`}
        >
          ✗ ({rejectedCount})
        </button>
      </div>

      {/* Changes List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredChanges.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>No {filter !== 'all' ? filter : ''} changes</p>
            <p className="text-xs mt-1">
              {filter === 'pending' 
                ? 'AI changes will appear here for review'
                : filter === 'approved'
                ? 'Approved changes will be listed here'
                : filter === 'rejected'
                ? 'Rejected changes will be listed here'
                : 'All changes will be listed here'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {filteredChanges.map((change) => (
              <div
                key={change.id}
                className={`p-3 rounded border ${theme.border} ${
                  change.status === 'approved' 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : change.status === 'rejected'
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-white/5 hover:bg-white/10'
                } transition-colors`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <FileCode className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      change.status === 'approved' ? 'text-green-400' :
                      change.status === 'rejected' ? 'text-red-400' :
                      'text-blue-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate" title={change.fileName}>
                        {change.fileName}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {change.type === 'create' ? '✨ Create' : 
                         change.type === 'update' ? '📝 Update' : 
                         change.type === 'delete' ? '🗑️ Delete' : change.type}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(change.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  {change.status === 'pending' && (
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={() => onView(change)}
                        className="p-1 hover:bg-blue-500/20 rounded"
                        title="View diff"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-400" />
                      </button>
                      <button
                        onClick={() => handleApprove(change.id)}
                        className="p-1 hover:bg-green-500/20 rounded"
                        title="Approve change"
                      >
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      </button>
                      <button
                        onClick={() => handleReject(change.id)}
                        className="p-1 hover:bg-red-500/20 rounded"
                        title="Reject change"
                      >
                        <X className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  )}
                  
                  {change.status === 'approved' && (
                    <Check className="w-5 h-5 text-green-400 ml-2" />
                  )}
                  
                  {change.status === 'rejected' && (
                    <X className="w-5 h-5 text-red-400 ml-2" />
                  )}
                </div>
                
                {/* Preview of change */}
                <div className="mt-2 text-xs">
                  <div className="flex gap-2">
                    {change.type !== 'create' && (
                      <div className="text-red-400">
                        -{change.originalContent?.split('\n').length || 0} lines
                      </div>
                    )}
                    {change.type !== 'delete' && (
                      <div className="text-green-400">
                        +{change.newContent?.split('\n').length || 0} lines
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to dispatch new changes
export const addPendingChange = (change: FileDiff) => {
  window.dispatchEvent(new CustomEvent('cm:new-change', { detail: change }));
};
