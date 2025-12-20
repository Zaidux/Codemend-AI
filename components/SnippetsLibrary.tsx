import * as React from 'react';
import { Copy, Trash2, Plus, X, Code, Tag, Search, Check } from 'lucide-react';

export interface CodeSnippet {
  id: string;
  title: string;
  description: string;
  code: string;
  language: string;
  tags: string[];
  createdAt: number;
  usageCount: number;
}

interface SnippetsLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertSnippet: (code: string) => void;
}

export const SnippetsLibrary: React.FC<SnippetsLibraryProps> = ({
  isOpen,
  onClose,
  onInsertSnippet,
}) => {
  const [snippets, setSnippets] = React.useState<CodeSnippet[]>(() => {
    const saved = localStorage.getItem('cm_code_snippets');
    return saved ? JSON.parse(saved) : getDefaultSnippets();
  });

  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedTag, setSelectedTag] = React.useState<string | null>(null);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newSnippet, setNewSnippet] = React.useState({
    title: '',
    description: '',
    code: '',
    language: 'javascript',
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = React.useState('');
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Save to localStorage
  React.useEffect(() => {
    localStorage.setItem('cm_code_snippets', JSON.stringify(snippets));
  }, [snippets]);

  // Get all unique tags
  const allTags = React.useMemo(() => {
    const tags = new Set<string>();
    snippets.forEach(s => s.tags.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [snippets]);

  // Filter snippets
  const filteredSnippets = React.useMemo(() => {
    return snippets.filter(snippet => {
      const matchesSearch = !searchQuery || 
        snippet.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        snippet.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        snippet.code.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTag = !selectedTag || snippet.tags.includes(selectedTag);
      
      return matchesSearch && matchesTag;
    });
  }, [snippets, searchQuery, selectedTag]);

  // Add snippet
  const handleAddSnippet = () => {
    if (!newSnippet.title.trim() || !newSnippet.code.trim()) return;

    const snippet: CodeSnippet = {
      id: Date.now().toString(),
      ...newSnippet,
      createdAt: Date.now(),
      usageCount: 0,
    };

    setSnippets(prev => [snippet, ...prev]);
    setNewSnippet({
      title: '',
      description: '',
      code: '',
      language: 'javascript',
      tags: [],
    });
    setTagInput('');
    setShowAddForm(false);
  };

  // Delete snippet
  const handleDeleteSnippet = (id: string) => {
    setSnippets(prev => prev.filter(s => s.id !== id));
  };

  // Copy snippet
  const handleCopySnippet = (snippet: CodeSnippet) => {
    navigator.clipboard.writeText(snippet.code);
    setCopiedId(snippet.id);
    setTimeout(() => setCopiedId(null), 2000);
    
    // Increment usage count
    setSnippets(prev => prev.map(s => 
      s.id === snippet.id ? { ...s, usageCount: s.usageCount + 1 } : s
    ));
  };

  // Insert snippet into editor
  const handleInsertSnippet = (snippet: CodeSnippet) => {
    onInsertSnippet(snippet.code);
    
    // Increment usage count
    setSnippets(prev => prev.map(s => 
      s.id === snippet.id ? { ...s, usageCount: s.usageCount + 1 } : s
    ));
    
    onClose();
  };

  // Add tag
  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !newSnippet.tags.includes(tag)) {
      setNewSnippet(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Code className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Code Snippets Library</h2>
          </div>
          <div className="flex items-center gap-2">
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-1 text-sm"
              >
                <Plus className="w-4 h-4" />
                New Snippet
              </button>
            )}
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="p-4 border-b bg-gray-50 space-y-3">
            <input
              type="text"
              value={newSnippet.title}
              onChange={(e) => setNewSnippet(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Snippet title..."
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <input
              type="text"
              value={newSnippet.description}
              onChange={(e) => setNewSnippet(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Description (optional)..."
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <select
                value={newSnippet.language}
                onChange={(e) => setNewSnippet(prev => ({ ...prev, language: e.target.value }))}
                className="px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
                <option value="jsx">JSX/React</option>
                <option value="json">JSON</option>
                <option value="bash">Bash</option>
              </select>
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="Add tags (press Enter)..."
                  className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {newSnippet.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs flex items-center gap-1">
                  {tag}
                  <button onClick={() => setNewSnippet(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <textarea
              value={newSnippet.code}
              onChange={(e) => setNewSnippet(prev => ({ ...prev, code: e.target.value }))}
              placeholder="Paste your code here..."
              className="w-full h-32 px-3 py-2 border rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddSnippet}
                disabled={!newSnippet.title.trim() || !newSnippet.code.trim()}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Add Snippet
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search snippets..."
              className="w-full pl-10 pr-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* Tags */}
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-2 py-1 rounded text-xs ${!selectedTag ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                className={`px-2 py-1 rounded text-xs ${selectedTag === tag ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Snippets List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredSnippets.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Code className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">No snippets found</p>
              <p className="text-sm">
                {searchQuery || selectedTag 
                  ? 'Try adjusting your search or filters'
                  : 'Create your first snippet to get started'}
              </p>
            </div>
          ) : (
            filteredSnippets.map(snippet => (
              <div key={snippet.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{snippet.title}</h3>
                    {snippet.description && (
                      <p className="text-sm text-gray-600 mt-1">{snippet.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                      <span className="px-2 py-0.5 bg-gray-100 rounded">{snippet.language}</span>
                      {snippet.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                          #{tag}
                        </span>
                      ))}
                      <span className="ml-auto">Used {snippet.usageCount} times</span>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-4">
                    <button
                      onClick={() => handleCopySnippet(snippet)}
                      className="p-2 hover:bg-gray-100 rounded"
                      title="Copy to clipboard"
                    >
                      {copiedId === snippet.id ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-600" />
                      )}
                    </button>
                    <button
                      onClick={() => handleInsertSnippet(snippet)}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                    >
                      Insert
                    </button>
                    <button
                      onClick={() => handleDeleteSnippet(snippet.id)}
                      className="p-2 hover:bg-red-50 rounded"
                      title="Delete snippet"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
                <pre className="mt-2 p-3 bg-gray-50 rounded text-xs font-mono overflow-x-auto max-h-32">
                  {snippet.code}
                </pre>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 flex items-center justify-between">
          <div>{filteredSnippets.length} {filteredSnippets.length === 1 ? 'snippet' : 'snippets'}</div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <kbd className="px-2 py-0.5 bg-white border rounded">Click</kbd>
              <span>to insert</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-2 py-0.5 bg-white border rounded">Copy</kbd>
              <span>for clipboard</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Default snippets
function getDefaultSnippets(): CodeSnippet[] {
  return [
    {
      id: '1',
      title: 'React useState Hook',
      description: 'Basic state management in React',
      code: `const [state, setState] = useState(initialValue);`,
      language: 'javascript',
      tags: ['react', 'hooks', 'state'],
      createdAt: Date.now(),
      usageCount: 0,
    },
    {
      id: '2',
      title: 'useEffect Hook',
      description: 'Side effects in React components',
      code: `useEffect(() => {
  // Effect code here
  
  return () => {
    // Cleanup code here
  };
}, [dependencies]);`,
      language: 'javascript',
      tags: ['react', 'hooks', 'lifecycle'],
      createdAt: Date.now(),
      usageCount: 0,
    },
    {
      id: '3',
      title: 'Async/Await Function',
      description: 'Async function with error handling',
      code: `async function fetchData() {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}`,
      language: 'javascript',
      tags: ['async', 'fetch', 'api'],
      createdAt: Date.now(),
      usageCount: 0,
    },
    {
      id: '4',
      title: 'Array Map',
      description: 'Transform array elements',
      code: `const newArray = array.map(item => {
  return transformedItem;
});`,
      language: 'javascript',
      tags: ['array', 'map', 'functional'],
      createdAt: Date.now(),
      usageCount: 0,
    },
    {
      id: '5',
      title: 'Python List Comprehension',
      description: 'Create a new list by transforming items',
      code: `new_list = [expression for item in iterable if condition]`,
      language: 'python',
      tags: ['python', 'list', 'comprehension'],
      createdAt: Date.now(),
      usageCount: 0,
    },
  ];
}
