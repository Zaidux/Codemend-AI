import * as React from 'react';
import { Settings, Zap, X, LayoutTemplate, MessageSquare, Database, Cpu, Key, UserCog, Plus, Trash2, Github } from 'lucide-react';
import { ThemeConfig, ThemeType, ViewMode, LLMConfig, LLMProvider, AgentRole } from '../types';
import { THEMES, AVAILABLE_MODELS } from '../constants';

interface SettingsModalProps {
  theme: ThemeConfig;
  themeName: ThemeType;
  setThemeName: (t: ThemeType) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  highCapacity: boolean;
  setHighCapacity: (b: boolean) => void;
  llmConfig: LLMConfig;
  setLlmConfig: (c: LLMConfig) => void;
  roles: AgentRole[];
  setRoles: (r: AgentRole[]) => void;
  onClose: () => void;
  useStreaming: boolean; // Added
  setUseStreaming: (b: boolean) => void; // Added
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  theme, themeName, setThemeName,
  viewMode, setViewMode,
  highCapacity, setHighCapacity,
  llmConfig, setLlmConfig,
  roles, setRoles,
  onClose,
  useStreaming, setUseStreaming // Added
}) => {
  const [activeTab, setActiveTab] = React.useState<'general' | 'models' | 'roles'>('general');
  const [newRole, setNewRole] = React.useState<Partial<AgentRole>>({ name: '', description: '', systemPrompt: '' });
  const [isAddingRole, setIsAddingRole] = React.useState(false);

  const updateLLM = (key: keyof LLMConfig, value: any) => {
    setLlmConfig({ ...llmConfig, [key]: value });
  };

  const updateGitHub = (token: string) => {
      setLlmConfig({ ...llmConfig, github: { ...llmConfig.github, personalAccessToken: token } });
  };

  const handleAddRole = () => {
    if (newRole.name && newRole.systemPrompt) {
        const role: AgentRole = {
            id: 'role_' + Math.random().toString(36).substr(2, 9),
            name: newRole.name,
            description: newRole.description || '',
            systemPrompt: newRole.systemPrompt,
            isCustom: true
        };
        setRoles([...roles, role]);
        setNewRole({ name: '', description: '', systemPrompt: '' });
        setIsAddingRole(false);
    }
  };

  const handleDeleteRole = (id: string) => {
      setRoles(roles.filter(r => r.id !== id));
      if (llmConfig.plannerRoleId === id) updateLLM('plannerRoleId', roles[0].id);
      if (llmConfig.coderRoleId === id) updateLLM('coderRoleId', roles[0].id);
  };

  const modelOptions = AVAILABLE_MODELS[llmConfig.provider] || [];

  const ModelSelect = ({ label, valueKey }: { label: string, valueKey: keyof LLMConfig }) => (
      <div>
        <label className={`block text-xs font-bold ${theme.textMuted} mb-1 uppercase tracking-wider`}>{label}</label>
        <select 
            value={llmConfig[valueKey] as string || ''}
            onChange={(e) => updateLLM(valueKey, e.target.value)}
            className={`w-full ${theme.bgApp} border ${theme.border} rounded-lg px-3 py-2 text-sm ${theme.textMain}`}
        >
            {modelOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className={`${theme.bgPanel} border ${theme.border} rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]`}>

        {/* Header */}
        <div className={`p-6 border-b ${theme.border} flex justify-between items-center`}>
          <h2 className={`text-xl font-bold ${theme.textMain} flex items-center gap-2`}>
            <Settings className="w-5 h-5" /> Settings
          </h2>
          <button onClick={onClose} className={`${theme.textMuted} hover:text-white`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className={`px-6 pt-2 border-b ${theme.border} flex gap-4 overflow-x-auto no-scrollbar`}>
           <button onClick={() => setActiveTab('general')} className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'general' ? `${theme.accent} border-${theme.accent.replace('text-','')}` : 'border-transparent text-gray-500'}`}>
             General & Theme
           </button>
           <button onClick={() => setActiveTab('models')} className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'models' ? `${theme.accent} border-${theme.accent.replace('text-','')}` : 'border-transparent text-gray-500'}`}>
             APIs & Models
           </button>
           <button onClick={() => setActiveTab('roles')} className={`pb-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'roles' ? `${theme.accent} border-${theme.accent.replace('text-','')}` : 'border-transparent text-gray-500'}`}>
             Roles & Personas
           </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

          {activeTab === 'general' && (
            <>
              {/* Interface Layout */}
              <div>
                <label className={`block text-xs font-bold ${theme.textMuted} mb-3 uppercase tracking-wider`}>Interface Layout</label>
                <div className="flex gap-2">
                  <button onClick={() => setViewMode('classic')} className={`flex-1 px-3 py-3 rounded-lg text-sm font-medium border transition-all flex flex-col items-center gap-2 ${viewMode === 'classic' ? `${theme.button} border-transparent text-white` : `bg-white/5 border-transparent ${theme.textMuted} hover:bg-white/10`}`}>
                    <LayoutTemplate className="w-5 h-5" /> <span>Classic</span>
                  </button>
                  <button onClick={() => setViewMode('chat')} className={`flex-1 px-3 py-3 rounded-lg text-sm font-medium border transition-all flex flex-col items-center gap-2 ${viewMode === 'chat' ? `${theme.button} border-transparent text-white` : `bg-white/5 border-transparent ${theme.textMuted} hover:bg-white/10`}`}>
                    <MessageSquare className="w-5 h-5" /> <span>Chat Interface</span>
                  </button>
                </div>
              </div>

              {/* Theme */}
              <div>
                <label className={`block text-xs font-bold ${theme.textMuted} mb-3 uppercase tracking-wider`}>Theme</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {Object.keys(THEMES).map((tKey) => (
                    <button key={tKey} onClick={() => setThemeName(tKey as ThemeType)} className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium border transition-all capitalize ${themeName === tKey ? `${theme.button} border-transparent text-white` : `bg-white/5 border-transparent ${theme.textMuted} hover:bg-white/10`}`}>
                      {tKey}
                    </button>
                  ))}
                </div>
              </div>

              {/* High Capacity */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`flex items-center gap-2 text-sm font-medium ${theme.textMain}`}>
                    <Zap className={highCapacity ? "text-yellow-400 w-4 h-4" : "text-slate-500 w-4 h-4"} /> 
                    High Capacity Mode
                  </label>
                  <button onClick={() => setHighCapacity(!highCapacity)} className={`w-12 h-6 rounded-full transition-colors relative ${highCapacity ? theme.button : 'bg-slate-700'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${highCapacity ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
                <p className={`text-xs ${theme.textMuted}`}>Allows processing of larger files (requires supported model).</p>
              </div>

              {/* Streaming Responses */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`flex items-center gap-2 text-sm font-medium ${theme.textMain}`}>
                    <MessageSquare className={useStreaming ? "text-green-400 w-4 h-4" : "text-slate-500 w-4 h-4"} /> 
                    Streaming Responses
                  </label>
                  <button onClick={() => setUseStreaming(!useStreaming)} className={`w-12 h-6 rounded-full transition-colors relative ${useStreaming ? 'bg-green-600' : 'bg-slate-700'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${useStreaming ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
                <p className={`text-xs ${theme.textMuted}`}>Show responses as they're generated (not available for Gemini).</p>
              </div>
            </>
          )}

          {activeTab === 'models' && (
            <>
              {/* Provider Selection */}
              <div>
                <label className={`block text-xs font-bold ${theme.textMuted} mb-3 uppercase tracking-wider flex items-center gap-2`}>
                   <Database className="w-4 h-4" /> Provider
                </label>
                <div className="flex gap-2 mb-4">
                   {(['gemini', 'openai', 'openrouter'] as LLMProvider[]).map(p => (
                     <button
                       key={p}
                       onClick={() => updateLLM('provider', p)}
                       className={`flex-1 capitalize py-2 rounded-lg text-sm font-medium border ${llmConfig.provider === p ? `${theme.accent} ${theme.accentBg} border-${theme.accent.replace('text-', '')}/50` : `border-transparent bg-white/5 ${theme.textMuted}`}`}
                     >
                       {p}
                     </button>
                   ))}
                </div>
              </div>

              {/* API Key */}
              <div>
                 <label className={`block text-xs font-bold ${theme.textMuted} mb-2 uppercase tracking-wider flex items-center gap-2`}>
                    <Key className="w-4 h-4" /> Provider API Key
                 </label>
                 <input 
                   type="password" 
                   value={llmConfig.apiKey || ''}
                   onChange={(e) => updateLLM('apiKey', e.target.value)}
                   placeholder={llmConfig.provider === 'gemini' ? "Optional (Uses default if empty)" : "sk-..."}
                   className={`w-full ${theme.bgApp} border ${theme.border} rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-${theme.accent.replace('text-', '')}`}
                 />
              </div>

              {/* GitHub Token */}
              <div className="mt-4 pt-4 border-t border-white/5">
                 <label className={`block text-xs font-bold ${theme.textMuted} mb-2 uppercase tracking-wider flex items-center gap-2`}>
                    <Github className="w-4 h-4" /> GitHub Token (Optional)
                 </label>
                 <input 
                   type="password" 
                   value={llmConfig.github?.personalAccessToken || ''}
                   onChange={(e) => updateGitHub(e.target.value)}
                   placeholder="ghp_... (Required for Private Repos / Higher Rate Limits)"
                   className={`w-full ${theme.bgApp} border ${theme.border} rounded-lg px-4 py-2 text-sm focus:ring-1 focus:ring-${theme.accent.replace('text-', '')}`}
                 />
                 <p className={`text-xs ${theme.textMuted} mt-1`}>Used to clone repositories and (future) commit changes.</p>
              </div>

              {/* Model Assignment */}
              <div className="space-y-4 pt-4 border-t border-white/5">
                 <h3 className={`text-sm font-bold ${theme.textMain} flex items-center gap-2`}>
                   <Cpu className="w-4 h-4" /> Agent Model Assignments
                 </h3>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <ModelSelect label="Planner / Architect Model" valueKey="plannerModelId" />
                     <ModelSelect label="Coder / Developer Model" valueKey="coderModelId" />
                     <ModelSelect label="Chat / Conversation Model" valueKey="chatModelId" />
                     <ModelSelect label="Default / Fallback Model" valueKey="activeModelId" />
                 </div>
              </div>

              {/* Pipeline Role Assignment */}
              <div className={`p-4 rounded-xl border ${theme.border} bg-white/5 mt-4`}>
                 <h3 className={`text-sm font-bold ${theme.textMain} mb-4 flex items-center gap-2`}>
                   <UserCog className="w-4 h-4" /> Role Definitions
                 </h3>

                 <div className="space-y-4">
                    <div>
                       <label className={`block text-xs ${theme.textMuted} mb-1`}>Planner Persona</label>
                       <select 
                         value={llmConfig.plannerRoleId}
                         onChange={(e) => updateLLM('plannerRoleId', e.target.value)}
                         className={`w-full ${theme.bgApp} border ${theme.border} rounded-lg px-3 py-2 text-sm ${theme.textMain}`}
                       >
                          {roles.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                       </select>
                    </div>

                    <div>
                       <label className={`block text-xs ${theme.textMuted} mb-1`}>Coder Persona</label>
                       <select 
                         value={llmConfig.coderRoleId}
                         onChange={(e) => updateLLM('coderRoleId', e.target.value)}
                         className={`w-full ${theme.bgApp} border ${theme.border} rounded-lg px-3 py-2 text-sm ${theme.textMain}`}
                       >
                          {roles.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                       </select>
                    </div>
                 </div>
              </div>
            </>
          )}

          {activeTab === 'roles' && (
              <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className={`text-sm ${theme.textMuted}`}>Create custom personas for specific tasks.</p>
                    <button onClick={() => setIsAddingRole(true)} className={`px-3 py-1.5 rounded text-xs font-bold ${theme.button} text-white`}>
                        <Plus className="w-4 h-4 inline mr-1" /> New Role
                    </button>
                  </div>

                  {isAddingRole && (
                      <div className={`p-4 border ${theme.border} rounded-lg space-y-3 bg-white/5`}>
                          <input 
                            placeholder="Role Name (e.g. React Expert)" 
                            value={newRole.name} 
                            onChange={e => setNewRole({...newRole, name: e.target.value})}
                            className={`w-full ${theme.bgApp} border ${theme.border} rounded p-2 text-sm`}
                          />
                          <input 
                            placeholder="Short Description" 
                            value={newRole.description} 
                            onChange={e => setNewRole({...newRole, description: e.target.value})}
                            className={`w-full ${theme.bgApp} border ${theme.border} rounded p-2 text-sm`}
                          />
                          <textarea 
                            placeholder="System Prompt (How should the AI behave?)" 
                            value={newRole.systemPrompt} 
                            onChange={e => setNewRole({...newRole, systemPrompt: e.target.value})}
                            className={`w-full ${theme.bgApp} border ${theme.border} rounded p-2 text-sm h-24`}
                          />
                          <div className="flex gap-2">
                              <button onClick={handleAddRole} className={`px-4 py-2 rounded text-xs font-bold ${theme.button} text-white`}>Save</button>
                              <button onClick={() => setIsAddingRole(false)} className="px-4 py-2 rounded text-xs text-gray-400 hover:text-white">Cancel</button>
                          </div>
                      </div>
                  )}

                  <div className="space-y-2">
                      {roles.map(role => (
                          <div key={role.id} className={`p-3 border ${theme.border} rounded-lg ${theme.bgPanelHeader} flex justify-between items-start group`}>
                              <div>
                                  <h4 className={`text-sm font-bold ${theme.textMain}`}>{role.name} {role.isCustom && <span className="text-[10px] bg-white/10 px-1 rounded ml-2 text-gray-400">CUSTOM</span>}</h4>
                                  <p className={`text-xs ${theme.textMuted} mt-1`}>{role.description}</p>
                              </div>
                              {role.isCustom && (
                                  <button onClick={() => handleDeleteRole(role.id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                              )}
                          </div>
                      ))}
                  </div>
              </div>
          )}

        </div>

        {/* Footer */}
        <div className={`p-4 border-t ${theme.border} flex justify-end`}>
          <button onClick={onClose} className={`px-6 py-2 rounded-lg font-medium ${theme.button} ${theme.buttonHover} text-white`}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;