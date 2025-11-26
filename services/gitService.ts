import { Project, ProjectFile, GitStatus, GitCommit, GitBranch, FileChange } from '../types';

export interface GitConfig {
  userName?: string;
  userEmail?: string;
  remoteUrl?: string;
  branch?: string;
  autoCommit?: boolean;
  commitMessageTemplate?: string;
}

export class GitService {
  private static instance: GitService;

  public static getInstance(): GitService {
    if (!GitService.instance) {
      GitService.instance = new GitService();
    }
    return GitService.instance;
  }

  // Initialize git for a project
  async init(projectId: string, config: GitConfig = {}): Promise<void> {
    const gitState = this.getGitState(projectId) || {
      projectId,
      branches: {},
      currentBranch: 'main',
      commits: [],
      config: {
        userName: config.userName || 'CodeMend AI',
        userEmail: config.userEmail || 'ai@codemend.com',
        remoteUrl: config.remoteUrl,
        branch: config.branch || 'main',
        autoCommit: config.autoCommit || false,
        commitMessageTemplate: config.commitMessageTemplate || 'feat: {changes}'
      }
    };

    // Create initial commit if no commits exist
    if (gitState.commits.length === 0) {
      const initialCommit: GitCommit = {
        id: this.generateCommitId(),
        message: 'Initial commit',
        author: `${gitState.config.userName} <${gitState.config.userEmail}>`,
        timestamp: Date.now(),
        changes: [],
        branch: gitState.currentBranch
      };

      gitState.commits.push(initialCommit);
      gitState.branches[gitState.currentBranch] = {
        name: gitState.currentBranch,
        head: initialCommit.id,
        commits: [initialCommit.id]
      };
    }

    this.saveGitState(projectId, gitState);
  }

  // Get git status for a project
  async getStatus(projectId: string, files: ProjectFile[]): Promise<GitStatus> {
    const gitState = this.getGitState(projectId);
    if (!gitState) {
      return {
        hasGit: false,
        changes: [],
        currentBranch: 'main',
        branches: [],
        ahead: 0,
        behind: 0
      };
    }

    const lastCommit = gitState.commits[gitState.commits.length - 1];
    const changes = await this.detectChangesSinceCommit(projectId, files, lastCommit);

    return {
      hasGit: true,
      changes: changes,
      currentBranch: gitState.currentBranch,
      branches: Object.keys(gitState.branches),
      ahead: 0, // Would need remote comparison
      behind: 0 // Would need remote comparison
    };
  }

  // Commit changes
  async commit(projectId: string, message: string, files: ProjectFile[]): Promise<GitCommit> {
    const gitState = this.getGitState(projectId);
    if (!gitState) {
      throw new Error('Git not initialized for this project');
    }

    const changes = await this.detectChangesSinceCommit(
      projectId, 
      files, 
      gitState.commits[gitState.commits.length - 1]
    );

    if (changes.length === 0) {
      throw new Error('No changes to commit');
    }

    const commit: GitCommit = {
      id: this.generateCommitId(),
      message: message,
      author: `${gitState.config.userName} <${gitState.config.userEmail}>`,
      timestamp: Date.now(),
      changes: changes,
      branch: gitState.currentBranch
    };

    gitState.commits.push(commit);
    
    // Update branch head
    if (gitState.branches[gitState.currentBranch]) {
      gitState.branches[gitState.currentBranch].head = commit.id;
      gitState.branches[gitState.currentBranch].commits.push(commit.id);
    }

    this.saveGitState(projectId, gitState);
    return commit;
  }

  // Auto-generate commit message based on changes
  generateCommitMessage(changes: FileChange[], template?: string): string {
    const added = changes.filter(c => c.type === 'added').length;
    const modified = changes.filter(c => c.type === 'modified').length;
    const deleted = changes.filter(c => c.type === 'deleted').length;

    const changeSummary = [];
    if (added > 0) changeSummary.push(`add ${added} file${added > 1 ? 's' : ''}`);
    if (modified > 0) changeSummary.push(`update ${modified} file${modified > 1 ? 's' : ''}`);
    if (deleted > 0) changeSummary.push(`delete ${deleted} file${deleted > 1 ? 's' : ''}`);

    const defaultMessage = `chore: ${changeSummary.join(', ')}`;
    
    if (!template) return defaultMessage;

    try {
      return template.replace('{changes}', changeSummary.join(', '));
    } catch {
      return defaultMessage;
    }
  }

