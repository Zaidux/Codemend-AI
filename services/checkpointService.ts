import { ChatMessage } from '../types';

export interface Checkpoint {
  id: string;
  timestamp: number;
  messages: ChatMessage[];
  currentTask?: string;
  filesInProgress: string[];
  partialChanges: Array<{
    fileName: string;
    operation: 'create' | 'update' | 'delete';
    content?: string;
    completed: boolean;
  }>;
  errorContext?: {
    error: string;
    lastSuccessfulAction?: string;
    nextPlannedAction?: string;
  };
  aiContext: {
    currentGoal: string;
    completedSteps: string[];
    remainingSteps: string[];
    filesAnalyzed: string[];
    decisionsLog: string[];
  };
}

export class CheckpointService {
  private static instance: CheckpointService;
  private checkpoints: Map<string, Checkpoint> = new Map();
  private currentCheckpointId: string | null = null;
  private autoSaveInterval: number = 30000; // 30 seconds
  private autoSaveTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.loadCheckpoints();
  }

  static getInstance(): CheckpointService {
    if (!CheckpointService.instance) {
      CheckpointService.instance = new CheckpointService();
    }
    return CheckpointService.instance;
  }

  /**
   * Create a new checkpoint
   */
  createCheckpoint(
    messages: ChatMessage[],
    aiContext: Checkpoint['aiContext'],
    currentTask?: string
  ): string {
    const id = `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const checkpoint: Checkpoint = {
      id,
      timestamp: Date.now(),
      messages: JSON.parse(JSON.stringify(messages)), // Deep copy
      currentTask,
      filesInProgress: [],
      partialChanges: [],
      aiContext: JSON.parse(JSON.stringify(aiContext))
    };

    this.checkpoints.set(id, checkpoint);
    this.currentCheckpointId = id;
    this.saveCheckpoints();
    
    return id;
  }

  /**
   * Update the current checkpoint with progress
   */
  updateCheckpoint(update: Partial<Checkpoint>): void {
    if (!this.currentCheckpointId) return;
    
    const checkpoint = this.checkpoints.get(this.currentCheckpointId);
    if (!checkpoint) return;

    Object.assign(checkpoint, update, { timestamp: Date.now() });
    this.saveCheckpoints();
  }

  /**
   * Add a file to the in-progress list
   */
  addFileInProgress(fileName: string): void {
    if (!this.currentCheckpointId) return;
    
    const checkpoint = this.checkpoints.get(this.currentCheckpointId);
    if (!checkpoint) return;

    if (!checkpoint.filesInProgress.includes(fileName)) {
      checkpoint.filesInProgress.push(fileName);
      this.saveCheckpoints();
    }
  }

  /**
   * Record a partial change
   */
  recordPartialChange(
    fileName: string,
    operation: 'create' | 'update' | 'delete',
    content?: string,
    completed: boolean = false
  ): void {
    if (!this.currentCheckpointId) return;
    
    const checkpoint = this.checkpoints.get(this.currentCheckpointId);
    if (!checkpoint) return;

    const existingIndex = checkpoint.partialChanges.findIndex(
      c => c.fileName === fileName && c.operation === operation
    );

    const change = { fileName, operation, content, completed };

    if (existingIndex >= 0) {
      checkpoint.partialChanges[existingIndex] = change;
    } else {
      checkpoint.partialChanges.push(change);
    }

    this.saveCheckpoints();
  }

  /**
   * Mark an error occurred
   */
  recordError(error: string, lastAction?: string, nextAction?: string): void {
    if (!this.currentCheckpointId) return;
    
    const checkpoint = this.checkpoints.get(this.currentCheckpointId);
    if (!checkpoint) return;

    checkpoint.errorContext = {
      error,
      lastSuccessfulAction: lastAction,
      nextPlannedAction: nextAction
    };

    this.saveCheckpoints();
  }

  /**
   * Get the current checkpoint
   */
  getCurrentCheckpoint(): Checkpoint | null {
    if (!this.currentCheckpointId) return null;
    return this.checkpoints.get(this.currentCheckpointId) || null;
  }

  /**
   * Get a checkpoint by ID
   */
  getCheckpoint(id: string): Checkpoint | null {
    return this.checkpoints.get(id) || null;
  }

  /**
   * Generate a resume prompt from checkpoint
   */
  generateResumePrompt(additionalContext?: string): string {
    const checkpoint = this.getCurrentCheckpoint();
    if (!checkpoint) return '';

    const { aiContext, partialChanges, errorContext, currentTask } = checkpoint;

    let prompt = `**RESUME FROM CHECKPOINT**\n\n`;
    
    if (currentTask) {
      prompt += `**Current Task**: ${currentTask}\n\n`;
    }

    prompt += `**Context Summary**:\n`;
    prompt += `- Goal: ${aiContext.currentGoal}\n`;
    prompt += `- Files Analyzed: ${aiContext.filesAnalyzed.join(', ') || 'None'}\n`;
    
    if (aiContext.completedSteps.length > 0) {
      prompt += `\n**Completed Steps**:\n`;
      aiContext.completedSteps.forEach((step, i) => {
        prompt += `${i + 1}. ✅ ${step}\n`;
      });
    }

    if (partialChanges.length > 0) {
      prompt += `\n**Partial Changes**:\n`;
      partialChanges.forEach(change => {
        const status = change.completed ? '✅' : '🔄';
        prompt += `${status} ${change.operation.toUpperCase()} ${change.fileName}\n`;
      });
    }

    if (aiContext.remainingSteps.length > 0) {
      prompt += `\n**Remaining Steps**:\n`;
      aiContext.remainingSteps.forEach((step, i) => {
        prompt += `${i + 1}. ⏳ ${step}\n`;
      });
    }

    if (errorContext) {
      prompt += `\n**Error Encountered**: ${errorContext.error}\n`;
      if (errorContext.lastSuccessfulAction) {
        prompt += `- Last successful action: ${errorContext.lastSuccessfulAction}\n`;
      }
      if (errorContext.nextPlannedAction) {
        prompt += `- Next planned action: ${errorContext.nextPlannedAction}\n`;
      }
    }

    if (additionalContext) {
      prompt += `\n**Additional Context**:\n${additionalContext}\n`;
    }

    prompt += `\n**Instructions**: Continue from where you left off. ${
      errorContext 
        ? 'Address the error and complete the remaining steps.' 
        : 'Complete the remaining steps without breaking existing functionality.'
    }\n`;

    return prompt;
  }

  /**
   * Clear current checkpoint
   */
  clearCurrentCheckpoint(): void {
    if (this.currentCheckpointId) {
      this.checkpoints.delete(this.currentCheckpointId);
      this.currentCheckpointId = null;
      this.saveCheckpoints();
    }
  }

  /**
   * Start auto-saving checkpoints
   */
  startAutoSave(callback: () => void): void {
    this.stopAutoSave();
    this.autoSaveTimer = setInterval(callback, this.autoSaveInterval);
  }

  /**
   * Stop auto-saving
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Save checkpoints to localStorage
   */
  private saveCheckpoints(): void {
    try {
      const data = {
        checkpoints: Array.from(this.checkpoints.entries()),
        currentCheckpointId: this.currentCheckpointId
      };
      localStorage.setItem('codemend_checkpoints', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save checkpoints:', error);
    }
  }

  /**
   * Load checkpoints from localStorage
   */
  private loadCheckpoints(): void {
    try {
      const data = localStorage.getItem('codemend_checkpoints');
      if (data) {
        const parsed = JSON.parse(data);
        this.checkpoints = new Map(parsed.checkpoints);
        this.currentCheckpointId = parsed.currentCheckpointId;
      }
    } catch (error) {
      console.error('Failed to load checkpoints:', error);
    }
  }

  /**
   * Get all checkpoints (for debugging)
   */
  getAllCheckpoints(): Checkpoint[] {
    return Array.from(this.checkpoints.values());
  }

  /**
   * Clean old checkpoints (keep last 10)
   */
  cleanOldCheckpoints(): void {
    const sorted = Array.from(this.checkpoints.values())
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (sorted.length > 10) {
      const toDelete = sorted.slice(10);
      toDelete.forEach(cp => this.checkpoints.delete(cp.id));
      this.saveCheckpoints();
    }
  }
}

export default CheckpointService;
