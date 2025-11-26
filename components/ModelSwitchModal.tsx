import * as React from 'react';
import { RefreshCw, Cpu, Check, X } from 'lucide-react';
import { LLMConfig, ThemeConfig } from '../types';

interface ModelSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitch: (config: LLMConfig) => void;
  currentConfig: LLMConfig;
  suggestedModels: LLMConfig[];
  reason: string;
  theme: ThemeConfig;
}

const ModelSwitchModal: React.FC<ModelSwitchModalProps> = ({
  isOpen,
  onClose,
  onSwitch,
  currentConfig,
  suggestedModels,
  reason,
  theme
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl w-full max-w-md shadow-2xl`}>
        {/* Header */}
        <div className={`p-6 border-b ${theme.border} flex justify-between items-center`}>
          <h2 className={`text-xl font-bold ${theme.textMain} flex items-center gap-2`}>
            <RefreshCw className="w-5 h-5" /> Switch Model
          </h2>
          <button onClick={onClose} className={`${theme.textMuted} hover:text-white`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className={`text-sm ${theme.textMuted} mb-4`}>
            {reason}
          </p>

          <div className="space-y-3">
            {suggestedModels.map((model, index) => (
              <button
                key={index}
                onClick={() => onSwitch(model)}
                className={`w-full p-4 rounded-lg border transition-all text-left ${
                  theme.border
                } ${
                  model.provider === currentConfig.provider && model.activeModelId === currentConfig.activeModelId
                    ? `${theme.accentBg} border-${theme.accent.replace('text-', '')}`
                    : `hover:bg-white/5 ${theme.textMain}`
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4" />
                      <span className="font-medium capitalize">{model.provider}</span>
                      {model.provider === currentConfig.provider && model.activeModelId === currentConfig.activeModelId && (
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">Current</span>
                      )}
                    </div>
                    <p className={`text-sm ${theme.textMuted} mt-1`}>
                      {model.activeModelId}
                    </p>
                  </div>
                  <Check className={`w-5 h-5 ${
                    model.provider === currentConfig.provider && model.activeModelId === currentConfig.activeModelId
                      ? theme.accent
                      : 'text-transparent'
                  }`} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${theme.border} flex justify-end gap-2`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg font-medium ${theme.textMuted} hover:text-white`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelSwitchModal;