import React, { useState } from 'react';
import { RotateCcw, MessageSquarePlus, AlertTriangle, Zap } from 'lucide-react';

interface CheckpointRecoveryProps {
  theme: any;
  onContinue: () => void;
  onIterate: (additionalContext: string) => void;
  errorMessage?: string;
  show: boolean;
  checkpointSummary?: {
    completedSteps: number;
    remainingSteps: number;
    filesInProgress: string[];
  };
}

export const CheckpointRecovery: React.FC<CheckpointRecoveryProps> = ({
  theme,
  onContinue,
  onIterate,
  errorMessage,
  show,
  checkpointSummary
}) => {
  const [showIterateModal, setShowIterateModal] = useState(false);
  const [additionalContext, setAdditionalContext] = useState('');

  if (!show) return null;

  const handleContinue = () => {
    onContinue();
  };

  const handleIterateClick = () => {
    setShowIterateModal(true);
  };

  const handleIterateSubmit = () => {
    if (additionalContext.trim()) {
      onIterate(additionalContext.trim());
      setAdditionalContext('');
      setShowIterateModal(false);
    }
  };

  return (
    <>
      {/* Recovery Banner */}
      <div className={`border-l-4 border-orange-500 bg-orange-500/10 p-4 rounded-lg mb-4`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className={`font-semibold ${theme.textMain} mb-1`}>
              Generation Interrupted
            </h3>
            {errorMessage && (
              <p className={`text-sm ${theme.textMuted} mb-3`}>
                {errorMessage}
              </p>
            )}
            {checkpointSummary && (
              <div className={`text-xs ${theme.textMuted} mb-3 space-y-1`}>
                <p>✅ Completed: {checkpointSummary.completedSteps} step{checkpointSummary.completedSteps !== 1 ? 's' : ''}</p>
                <p>⏳ Remaining: {checkpointSummary.remainingSteps} step{checkpointSummary.remainingSteps !== 1 ? 's' : ''}</p>
                {checkpointSummary.filesInProgress.length > 0 && (
                  <p>📝 In Progress: {checkpointSummary.filesInProgress.join(', ')}</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleContinue}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <RotateCcw className="w-4 h-4" />
                Continue
              </button>
              <button
                onClick={handleIterateClick}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <MessageSquarePlus className="w-4 h-4" />
                Iterate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Iterate Modal */}
      {showIterateModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className={`${theme.bgApp} border ${theme.border} rounded-2xl w-full max-w-2xl shadow-2xl`}>
            {/* Header */}
            <div className={`p-6 border-b ${theme.border}`}>
              <div className="flex items-center gap-3">
                <MessageSquarePlus className="w-6 h-6 text-blue-400" />
                <div>
                  <h2 className={`text-xl font-bold ${theme.textMain}`}>
                    Add Context & Iterate
                  </h2>
                  <p className={`text-sm ${theme.textMuted}`}>
                    Provide additional instructions to guide the continuation
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="mb-4">
                <label className={`block text-sm font-medium ${theme.textMain} mb-2`}>
                  Additional Context / Instructions
                </label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Example: 'Make sure to add error handling in the validation function' or 'Use async/await instead of promises' or 'Add TypeScript types for all parameters'"
                  className={`w-full h-40 px-4 py-3 rounded-lg ${theme.bgPanel} border ${theme.border} ${theme.textMain} text-sm outline-none focus:ring-2 focus:ring-blue-500/50 resize-none`}
                  autoFocus
                />
              </div>

              <div className={`p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg mb-4`}>
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className={`text-xs ${theme.textMuted}`}>
                    <p className="font-medium text-blue-400 mb-1">Pro Tip:</p>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>Be specific about what you want to change or add</li>
                      <li>Mention file names if you want specific files modified</li>
                      <li>Specify code style preferences (e.g., async/await, arrow functions)</li>
                      <li>Add constraints (e.g., "without breaking existing tests")</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={`p-6 border-t ${theme.border} flex justify-end gap-2`}>
              <button
                onClick={() => {
                  setShowIterateModal(false);
                  setAdditionalContext('');
                }}
                className={`px-4 py-2 rounded-lg text-sm ${theme.bgPanel} ${theme.textMuted} hover:text-white border ${theme.border} hover:bg-white/5 transition-colors`}
              >
                Cancel
              </button>
              <button
                onClick={handleIterateSubmit}
                disabled={!additionalContext.trim()}
                className={`px-6 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                  additionalContext.trim()
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-gray-500/20 text-gray-500 cursor-not-allowed'
                }`}
              >
                <MessageSquarePlus className="w-4 h-4" />
                Continue with Context
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
