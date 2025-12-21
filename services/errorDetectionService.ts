import { ChatMessage } from '../types';

/**
 * Error Detection & Recovery Service
 * Monitors AI interactions, detects errors, analyzes patterns, and provides recovery mechanisms
 */

export enum ErrorCategory {
  SYNTAX_ERROR = 'syntax_error',
  RUNTIME_ERROR = 'runtime_error',
  TOOL_EXECUTION_ERROR = 'tool_execution_error',
  API_ERROR = 'api_error',
  NETWORK_ERROR = 'network_error',
  VALIDATION_ERROR = 'validation_error',
  TIMEOUT_ERROR = 'timeout_error',
  PERMISSION_ERROR = 'permission_error',
  UNKNOWN_ERROR = 'unknown_error'
}

export enum ErrorSeverity {
  LOW = 'low',          // Can continue, minor issue
  MEDIUM = 'medium',    // Degraded functionality
  HIGH = 'high',        // Major issue, needs attention
  CRITICAL = 'critical' // System failure, immediate intervention needed
}

export interface DetectedError {
  id: string;
  timestamp: number;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  stackTrace?: string;
  context: {
    sessionId?: string;
    toolName?: string;
    modelName?: string;
    inputPrompt?: string;
    attemptNumber?: number;
  };
  suggestedFix?: string;
  relatedErrors?: string[]; // IDs of similar errors
  resolved: boolean;
  resolution?: {
    method: 'auto_retry' | 'manual_fix' | 'user_intervention' | 'rollback';
    timestamp: number;
    notes: string;
  };
}

export interface ErrorPattern {
  pattern: string | RegExp;
  category: ErrorCategory;
  severity: ErrorSeverity;
  suggestedFix: string;
}

export interface ErrorStats {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  resolvedErrors: number;
  avgResolutionTime: number;
  commonPatterns: Array<{
    pattern: string;
    count: number;
    lastOccurrence: number;
  }>;
}

class ErrorDetectionService {
  private errors: DetectedError[] = [];
  private errorPatterns: ErrorPattern[] = [];
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second base delay

  constructor() {
    this.initializePatterns();
    this.loadErrors();
  }

  /**
   * Initialize common error patterns for detection
   */
  private initializePatterns(): void {
    this.errorPatterns = [
      // Syntax Errors
      {
        pattern: /SyntaxError|Unexpected token|Unexpected end of input/i,
        category: ErrorCategory.SYNTAX_ERROR,
        severity: ErrorSeverity.HIGH,
        suggestedFix: 'Check for missing brackets, quotes, or semicolons. Validate JSON syntax.'
      },
      {
        pattern: /JSON\.parse.*failed|Invalid JSON/i,
        category: ErrorCategory.SYNTAX_ERROR,
        severity: ErrorSeverity.MEDIUM,
        suggestedFix: 'Ensure JSON is properly formatted. Use JSON validator. Check for trailing commas.'
      },

      // Runtime Errors
      {
        pattern: /ReferenceError|is not defined/i,
        category: ErrorCategory.RUNTIME_ERROR,
        severity: ErrorSeverity.HIGH,
        suggestedFix: 'Variable or function is not declared. Check spelling and scope.'
      },
      {
        pattern: /TypeError|Cannot read property.*undefined|Cannot read properties of null/i,
        category: ErrorCategory.RUNTIME_ERROR,
        severity: ErrorSeverity.HIGH,
        suggestedFix: 'Add null/undefined checks before accessing properties.'
      },

      // Tool Execution Errors
      {
        pattern: /Tool execution failed|Tool not found/i,
        category: ErrorCategory.TOOL_EXECUTION_ERROR,
        severity: ErrorSeverity.MEDIUM,
        suggestedFix: 'Verify tool name and parameters. Check tool availability.'
      },

      // API Errors
      {
        pattern: /API.*error|401|403|429|500|502|503/i,
        category: ErrorCategory.API_ERROR,
        severity: ErrorSeverity.HIGH,
        suggestedFix: 'Check API credentials, rate limits, and service status.'
      },
      {
        pattern: /Rate limit exceeded/i,
        category: ErrorCategory.API_ERROR,
        severity: ErrorSeverity.MEDIUM,
        suggestedFix: 'Wait before retrying. Consider implementing backoff strategy.'
      },

      // Network Errors
      {
        pattern: /Network.*error|Failed to fetch|ECONNREFUSED|ETIMEDOUT/i,
        category: ErrorCategory.NETWORK_ERROR,
        severity: ErrorSeverity.MEDIUM,
        suggestedFix: 'Check internet connection. Verify API endpoint is accessible.'
      },

      // Validation Errors
      {
        pattern: /Validation.*failed|Invalid.*parameter|Missing required/i,
        category: ErrorCategory.VALIDATION_ERROR,
        severity: ErrorSeverity.LOW,
        suggestedFix: 'Verify all required parameters are provided with correct types.'
      },

      // Timeout Errors
      {
        pattern: /Timeout|Request.*timed out/i,
        category: ErrorCategory.TIMEOUT_ERROR,
        severity: ErrorSeverity.MEDIUM,
        suggestedFix: 'Increase timeout duration or optimize request.'
      },

      // Permission Errors
      {
        pattern: /Permission denied|Access denied|Unauthorized/i,
        category: ErrorCategory.PERMISSION_ERROR,
        severity: ErrorSeverity.HIGH,
        suggestedFix: 'Check user permissions and authentication credentials.'
      }
    ];
  }

