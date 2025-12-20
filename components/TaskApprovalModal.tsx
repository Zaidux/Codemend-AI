import React, { useState } from 'react';
import { X, CheckCircle, Clock, AlertCircle, FileText, Sparkles, ArrowRight, Edit3 } from 'lucide-react';
import { DelegatedTask } from '../types';

interface TaskApprovalModalProps {
  task: DelegatedTask;
  onApprove: (task: DelegatedTask) => void;
  onEdit: (task: DelegatedTask, feedback: string) => void;
  onCancel: (taskId: string) => void;
}

export function TaskApprovalModal({ task, onApprove, onEdit, onCancel }: TaskApprovalModalProps) {
  const [feedback, setFeedback] = useState('');
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'low': return 'text-green-500 bg-green-500/10 border-green-500/20';
      default: return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  };

  const handleEdit = () => {
    if (showFeedbackInput) {
      if (feedback.trim()) {
        onEdit(task, feedback);
      }
    } else {
      setShowFeedbackInput(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-lg shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Sparkles className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Task Approval Required</h2>
              <p className="text-sm text-gray-400 mt-0.5">Review and approve this delegated task</p>
            </div>
          </div>
          <button
            onClick={() => onCancel(task.id)}
            className="p-2 hover:bg-white/5 rounded-lg transition text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title & Priority */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getPriorityColor(task.priority)}`}>
                {getPriorityIcon(task.priority)} {task.priority.toUpperCase()} PRIORITY
              </span>
              {task.estimatedTime && (
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span>{task.estimatedTime}</span>
                </div>
              )}
            </div>
            <h3 className="text-2xl font-bold text-white">{task.title}</h3>
          </div>

          {/* Description */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">Description</h4>
            <p className="text-gray-200 whitespace-pre-wrap">{task.description}</p>
          </div>

          {/* Requirements */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              Requirements & Acceptance Criteria
            </h4>
            <ul className="space-y-2">
              {task.requirements.map((req, idx) => (
                <li key={idx} className="flex items-start gap-2 text-gray-200">
                  <span className="text-green-400 mt-1">✓</span>
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Target Project */}
          {task.targetProjectId && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-300 mb-1 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Target Project
              </h4>
              <p className="text-blue-200">{task.targetProjectId === 'new' ? 'New Project (will be created)' : task.targetProjectId}</p>
            </div>
          )}

          {/* Files to Modify */}
          {task.filesToModify && task.filesToModify.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                Files to be Modified/Created
              </h4>
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <ul className="space-y-1">
                  {task.filesToModify.map((file, idx) => (
                    <li key={idx} className="text-sm text-gray-300 font-mono">
                      • {file}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Dependencies */}
          {task.dependencies && task.dependencies.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400" />
                Dependencies & Prerequisites
              </h4>
              <ul className="space-y-1">
                {task.dependencies.map((dep, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-gray-300">
                    <span className="text-yellow-400 mt-1">⚠</span>
                    <span>{dep}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Feedback Input (Edit Mode) */}
          {showFeedbackInput && (
            <div className="space-y-2 border-t border-white/10 pt-4">
              <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-purple-400" />
                Provide Feedback to Planner
              </h4>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Enter your feedback, questions, or requested changes..."
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                rows={4}
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-white/10 bg-white/5">
          <button
            onClick={() => onCancel(task.id)}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition border border-white/10"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleEdit}
              className={`px-4 py-2 rounded-lg transition border flex items-center gap-2 ${
                showFeedbackInput
                  ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border-purple-500/30'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border-white/10'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              {showFeedbackInput ? 'Send Feedback' : 'Edit Plan'}
            </button>
            <button
              onClick={() => onApprove(task)}
              className="px-6 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold transition shadow-lg shadow-green-500/20 flex items-center gap-2"
            >
              <CheckCircle className="w-5 h-5" />
              Approve & Execute
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