  // Push to remote (simulated - would integrate with actual Git in production)
  async push(projectId: string): Promise<void> {
    const gitState = this.getGitState(projectId);
    if (!gitState) {
      throw new Error('Git not initialized for this project');
    }

    if (!gitState.config.remoteUrl) {
      throw new Error('No remote URL configured');
    }

    // Simulate push operation
    console.log(`Pushing to ${gitState.config.remoteUrl}...`);
    
    // In a real implementation, this would use the GitHub API or git commands
    // For now, we'll just simulate success
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Update last push timestamp
    gitState.lastPush = Date.now();
    this.saveGitState(projectId, gitState);
  }

  // Pull from remote (simulated - would integrate with GitHub service)
  async pull(projectId: string): Promise<FileChange[]> {
    const gitState = this.getGitState(projectId);
    if (!gitState) {
      throw new Error('Git not initialized for this project');
    }

    if (!gitState.config.remoteUrl) {
      throw new Error('No remote URL configured');
    }

    // Simulate pull operation
    console.log(`Pulling from ${gitState.config.remoteUrl}...`);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In a real implementation, this would fetch from the remote
    // and return the changes that need to be applied
    // For now, return empty changes
    return [];
  }

  // Get commit history
  async getHistory(projectId: string, limit: number = 50): Promise<GitCommit[]> {
    const gitState = this.getGitState(projectId);
    if (!gitState) {
      return [];
    }

    return gitState.commits.slice(-limit).reverse();
  }

  // Create new branch
  async createBranch(projectId: string, branchName: string, fromBranch?: string): Promise<void> {
    const gitState = this.getGitState(projectId);
    if (!gitState) {
      throw new Error('Git not initialized for this project');
    }

    if (gitState.branches[branchName]) {
      throw new Error(`Branch '${branchName}' already exists`);
    }

    const sourceBranch = fromBranch || gitState.currentBranch;
    const sourceHead = gitState.branches[sourceBranch]?.head;

    if (!sourceHead) {
      throw new Error(`Source branch '${sourceBranch}' not found`);
    }

    gitState.branches[branchName] = {
      name: branchName,
      head: sourceHead,
      commits: [...(gitState.branches[sourceBranch]?.commits || [])]
    };

    this.saveGitState(projectId, gitState);
  }

  // Switch branch
  async switchBranch(projectId: string, branchName: string): Promise<void> {
    const gitState = this.getGitState(projectId);
    if (!gitState) {
      throw new Error('Git not initialized for this project');
    }

    if (!gitState.branches[branchName]) {
      throw new Error(`Branch '${branchName}' not found`);
    }

    gitState.currentBranch = branchName;
    this.saveGitState(projectId, gitState);
  }

  // Get current branch
  async getCurrentBranch(projectId: string): Promise<string> {
    const gitState = this.getGitState(projectId);
    return gitState?.currentBranch || 'main';
  }

  // Detect changes since last commit
  private async detectChangesSinceCommit(
    projectId: string, 
    currentFiles: ProjectFile[], 
    sinceCommit: GitCommit
  ): Promise<FileChange[]> {
    // This would compare current files with the state at the given commit
    // For simplicity, we'll return all current files as modifications
    // In a real implementation, this would do proper diffing
    
    return currentFiles.map(file => ({
      type: 'modified' as const,
      file: file,
      previousContent: '', // Would be the content from the commit
      currentContent: file.content
    }));
  }

  // Private helper methods
  private getGitState(projectId: string): any {
    try {
      const stored = localStorage.getItem(`codemend-git-${projectId}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error reading git state:', error);
      return null;
    }
  }

  private saveGitState(projectId: string, state: any): void {
    localStorage.setItem(`codemend-git-${projectId}`, JSON.stringify(state));
  }

  private generateCommitId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

// Export singleton instance
export const gitService = GitService.getInstance();