  /**
   * Load errors from localStorage
   */
  private loadErrors(): void {
    try {
      const stored = localStorage.getItem('errorDetectionLog');
      if (stored) {
        this.errors = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load error log:', error);
    }
  }

  /**
   * Save errors to localStorage
   */
  private saveErrors(): void {
    try {
      localStorage.setItem('errorDetectionLog', JSON.stringify(this.errors));
    } catch (error) {
      console.error('Failed to save error log:', error);
    }
  }

  /**
   * Detect errors from AI message content
   */
  detectFromMessage(message: ChatMessage, sessionId?: string): DetectedError | null {
    const content = message.content.toLowerCase();
    
    // Check for error keywords
    if (!content.includes('error') && !content.includes('failed') && !content.includes('exception')) {
      return null;
    }

    // Try to match against known patterns
    for (const pattern of this.errorPatterns) {
      const regex = typeof pattern.pattern === 'string' 
        ? new RegExp(pattern.pattern, 'i')
        : pattern.pattern;

      if (regex.test(message.content)) {
        return this.createError({
          category: pattern.category,
          severity: pattern.severity,
          message: this.extractErrorMessage(message.content),
          stackTrace: this.extractStackTrace(message.content),
          context: {
            sessionId
          },
          suggestedFix: pattern.suggestedFix
        });
      }
    }

    // Unknown error pattern
    return this.createError({
      category: ErrorCategory.UNKNOWN_ERROR,
      severity: ErrorSeverity.MEDIUM,
      message: this.extractErrorMessage(message.content),
      stackTrace: this.extractStackTrace(message.content),
      context: { sessionId },
      suggestedFix: 'Review error details and consult documentation.'
    });
  }

  /**
   * Detect errors from tool execution
   */
  detectFromToolExecution(
    toolName: string,
    error: Error,
    sessionId?: string,
    attemptNumber: number = 1
  ): DetectedError {
    let category = ErrorCategory.TOOL_EXECUTION_ERROR;
    let severity = ErrorSeverity.MEDIUM;
    let suggestedFix = 'Check tool parameters and try again.';

    // Categorize based on error type
    if (error.name === 'SyntaxError') {
      category = ErrorCategory.SYNTAX_ERROR;
      severity = ErrorSeverity.HIGH;
      suggestedFix = 'Fix syntax errors in the code.';
    } else if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      category = ErrorCategory.RUNTIME_ERROR;
      severity = ErrorSeverity.HIGH;
      suggestedFix = 'Check variable definitions and types.';
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      category = ErrorCategory.NETWORK_ERROR;
      severity = ErrorSeverity.MEDIUM;
      suggestedFix = 'Check network connection and try again.';
    }

    return this.createError({
      category,
      severity,
      message: error.message,
      stackTrace: error.stack,
      context: {
        sessionId,
        toolName,
        attemptNumber
      },
      suggestedFix
    });
  }

  /**
   * Detect errors from API responses
   */
  detectFromAPIResponse(
    response: Response,
    endpoint: string,
    sessionId?: string
  ): DetectedError | null {
    if (response.ok) return null;

    let category = ErrorCategory.API_ERROR;
    let severity = ErrorSeverity.MEDIUM;
    let suggestedFix = 'Check API documentation and retry.';

    // Categorize based on status code
    if (response.status === 401 || response.status === 403) {
      category = ErrorCategory.PERMISSION_ERROR;
      severity = ErrorSeverity.HIGH;
      suggestedFix = 'Verify API credentials and permissions.';
    } else if (response.status === 429) {
      severity = ErrorSeverity.LOW;
      suggestedFix = 'Rate limit exceeded. Wait before retrying.';
    } else if (response.status >= 500) {
      severity = ErrorSeverity.HIGH;
      suggestedFix = 'Server error. Try again later or contact support.';
    }

    return this.createError({
      category,
      severity,
      message: `API request failed: ${response.status} ${response.statusText}`,
      context: {
        sessionId,
        toolName: endpoint
      },
      suggestedFix
    });
  }

