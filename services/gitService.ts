import { ProjectFile, GitStatus, GitCommit, GitBranch, FileChange } from '../types';

// Simple Diff Logic (Replacment for complex diff libraries to keep it lightweight)
const simpleDiff = (oldText: string, newText: string): 'modified' | 'identical' => {
  return oldText.trim() === newText.trim() ? 'identical' : 'modified';
};

export interface GitConfig {
  userName?: string;
  userEmail?: string;
  remoteUrl?: string;
  branch?: string;
  autoCommit?: boolean;
}

interface GitState {
  projectId: string;
  branches: Record<string, GitBranch>;
  currentBranch: string;
  commits: GitCommit[];
  stagingArea: FileChange[];
  // We store a snapshot of the file structure at HEAD to speed up diffs
  headSnapshot: Record<string, string>; 
  config: GitConfig;
}

export class GitService {
  private static instance: GitService;
  private readonly STORAGE_PREFIX = 'codemend-git-v2-';

  public static getInstance(): GitService {
    if (!GitService.instance) GitService.instance = new GitService();
    return GitService.instance;
  }

  // Initialize
  async init(projectId: string, config: GitConfig = {}): Promise<void> {
    if (this.getGitState(projectId)) return; // Already initialized

    const initialState: GitState = {
      projectId,
      branches: {},
      currentBranch: 'main',
      commits: [],
      stagingArea: [],
      headSnapshot: {}, // Map of filename -> content
      config: {
        userName: config.userName || 'AI Assistant',
        userEmail: config.userEmail || 'bot@codemend.ai',
        remoteUrl: config.remoteUrl || '',
        branch: 'main'
      }
    };

    // Create Initial Commit (Empty)
    const initCommit: GitCommit = {
      id: this.generateHash(),
      message: 'Initial commit',
      author: initialState.config.userName!,
      timestamp: Date.now(),
      changes: [],
      branch: 'main'
    };

    initialState.commits.push(initCommit);
    initialState.branches['main'] = {
      name: 'main',
      head: initCommit.id,
      commits: [initCommit.id]
    };

    this.saveGitState(projectId, initialState);
  }

  // Get Status (Actual Diffing)
  async getStatus(projectId: string, currentFiles: ProjectFile[]): Promise<GitStatus> {
    const state = this.getGitState(projectId);
    if (!state) return { hasGit: false, changes: [], currentBranch: '', branches: [], ahead: 0, behind: 0 };

    const changes: FileChange[] = [];
    const headFiles = state.headSnapshot;

    // 1. Detect Modified & Added
    for (const file of currentFiles) {
      const originalContent = headFiles[file.name];
      
      if (originalContent === undefined) {
        changes.push({ type: 'added', file: file, currentContent: file.content });
      } else if (simpleDiff(originalContent, file.content) === 'modified') {
        changes.push({ 
          type: 'modified', 
          file: file, 
          previousContent: originalContent, 
          currentContent: file.content 
        });
      }
    }

    // 2. Detect Deleted
    const currentFileNames = new Set(currentFiles.map(f => f.name));
    for (const [name, content] of Object.entries(headFiles)) {
      if (!currentFileNames.has(name)) {
        changes.push({ 
          type: 'deleted', 
          file: { id: 'deleted', name, content, language: 'text' }, // Mock file for display
          previousContent: content 
        });
      }
    }

    return {
      hasGit: true,
      changes,
      currentBranch: state.currentBranch,
      branches: Object.keys(state.branches),
      ahead: 0,
      behind: 0
    };
  }

  // Commit
  async commit(projectId: string, message: string, currentFiles: ProjectFile[]): Promise<GitCommit> {
    const state = this.getGitState(projectId);
    if (!state) throw new Error("Git not initialized");

    const status = await this.getStatus(projectId, currentFiles);
    if (status.changes.length === 0) throw new Error("Nothing to commit (working tree clean)");

    const newCommit: GitCommit = {
      id: this.generateHash(),
      message,
      author: state.config.userName || 'User',
      timestamp: Date.now(),
      changes: status.changes, // Store the diff
      branch: state.currentBranch
    };

    // Update History
    state.commits.push(newCommit);
    state.branches[state.currentBranch].head = newCommit.id;
    state.branches[state.currentBranch].commits.push(newCommit.id);

    // Update HEAD Snapshot (This is the "checkout" state)
    // We update the internal map to reflect the new state of files
    status.changes.forEach(change => {
      if (change.type === 'deleted') {
        delete state.headSnapshot[change.file.name];
      } else {
        state.headSnapshot[change.file.name] = change.currentContent!;
      }
    });

    this.saveGitState(projectId, state);
    return newCommit;
  }

  // Checkout (Switch Branch)
  async checkout(projectId: string, branchName: string): Promise<Record<string, string>> {
    const state = this.getGitState(projectId);
    if (!state || !state.branches[branchName]) throw new Error(`Branch ${branchName} not found`);

    // In a real git, we would reconstruct the file system from the commit graph.
    // Here, we simplified by storing 'headSnapshot' only for the current branch.
    // To support switching, we need to rebuild snapshot. 
    // This is a complex operation for a browser mock, so we'll simulate logic:
    // 1. Find the commit HEAD of target branch
    // 2. Replay all changes from Initial Commit -> HEAD
    
    const targetHeadId = state.branches[branchName].head;
    const reconstructedFiles: Record<string, string> = {};

    // Replay history (simplistic linear replay)
    // Find path from root to targetHeadId
    const commitPath = this.getCommitPath(state, targetHeadId);
    
    commitPath.forEach(commit => {
      commit.changes.forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
          reconstructedFiles[change.file.name] = change.currentContent!;
        } else if (change.type === 'deleted') {
          delete reconstructedFiles[change.file.name];
        }
      });
    });

    // Update State
    state.currentBranch = branchName;
    state.headSnapshot = reconstructedFiles;
    this.saveGitState(projectId, state);

    return reconstructedFiles;
  }

  // Helper: Get linear history for reconstruction
  private getCommitPath(state: GitState, targetCommitId: string): GitCommit[] {
    // This assumes linear history for simplicity. 
    // Real git needs DAG traversal.
    const path: GitCommit[] = [];
    const target = state.commits.find(c => c.id === targetCommitId);
    if (!target) return [];

    // Simple hack: filter commits belonging to this branch's history
    // For a robust system, commits need 'parentId'
    // Here we just return all commits up to the target timestamp
    return state.commits.filter(c => c.timestamp <= target.timestamp);
  }

  // --- Helpers ---
  private getGitState(projectId: string): GitState | null {
    try {
      const data = localStorage.getItem(this.STORAGE_PREFIX + projectId);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  }

  private saveGitState(projectId: string, state: GitState) {
    try {
      localStorage.setItem(this.STORAGE_PREFIX + projectId, JSON.stringify(state));
    } catch (e) {
      console.error("Git Storage Limit Reached", e);
      // In production, fallback to IndexedDB
    }
  }

  private generateHash(): string {
    return Math.random().toString(16).substring(2, 10) + Date.now().toString(16).substring(4);
  }
}

export const gitService = GitService.getInstance();