import * as React from 'react';
import { Search, X, MessageCircle, Calendar, FileText, Filter } from 'lucide-react';
import { Session, ChatMessage } from '../types';

interface ChatSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: Session[];
  onNavigateToSession: (sessionId: string, messageIndex?: number) => void;
}

interface SearchResult {
  sessionId: string;
  sessionTitle: string;
  messageIndex: number;
  message: ChatMessage;
  preview: string;
  matches: number;
}

export const ChatSearchModal: React.FC<ChatSearchModalProps> = ({
  isOpen,
  onClose,
  sessions,
  onNavigateToSession,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isRegex, setIsRegex] = React.useState(false);
  const [filterRole, setFilterRole] = React.useState<'all' | 'user' | 'assistant'>('all');
  const [filterDate, setFilterDate] = React.useState<'all' | 'today' | 'week' | 'month'>('all');
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);

  // Search function
  const performSearch = React.useCallback(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setSearching(true);
    const searchResults: SearchResult[] = [];

    try {
      const searchPattern = isRegex 
        ? new RegExp(searchQuery, 'gi')
        : new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      sessions.forEach(session => {
        // Filter by date
        if (filterDate !== 'all') {
          const age = now - session.lastModified;
          if (filterDate === 'today' && age > dayMs) return;
          if (filterDate === 'week' && age > 7 * dayMs) return;
          if (filterDate === 'month' && age > 30 * dayMs) return;
        }

        session.messages.forEach((message, index) => {
          // Filter by role
          if (filterRole !== 'all' && message.role !== filterRole) return;

          const content = typeof message.content === 'string' 
            ? message.content 
            : message.content.map(c => c.type === 'text' ? c.text : '').join(' ');

          const matches = content.match(searchPattern);
          if (matches && matches.length > 0) {
            // Extract preview with context
            const matchIndex = content.toLowerCase().indexOf(searchQuery.toLowerCase());
            const start = Math.max(0, matchIndex - 50);
            const end = Math.min(content.length, matchIndex + searchQuery.length + 50);
            let preview = content.substring(start, end);
            if (start > 0) preview = '...' + preview;
            if (end < content.length) preview = preview + '...';

            // Highlight the match
            preview = preview.replace(
              searchPattern,
              (match) => `<mark class="bg-yellow-300">${match}</mark>`
            );

            searchResults.push({
              sessionId: session.id,
              sessionTitle: session.title,
              messageIndex: index,
              message,
              preview,
              matches: matches.length,
            });
          }
        });
      });

      // Sort by relevance (most matches first)
      searchResults.sort((a, b) => b.matches - a.matches);
      setResults(searchResults);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    }

    setSearching(false);
  }, [searchQuery, isRegex, filterRole, filterDate, sessions]);

  // Auto-search on query/filter change
  React.useEffect(() => {
    const timer = setTimeout(performSearch, 300);
    return () => clearTimeout(timer);
  }, [performSearch]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-20">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold">Search Chat History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages... (supports regex)"
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">Filters:</span>
            </div>

            {/* Role Filter */}
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as any)}
              className="px-2 py-1 border rounded text-xs"
            >
              <option value="all">All messages</option>
              <option value="user">User only</option>
              <option value="assistant">AI only</option>
            </select>

            {/* Date Filter */}
            <select
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value as any)}
              className="px-2 py-1 border rounded text-xs"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>

            {/* Regex Toggle */}
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={isRegex}
                onChange={(e) => setIsRegex(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs">Regex</span>
            </label>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {searching && (
            <div className="text-center py-8 text-gray-500">
              Searching...
            </div>
          )}

          {!searching && searchQuery && results.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No results found for "{searchQuery}"
            </div>
          )}

          {!searching && !searchQuery && (
            <div className="text-center py-8 text-gray-400">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Enter a search query to find messages across all sessions</p>
              <p className="text-sm mt-2">Supports text search and regex patterns</p>
            </div>
          )}

          {!searching && results.length > 0 && (
            <>
              <div className="text-sm text-gray-600 mb-3">
                Found {results.length} {results.length === 1 ? 'result' : 'results'}
              </div>
              {results.map((result, index) => (
                <div
                  key={`${result.sessionId}-${result.messageIndex}-${index}`}
                  onClick={() => {
                    onNavigateToSession(result.sessionId, result.messageIndex);
                    onClose();
                  }}
                  className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm">
                      <MessageCircle className="w-4 h-4 text-blue-500" />
                      <span className="font-medium">{result.sessionTitle}</span>
                      <span className="text-gray-400">·</span>
                      <span className="text-gray-500 capitalize">{result.message.role}</span>
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(result.message.timestamp || Date.now()).toLocaleDateString()}
                    </div>
                  </div>
                  <div
                    className="text-sm text-gray-700 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: result.preview }}
                  />
                  {result.matches > 1 && (
                    <div className="mt-2 text-xs text-blue-600">
                      {result.matches} matches in this message
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t bg-gray-50 text-xs text-gray-500 flex items-center gap-4">
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white border rounded">Cmd/Ctrl+F</kbd>
            <span>to search</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 bg-white border rounded">Esc</kbd>
            <span>to close</span>
          </div>
          <div className="flex-1" />
          <div className="text-gray-400">
            Searching {sessions.reduce((sum, s) => sum + s.messages.length, 0)} messages across {sessions.length} sessions
          </div>
        </div>
      </div>
    </div>
  );
};
