import { LLMConfig, Project, ProjectFile, ChatMessage, ContextTransfer, ProjectSummary } from '../types';
import { contextService } from './contextService';

export class ModelSwitchService {
  private static instance: ModelSwitchService;

  public static getInstance(): ModelSwitchService {
    if (!ModelSwitchService.instance) {
      ModelSwitchService.instance = new ModelSwitchService();
    }
    return ModelSwitchService.instance;
  }

  // Prepare context for model switching
  async prepareContextTransfer(
    currentConfig: LLMConfig,
    targetConfig: LLMConfig,
    project: Project,
    files: ProjectFile[],
    conversation: ChatMessage[],
    currentTask: string,
    completedSteps: string[] = [],
    pendingSteps: string[] = []
  ): Promise<ContextTransfer> {
    try {
      // Generate project summary
      const projectSummary = await contextService.generateProjectSummary(project, files, currentConfig);
      
      // Generate file summaries
      const fileSummaries = await contextService.generateFileSummaries(files);
      
      // Compress conversation context
      const conversationContext = this.compressConversation(conversation);
      
      // Create context transfer object
      const transfer: ContextTransfer = {
        id: crypto.randomUUID(),
        sourceModel: `${currentConfig.provider}/${currentConfig.activeModelId}`,
        targetModel: `${targetConfig.provider}/${targetConfig.activeModelId}`,
        projectSummary,
        conversationContext,
        currentTask,
        completedSteps,
        pendingSteps,
        timestamp: Date.now()
      };

      // Store transfer context temporarily (in a real app, this would be in a database)
      this.storeTransferContext(transfer);

      return transfer;
    } catch (error) {
      console.error('Error preparing context transfer:', error);
      throw new Error(`Failed to prepare context transfer: ${error.message}`);
    }
  }

  // Apply context transfer to continue work with new model
  createContinuationPrompt(transfer: ContextTransfer): string {
    return `
CONTEXT TRANSFER - CONTINUING WORK

PREVIOUS MODEL: ${transfer.sourceModel}
CURRENT MODEL: ${transfer.targetModel}

PROJECT SUMMARY:
${transfer.projectSummary.summary}

COMPLETED STEPS:
${transfer.completedSteps.length > 0 ? transfer.completedSteps.map(step => `✓ ${step}`).join('\n') : 'No steps completed yet'}

PENDING STEPS:
${transfer.pendingSteps.length > 0 ? transfer.pendingSteps.map(step => `→ ${step}`).join('\n') : 'No specific steps defined'}

CURRENT TASK: ${transfer.currentTask}

CONVERSATION CONTEXT:
${transfer.conversationContext}

INSTRUCTIONS:
Continue working on the task above exactly where the previous model left off. Use the completed steps as reference and focus on the pending steps. Maintain consistency with the existing codebase and approach.
    `.trim();
  }

  // Detect if model switch is needed (rate limits, errors, etc.)
  shouldSwitchModel(
    currentConfig: LLMConfig,
    error: any,
    usageStats: { requests: number; errors: number },
    taskComplexity: 'low' | 'medium' | 'high'
  ): boolean {
    // Check for rate limiting errors
    if (error?.message?.includes('rate limit') || error?.message?.includes('quota')) {
      return true;
    }

    // Check for authentication errors
    if (error?.message?.includes('auth') || error?.message?.includes('key') || error?.message?.includes('token')) {
      return true;
    }

    // Check usage patterns for free tier models
    if (this.isFreeTierModel(currentConfig) && usageStats.requests > 50) {
      return true;
    }

    // Switch for high complexity tasks on limited models
    if (taskComplexity === 'high' && this.isLimitedModel(currentConfig)) {
      return true;
    }

    return false;
  }

  // Suggest alternative models based on current situation
  suggestAlternativeModels(
    currentConfig: LLMConfig,
    availableConfigs: LLMConfig[],
    reason: 'rate_limit' | 'complexity' | 'error' | 'cost'
  ): LLMConfig[] {
    const alternatives = availableConfigs.filter(config => 
      config.provider !== currentConfig.provider || 
      config.activeModelId !== currentConfig.activeModelId
    );

    // Sort by suitability based on reason
    return alternatives.sort((a, b) => {
      const aScore = this.calculateModelScore(a, reason);
      const bScore = this.calculateModelScore(b, reason);
      return bScore - aScore;
    }).slice(0, 3); // Return top 3 alternatives
  }

  // Private helper methods
  private compressConversation(conversation: ChatMessage[]): string {
    // Keep only the most relevant parts of conversation
    const relevantMessages = conversation.slice(-6); // Last 3 exchanges
    
    return relevantMessages.map(msg => {
      const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
      const content = msg.content.length > 200 ? 
        msg.content.substring(0, 200) + '...' : 
        msg.content;
      return `[${role}]: ${content}`;
    }).join('\n\n');
  }

  private storeTransferContext(transfer: ContextTransfer): void {
    // In a real application, this would store to a database
    // For now, we'll use sessionStorage for persistence during the session
    const key = `context_transfer_${transfer.id}`;
    sessionStorage.setItem(key, JSON.stringify(transfer));
    
    // Clean up old transfers (keep only last 5)
    this.cleanupOldTransfers();
  }

  private cleanupOldTransfers(): void {
    const keys = Object.keys(sessionStorage).filter(key => key.startsWith('context_transfer_'));
    if (keys.length > 5) {
      // Sort by timestamp and remove oldest
      const sorted = keys.map(key => ({
        key,
        timestamp: JSON.parse(sessionStorage.getItem(key) || '{}').timestamp || 0
      })).sort((a, b) => a.timestamp - b.timestamp);
      
      // Remove oldest ones beyond limit
      sorted.slice(0, sorted.length - 5).forEach(item => {
        sessionStorage.removeItem(item.key);
      });
    }
  }

  private isFreeTierModel(config: LLMConfig): boolean {
    const freeModels = [
      'gemini-2.0-flash-thinking-exp-01-21',
      'gpt-4o-mini',
      'deepseek/deepseek-r1:free',
      'kwaipilot/kat-coder-pro:free'
    ];
    return freeModels.includes(config.activeModelId);
  }

  private isLimitedModel(config: LLMConfig): boolean {
    const limitedModels = [
      'gemini-2.0-flash-thinking-exp-01-21',
      'gpt-4o-mini',
      'codellama:7b',
      'llama2:7b'
    ];
    return limitedModels.includes(config.activeModelId);
  }

  private calculateModelScore(config: LLMConfig, reason: string): number {
    let score = 0;

    // Base score on provider reliability
    const providerScores = {
      'openai': 90,
      'gemini': 85,
      'openrouter': 70,
      'local': 50
    };
    score += providerScores[config.provider] || 50;

    // Adjust based on reason
    switch (reason) {
      case 'rate_limit':
        // Prefer providers with higher limits
        if (config.provider === 'openai') score += 20;
        if (config.provider === 'gemini') score += 15;
        break;
      case 'complexity':
        // Prefer more capable models
        if (config.activeModelId.includes('pro') || config.activeModelId.includes('4o')) score += 30;
        if (config.activeModelId.includes('flash')) score += 20;
        break;
      case 'cost':
        // Prefer cheaper options
        if (this.isFreeTierModel(config)) score += 40;
        if (config.provider === 'local') score += 30;
        break;
    }

    return score;
  }
}

// Export singleton instance
export const modelSwitchService = ModelSwitchService.getInstance();