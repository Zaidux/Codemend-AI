import React, { useState, useEffect } from 'react';
import { X, Check, Wrench, AlertTriangle } from 'lucide-react';
import { UNIVERSAL_TOOL_DEFINITIONS } from '../services/llmTools';

interface ToolsManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: any;
}

export const ToolsManagementModal: React.FC<ToolsManagementModalProps> = ({ isOpen, onClose, theme }) => {
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Load enabled tools from localStorage
    const saved = localStorage.getItem('enabledTools');
    if (saved) {
      setEnabledTools(JSON.parse(saved));
    } else {
      // Default: all tools enabled
      const allEnabled: Record<string, boolean> = {};
      Object.keys(UNIVERSAL_TOOL_DEFINITIONS).forEach(key => {
        allEnabled[key] = true;
      });
      setEnabledTools(allEnabled);
    }
  }, []);

  const saveToolSettings = () => {
    localStorage.setItem('enabledTools', JSON.stringify(enabledTools));
    onClose();
  };

  const toggleTool = (toolName: string) => {
    setEnabledTools(prev => ({
      ...prev,
      [toolName]: !prev[toolName]
    }));
  };

  const toggleAll = (enabled: boolean) => {
    const newState: Record<string, boolean> = {};
    Object.keys(UNIVERSAL_TOOL_DEFINITIONS).forEach(key => {
      newState[key] = enabled;
    });
    setEnabledTools(newState);
  };

  if (!isOpen) return null;

  const tools = Object.entries(UNIVERSAL_TOOL_DEFINITIONS);
  const filteredTools = tools.filter(([name, def]) => 
    name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    def.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const enabledCount = Object.values(enabledTools).filter(Boolean).length;
  const totalCount = tools.length;

  // Tool categories
  const categories = {
    'File Operations': ['create_file', 'update_file', 'delete_file', 'read_file', 'read_file_section', 'replace_section'],
    'Search & Navigation': ['list_files', 'search_files', 'codebase_search'],
    'Code Quality': ['generate_tests', 'security_scan', 'code_review', 'performance_profile', 'refactor_code'],
    'Dependencies': ['analyze_dependencies'],
    'Git & Commands': ['git_operations', 'run_command'],
    'Knowledge & Tasks': ['save_knowledge', 'manage_tasks']
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className={`${theme.bgApp} border ${theme.border} rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${theme.border}`}>
          <div className="flex items-center gap-3">
            <Wrench className="w-6 h-6 text-blue-400" />
            <div>
              <h2 className={`text-xl font-bold ${theme.textMain}`}>AI Tools Management</h2>
              <p className={`text-sm ${theme.textMuted}`}>
                Enable or disable AI tools • {enabledCount}/{totalCount} active
              </p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg hover:bg-white/5 ${theme.textMuted} hover:text-white transition-colors`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search and Bulk Actions */}
        <div className={`p-4 border-b ${theme.border} space-y-3`}>
          <input
            type="text"
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full px-4 py-2 rounded-lg ${theme.bgPanel} border ${theme.border} ${theme.textMain} text-sm outline-none focus:ring-2 focus:ring-blue-500/50`}
          />
          <div className="flex gap-2">
            <button
              onClick={() => toggleAll(true)}
              className="px-3 py-1.5 rounded-lg text-xs bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors"
            >
              Enable All
            </button>
            <button
              onClick={() => toggleAll(false)}
              className="px-3 py-1.5 rounded-lg text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
            >
              Disable All
            </button>
          </div>
        </div>

        {/* Tools List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {Object.entries(categories).map(([category, toolNames]) => {
            const categoryTools = toolNames.filter(name => 
              filteredTools.some(([n]) => n === name)
            );
            
            if (categoryTools.length === 0) return null;

            return (
              <div key={category}>
                <h3 className={`text-sm font-semibold ${theme.textMuted} mb-3 uppercase tracking-wider`}>
                  {category}
                </h3>
                <div className="space-y-2">
                  {categoryTools.map(toolName => {
                    const tool = UNIVERSAL_TOOL_DEFINITIONS[toolName as keyof typeof UNIVERSAL_TOOL_DEFINITIONS];
                    const isEnabled = enabledTools[toolName] !== false;
                    
                    return (
                      <div
                        key={toolName}
                        className={`p-4 rounded-xl border ${theme.border} ${isEnabled ? theme.bgPanel : 'bg-black/20'} hover:border-blue-500/30 transition-all cursor-pointer`}
                        onClick={() => toggleTool(toolName)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                            isEnabled 
                              ? 'bg-blue-500 border-blue-500' 
                              : `border-gray-600 ${theme.bgApp}`
                          }`}>
                            {isEnabled && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className={`font-medium text-sm ${isEnabled ? theme.textMain : theme.textMuted}`}>
                                {toolName}
                              </h4>
                              {!isEnabled && (
                                <span className="px-2 py-0.5 rounded text-[10px] bg-gray-500/20 text-gray-400 border border-gray-500/30">
                                  DISABLED
                                </span>
                              )}
                            </div>
                            <p className={`text-xs mt-1 ${theme.textMuted} ${!isEnabled && 'opacity-50'}`}>
                              {tool.description.split('\n')[0]}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredTools.length === 0 && (
            <div className="text-center py-12 opacity-50">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-yellow-500" />
              <p className={theme.textMuted}>No tools found matching "{searchQuery}"</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${theme.border} flex items-center justify-between`}>
          <p className={`text-xs ${theme.textMuted}`}>
            💡 Tip: Disabled tools won't be available to the AI
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg text-sm ${theme.bgPanel} ${theme.textMuted} hover:text-white border ${theme.border} hover:bg-white/5 transition-colors`}
            >
              Cancel
            </button>
            <button
              onClick={saveToolSettings}
              className="px-4 py-2 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to get enabled tools
export const getEnabledTools = (): string[] => {
  const saved = localStorage.getItem('enabledTools');
  if (!saved) {
    return Object.keys(UNIVERSAL_TOOL_DEFINITIONS);
  }
  const enabledTools = JSON.parse(saved);
  return Object.entries(enabledTools)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);
};
