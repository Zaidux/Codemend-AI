import * as React from 'react';
import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, X, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { errorDetectionService, DetectedError, ErrorCategory, ErrorSeverity } from '../services/errorDetectionService';

interface ErrorAnalysisPanelProps {
  sessionId?: string;
  theme: any;
}

export const ErrorAnalysisPanel: React.FC<ErrorAnalysisPanelProps> = ({ sessionId, theme }) => {
  const [errors, setErrors] = useState<DetectedError[]>([]);
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'critical'>('unresolved');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadErrors();
    const interval = setInterval(loadErrors, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [sessionId, filter]);

  const loadErrors = () => {
    let errorList: DetectedError[];
    
    if (sessionId) {
      errorList = errorDetectionService.getSessionErrors(sessionId);
    } else {
      errorList = errorDetectionService.getUnresolvedErrors();
    }

    // Apply filter
    if (filter === 'unresolved') {
      errorList = errorList.filter(e => !e.resolved);
    } else if (filter === 'critical') {
      errorList = errorList.filter(e => e.severity === ErrorSeverity.CRITICAL);
    }

    setErrors(errorList);
    setStats(errorDetectionService.getStats());
  };

  const getSeverityColor = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'text-red-600 bg-red-50 border-red-200';
      case ErrorSeverity.HIGH:
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case ErrorSeverity.MEDIUM:
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case ErrorSeverity.LOW:
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: ErrorSeverity) => {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return <AlertTriangle className="w-4 h-4" />;
      case ErrorSeverity.MEDIUM:
        return <Info className="w-4 h-4" />;
      case ErrorSeverity.LOW:
        return <Clock className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const handleResolveManually = (errorId: string) => {
    errorDetectionService.resolveError(errorId, 'user_intervention', 'Manually marked as resolved');
    loadErrors();
  };

  const toggleExpand = (errorId: string) => {
    setExpandedErrorId(expandedErrorId === errorId ? null : errorId);
  };

  if (errors.length === 0) {
    return (
      <div className={`p-8 text-center ${theme.textMuted}`}>
        <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No errors detected</p>
        {filter === 'unresolved' && (
          <p className="text-xs mt-1">All errors have been resolved!</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`p-4 border-b ${theme.border}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Error Analysis
          </h2>
          {stats && (
            <div className="text-xs text-gray-500">
              {stats.resolvedErrors}/{stats.totalErrors} resolved
            </div>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs rounded-full border transition-all ${
              filter === 'all'
                ? `${theme.button} text-white border-transparent`
                : `${theme.textMuted} border-${theme.border}`
            }`}
          >
            All ({stats?.totalErrors || 0})
          </button>
          <button
            onClick={() => setFilter('unresolved')}
            className={`px-3 py-1 text-xs rounded-full border transition-all ${
              filter === 'unresolved'
                ? `${theme.button} text-white border-transparent`
                : `${theme.textMuted} border-${theme.border}`
            }`}
          >
            Unresolved ({stats ? stats.totalErrors - stats.resolvedErrors : 0})
          </button>
          <button
            onClick={() => setFilter('critical')}
            className={`px-3 py-1 text-xs rounded-full border transition-all ${
              filter === 'critical'
                ? `${theme.button} text-white border-transparent`
                : `${theme.textMuted} border-${theme.border}`
            }`}
          >
            Critical ({stats?.errorsBySeverity?.critical || 0})
          </button>
        </div>
      </div>

      {/* Error List */}
      <div className="flex-1 overflow-y-auto">
        {errors.map(error => (
          <div
            key={error.id}
            className={`border-b ${theme.border} ${error.resolved ? 'opacity-60' : ''}`}
          >
            {/* Error Header */}
            <div
              onClick={() => toggleExpand(error.id)}
              className={`p-4 cursor-pointer hover:${theme.hover} transition-colors`}
            >
              <div className="flex items-start gap-3">
                {/* Severity Badge */}
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${getSeverityColor(error.severity)}`}>
                  {getSeverityIcon(error.severity)}
                  <span className="uppercase">{error.severity}</span>
                </div>

                {/* Error Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase">
                      {error.category.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTimestamp(error.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                    {error.message}
                  </p>
                  {error.context.toolName && (
                    <p className="text-xs text-gray-500 mt-1">
                      Tool: <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">{error.context.toolName}</code>
                    </p>
                  )}
                </div>

                {/* Expand Icon */}
                <div className={theme.textMuted}>
                  {expandedErrorId === error.id ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </div>
            </div>

            {/* Error Details (Expanded) */}
            {expandedErrorId === error.id && (
              <div className={`px-4 pb-4 ${theme.bg}`}>
                {/* Suggested Fix */}
                {error.suggestedFix && (
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Suggested Fix:
                    </h4>
                    <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-900 dark:text-blue-100">
                      {error.suggestedFix}
                    </div>
                  </div>
                )}

                {/* Debugging Suggestions */}
                <div className="mb-3">
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Debugging Suggestions:
                  </h4>
                  <ul className="space-y-1">
                    {errorDetectionService.generateDebuggingSuggestions(error).map((suggestion, idx) => (
                      <li key={idx} className="text-xs text-gray-600 dark:text-gray-400 pl-3">
                        • {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Stack Trace */}
                {error.stackTrace && (
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Stack Trace:
                    </h4>
                    <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto max-h-32">
                      {error.stackTrace}
                    </pre>
                  </div>
                )}

                {/* Context */}
                {Object.keys(error.context).length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Context:
                    </h4>
                    <div className="text-xs space-y-0.5">
                      {error.context.sessionId && (
                        <div>Session: <code className="text-xs">{error.context.sessionId.substring(0, 8)}...</code></div>
                      )}
                      {error.context.modelName && (
                        <div>Model: {error.context.modelName}</div>
                      )}
                      {error.context.attemptNumber && (
                        <div>Attempt: {error.context.attemptNumber}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Resolution */}
                {error.resolved && error.resolution && (
                  <div className="mb-3 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                    <h4 className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">
                      ✓ Resolved via {error.resolution.method.replace(/_/g, ' ')}
                    </h4>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {error.resolution.notes}
                    </p>
                    <p className="text-xs text-green-500 mt-1">
                      {formatTimestamp(error.resolution.timestamp)}
                    </p>
                  </div>
                )}

                {/* Actions */}
                {!error.resolved && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResolveManually(error.id)}
                      className={`px-3 py-1.5 text-xs rounded ${theme.button} text-white transition-all hover:opacity-90`}
                    >
                      Mark as Resolved
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stats Footer */}
      {stats && (
        <div className={`p-3 border-t ${theme.border} ${theme.bg}`}>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-xs text-gray-500">Critical</div>
              <div className="text-sm font-semibold text-red-600">
                {stats.errorsBySeverity.critical || 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">High</div>
              <div className="text-sm font-semibold text-orange-600">
                {stats.errorsBySeverity.high || 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Medium</div>
              <div className="text-sm font-semibold text-yellow-600">
                {stats.errorsBySeverity.medium || 0}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Low</div>
              <div className="text-sm font-semibold text-blue-600">
                {stats.errorsBySeverity.low || 0}
              </div>
            </div>
          </div>
          {stats.avgResolutionTime > 0 && (
            <div className="text-xs text-center text-gray-500 mt-2">
              Avg resolution: {Math.round(stats.avgResolutionTime / 1000)}s
            </div>
          )}
        </div>
      )}
    </div>
  );
};