  /**
   * Create and log a new error
   */
  private createError(data: Omit<DetectedError, 'id' | 'timestamp' | 'resolved' | 'relatedErrors'>): DetectedError {
    const error: DetectedError = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...data,
      resolved: false,
      relatedErrors: this.findRelatedErrors(data.message, data.category)
    };

    this.errors.push(error);
    this.saveErrors();

    return error;
  }

  /**
   * Find errors with similar messages or categories
   */
  private findRelatedErrors(message: string, category: ErrorCategory): string[] {
    const related: string[] = [];
    const messageLower = message.toLowerCase();

    for (const error of this.errors.slice(-50)) { // Check last 50 errors
      if (error.category === category && error.message.toLowerCase().includes(messageLower.split(' ')[0])) {
        related.push(error.id);
      }
    }

    return related.slice(0, 5); // Max 5 related errors
  }

  /**
   * Extract error message from content
   */
  private extractErrorMessage(content: string): string {
    // Try to extract the actual error message
    const errorMatch = content.match(/error[:\s]+([^\n]+)/i);
    if (errorMatch) {
      return errorMatch[1].trim();
    }

    // Try to find first sentence with error
    const sentences = content.split(/[.!?]\s/);
    for (const sentence of sentences) {
      if (sentence.toLowerCase().includes('error') || sentence.toLowerCase().includes('failed')) {
        return sentence.trim();
      }
    }

    return content.substring(0, 200); // First 200 chars
  }

  /**
   * Extract stack trace from content
   */
  private extractStackTrace(content: string): string | undefined {
    const stackMatch = content.match(/at\s+.*\(.*:\d+:\d+\)/);
    if (stackMatch) {
      const startIndex = content.indexOf(stackMatch[0]);
      return content.substring(startIndex, startIndex + 500);
    }
    return undefined;
  }

  /**
   * Determine if error should trigger auto-retry
   */
  shouldRetry(error: DetectedError): boolean {
    // Don't retry if already at max attempts
    if (error.context.attemptNumber && error.context.attemptNumber >= this.maxRetries) {
      return false;
    }

    // Retry for transient errors
    const retryableCategories = [
      ErrorCategory.NETWORK_ERROR,
      ErrorCategory.TIMEOUT_ERROR,
      ErrorCategory.API_ERROR
    ];

    return retryableCategories.includes(error.category) && 
           error.severity !== ErrorSeverity.CRITICAL;
  }

  /**
   * Get retry delay with exponential backoff
   */
  getRetryDelay(attemptNumber: number): number {
    return this.retryDelay * Math.pow(2, attemptNumber - 1);
  }

  /**
   * Mark error as resolved
   */
  resolveError(
    errorId: string,
    method: 'auto_retry' | 'manual_fix' | 'user_intervention' | 'rollback',
    notes: string
  ): void {
    const error = this.errors.find(e => e.id === errorId);
    if (error) {
      error.resolved = true;
      error.resolution = {
        method,
        timestamp: Date.now(),
        notes
      };
      this.saveErrors();
    }
  }

  /**
   * Get all errors for a session
   */
  getSessionErrors(sessionId: string): DetectedError[] {
    return this.errors.filter(e => e.context.sessionId === sessionId);
  }

  /**
   * Get unresolved errors
   */
  getUnresolvedErrors(): DetectedError[] {
    return this.errors.filter(e => !e.resolved);
  }

  /**
   * Get error statistics
   */
  getStats(): ErrorStats {
    const errorsByCategory: Record<ErrorCategory, number> = {
      [ErrorCategory.SYNTAX_ERROR]: 0,
      [ErrorCategory.RUNTIME_ERROR]: 0,
      [ErrorCategory.TOOL_EXECUTION_ERROR]: 0,
      [ErrorCategory.API_ERROR]: 0,
      [ErrorCategory.NETWORK_ERROR]: 0,
      [ErrorCategory.VALIDATION_ERROR]: 0,
      [ErrorCategory.TIMEOUT_ERROR]: 0,
      [ErrorCategory.PERMISSION_ERROR]: 0,
      [ErrorCategory.UNKNOWN_ERROR]: 0
    };

    const errorsBySeverity: Record<ErrorSeverity, number> = {
      [ErrorSeverity.LOW]: 0,
      [ErrorSeverity.MEDIUM]: 0,
      [ErrorSeverity.HIGH]: 0,
      [ErrorSeverity.CRITICAL]: 0
    };

    let totalResolutionTime = 0;
    let resolvedCount = 0;

    for (const error of this.errors) {
      errorsByCategory[error.category]++;
      errorsBySeverity[error.severity]++;

      if (error.resolved && error.resolution) {
        resolvedCount++;
        totalResolutionTime += error.resolution.timestamp - error.timestamp;
      }
    }

    return {
      totalErrors: this.errors.length,
      errorsByCategory,
      errorsBySeverity,
      resolvedErrors: resolvedCount,
      avgResolutionTime: resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0,
      commonPatterns: this.getCommonPatterns()
    };
  }

  /**
   * Get common error patterns
   */
  private getCommonPatterns(): Array<{ pattern: string; count: number; lastOccurrence: number }> {
    const patterns = new Map<string, { count: number; lastOccurrence: number }>();

    for (const error of this.errors) {
      const key = `${error.category}:${error.message.substring(0, 50)}`;
      const existing = patterns.get(key);

      if (existing) {
        existing.count++;
        existing.lastOccurrence = Math.max(existing.lastOccurrence, error.timestamp);
      } else {
        patterns.set(key, { count: 1, lastOccurrence: error.timestamp });
      }
    }

    return Array.from(patterns.entries())
      .map(([pattern, data]) => ({ pattern, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Generate debugging suggestions for an error
   */
  generateDebuggingSuggestions(error: DetectedError): string[] {
    const suggestions: string[] = [];

    // Add pattern-based suggestion
    if (error.suggestedFix) {
      suggestions.push(error.suggestedFix);
    }

    // Add category-specific suggestions
    switch (error.category) {
      case ErrorCategory.SYNTAX_ERROR:
        suggestions.push('Use a linter or code formatter to catch syntax issues');
        suggestions.push('Check for matching brackets and quotes');
        break;

      case ErrorCategory.RUNTIME_ERROR:
        suggestions.push('Add console.log statements to debug variable values');
        suggestions.push('Use try-catch blocks to handle errors gracefully');
        break;

      case ErrorCategory.TOOL_EXECUTION_ERROR:
        suggestions.push('Verify tool parameters match expected schema');
        suggestions.push('Check tool documentation for usage examples');
        break;

      case ErrorCategory.API_ERROR:
        suggestions.push('Check API service status page');
        suggestions.push('Verify API keys and authentication');
        suggestions.push('Review API rate limits and quotas');
        break;

      case ErrorCategory.NETWORK_ERROR:
        suggestions.push('Check internet connection');
        suggestions.push('Verify firewall and proxy settings');
        suggestions.push('Try accessing the endpoint in a browser');
        break;
    }

    // Add severity-specific suggestions
    if (error.severity === ErrorSeverity.CRITICAL) {
      suggestions.push('⚠️ CRITICAL: Consider rolling back to last known good state');
      suggestions.push('Contact support or check system logs immediately');
    }

    // Add related errors suggestion
    if (error.relatedErrors && error.relatedErrors.length > 0) {
      suggestions.push(`This error is similar to ${error.relatedErrors.length} other recent errors`);
    }

    return suggestions;
  }

  /**
   * Create error report for planner AI
   */
  createPlannerReport(sessionId: string): string {
    const sessionErrors = this.getSessionErrors(sessionId);
    
    if (sessionErrors.length === 0) {
      return 'No errors detected in this session.';
    }

    const unresolved = sessionErrors.filter(e => !e.resolved);
    const critical = sessionErrors.filter(e => e.severity === ErrorSeverity.CRITICAL);

    let report = `## Error Report for Session\n\n`;
    report += `**Total Errors:** ${sessionErrors.length}\n`;
    report += `**Unresolved:** ${unresolved.length}\n`;
    report += `**Critical:** ${critical.length}\n\n`;

    if (critical.length > 0) {
      report += `### 🔴 Critical Errors\n\n`;
      for (const error of critical) {
        report += `- **${error.category}**: ${error.message}\n`;
        report += `  - Suggested Fix: ${error.suggestedFix}\n`;
        report += `  - Timestamp: ${new Date(error.timestamp).toLocaleString()}\n\n`;
      }
    }

    if (unresolved.length > 0) {
      report += `### Unresolved Errors\n\n`;
      for (const error of unresolved.slice(0, 5)) {
        report += `- **${error.category}** (${error.severity}): ${error.message}\n`;
        if (error.suggestedFix) {
          report += `  - Fix: ${error.suggestedFix}\n`;
        }
      }
    }

    return report;
  }

  /**
   * Clear old resolved errors (keep last 100)
   */
  clearOldErrors(): void {
    const resolved = this.errors.filter(e => e.resolved);
    const unresolved = this.errors.filter(e => !e.resolved);

    if (resolved.length > 100) {
      // Keep only last 100 resolved errors
      resolved.sort((a, b) => b.timestamp - a.timestamp);
      this.errors = [...unresolved, ...resolved.slice(0, 100)];
      this.saveErrors();
    }
  }
}

export const errorDetectionService = new ErrorDetectionService();
