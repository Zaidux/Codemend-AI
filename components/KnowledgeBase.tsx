
import * as React from 'react';
import { Book, Plus, Download, Trash2, Tag, Search } from 'lucide-react';
import { ThemeConfig, KnowledgeEntry } from '../types';

interface KnowledgeBaseProps {
  entries: KnowledgeEntry[];
  onAdd: (entry: KnowledgeEntry) => void;
  onRemove: (id: string) => void;
  theme: ThemeConfig;
}

const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ entries, onAdd, onRemove, theme }) => {
  const [newContent, setNewContent] = React.useState('');
  const [newTags, setNewTags] = React.useState('');
  const [filter, setFilter] = React.useState('');

  const handleAdd = () => {
    if (!newContent.trim()) return;
    
    const tags = newTags.split(',').map(t => t.trim().startsWith('#') ? t.trim() : '#' + t.trim()).filter(t => t !== '#');
    
    const entry: KnowledgeEntry = {
        id: crypto.randomUUID(),
        content: newContent,
        tags: tags.length > 0 ? tags : ['#general'],
        scope: 'global',
        timestamp: Date.now()
    };
    
    onAdd(entry);
    setNewContent('');
    setNewTags('');
  };

  const handleExport = () => {
      // JSONL Format for Fine-Tuning
      const jsonl = entries.map(e => JSON.stringify({
          messages: [
              { role: "system", content: "You are a helpful assistant." },
              { role: "user", content: `Explain the concept related to ${e.tags.join(' ')}` },
              { role: "assistant", content: e.content }
          ]
      })).join('\n');
      
      const blob = new Blob([jsonl], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'codemend_knowledge_finetune.jsonl';
      a.click();
  };

  const filteredEntries = entries.filter(e => 
      e.content.toLowerCase().includes(filter.toLowerCase()) || 
      e.tags.some(t => t.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div className={`flex flex-col h-full ${theme.bgApp} p-4`}>
       <div className="flex justify-between items-center mb-6">
           <div>
               <h2 className={`text-xl font-bold ${theme.textMain} flex items-center gap-2`}>
                   <Book className="w-5 h-5 text-yellow-500" /> Knowledge Base
               </h2>
               <p className={`text-xs ${theme.textMuted}`}>Teach the AI specific patterns. Reference them in chat using #tags.</p>
           </div>
           <button onClick={handleExport} className={`flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 ${theme.textMain} text-xs border ${theme.border}`}>
               <Download className="w-3 h-3" /> Export JSONL
           </button>
       </div>

       {/* Input Area */}
       <div className={`p-4 rounded-xl border ${theme.border} ${theme.bgPanel} mb-6 space-y-3`}>
           <input 
             value={newTags}
             onChange={(e) => setNewTags(e.target.value)}
             placeholder="Tags (e.g., #auth, #my-component) - comma separated"
             className={`w-full ${theme.bgApp} border ${theme.border} rounded px-3 py-2 text-sm focus:outline-none focus:border-${theme.accent.replace('text-', '')}`}
           />
           <textarea 
             value={newContent}
             onChange={(e) => setNewContent(e.target.value)}
             placeholder="What should the AI learn? (e.g., 'Always use a CustomButton component for actions...')"
             className={`w-full ${theme.bgApp} border ${theme.border} rounded px-3 py-2 text-sm h-24 resize-none focus:outline-none focus:border-${theme.accent.replace('text-', '')}`}
           />
           <div className="flex justify-end">
               <button onClick={handleAdd} className={`px-4 py-2 rounded-lg font-bold text-xs ${theme.button} text-white flex items-center gap-1`}>
                   <Plus className="w-4 h-4" /> Add Memory
               </button>
           </div>
       </div>

       {/* Search & List */}
       <div className="relative mb-4">
           <Search className={`absolute left-3 top-2.5 w-4 h-4 ${theme.textMuted}`} />
           <input 
             value={filter}
             onChange={(e) => setFilter(e.target.value)}
             placeholder="Search memories..."
             className={`w-full pl-9 ${theme.bgApp} border ${theme.border} rounded-lg py-2 text-sm focus:outline-none`}
           />
       </div>

       <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
           {filteredEntries.map(entry => (
               <div key={entry.id} className={`p-3 rounded-lg border ${theme.border} ${theme.bgPanel} group hover:border-${theme.accent.replace('text-', '')}/50 transition-colors`}>
                   <div className="flex justify-between items-start mb-2">
                       <div className="flex flex-wrap gap-1">
                           {entry.tags.map(tag => (
                               <span key={tag} className={`px-2 py-0.5 rounded-full text-[10px] bg-white/5 ${theme.textMuted} border border-white/5 flex items-center gap-1`}>
                                   <Tag className="w-2.5 h-2.5" /> {tag}
                               </span>
                           ))}
                       </div>
                       <button onClick={() => onRemove(entry.id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                           <Trash2 className="w-4 h-4" />
                       </button>
                   </div>
                   <p className={`text-sm ${theme.textMain} whitespace-pre-wrap`}>{entry.content}</p>
                   <div className={`mt-2 text-[10px] ${theme.textMuted} flex justify-end`}>
                       {new Date(entry.timestamp).toLocaleDateString()}
                   </div>
               </div>
           ))}
           {filteredEntries.length === 0 && (
               <div className={`text-center py-10 ${theme.textMuted} italic text-sm`}>
                   No memories found. Start teaching the AI!
               </div>
           )}
       </div>
    </div>
  );
};

export default KnowledgeBase;
