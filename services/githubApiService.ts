// GitHub API Service for real push/pull operations

interface GitHubAuth {
  token: string;
  username: string;
}

export interface GitHubFile {
  path: string;
  content: string;
  sha?: string;
}

export class GitHubService {
  private static instance: GitHubService;
  private auth: GitHubAuth | null = null;

  private constructor() {
    // Load auth from localStorage
    const saved = localStorage.getItem('cm_github_auth');
    if (saved) {
      this.auth = JSON.parse(saved);
    }
  }

  static getInstance(): GitHubService {
    if (!GitHubService.instance) {
      GitHubService.instance = new GitHubService();
    }
    return GitHubService.instance;
  }

  setAuth(token: string, username: string) {
    this.auth = { token, username };
    localStorage.setItem('cm_github_auth', JSON.stringify(this.auth));
  }

  clearAuth() {
    this.auth = null;
    localStorage.removeItem('cm_github_auth');
  }

  getAuth(): GitHubAuth | null {
    return this.auth;
  }

  isAuthenticated(): boolean {
    return this.auth !== null && this.auth.token.length > 0;
  }

  private async makeRequest(url: string, options: RequestInit = {}) {
    if (!this.auth) {
      throw new Error('Not authenticated with GitHub');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.auth.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }

    return response.json();
  }

  // Get repository information
  async getRepository(owner: string, repo: string) {
    return this.makeRequest(`https://api.github.com/repos/${owner}/${repo}`);
  }

  // Get latest commit SHA for a branch
  async getLatestCommit(owner: string, repo: string, branch: string = 'main') {
    const data = await this.makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`
    );
    return data.object.sha;
  }

  // Get file content from repository
  async getFileContent(owner: string, repo: string, path: string, branch: string = 'main') {
    try {
      const data = await this.makeRequest(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
      );
      
      // Decode base64 content
      const content = atob(data.content);
      return {
        content,
        sha: data.sha,
        path: data.path
      };
    } catch (error) {
      return null; // File doesn't exist
    }
  }

  // Get all files from repository
  async getRepositoryTree(owner: string, repo: string, branch: string = 'main') {
    const commitSha = await this.getLatestCommit(owner, repo, branch);
    const data = await this.makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`
    );
    return data.tree;
  }

  // Create or update a file
  async updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    sha?: string,
    branch: string = 'main'
  ) {
    const encodedContent = btoa(unescape(encodeURIComponent(content)));
    
    const body: any = {
      message,
      content: encodedContent,
      branch
    };

    if (sha) {
      body.sha = sha; // Required for updates
    }

    return this.makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        body: JSON.stringify(body)
      }
    );
  }

  // Delete a file
  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch: string = 'main'
  ) {
    return this.makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'DELETE',
        body: JSON.stringify({
          message,
          sha,
          branch
        })
      }
    );
  }

  // Push multiple files in a single commit (using Git Trees API)
  async pushMultipleFiles(
    owner: string,
    repo: string,
    files: GitHubFile[],
    message: string,
    branch: string = 'main'
  ) {
    // 1. Get the latest commit SHA
    const latestCommitSha = await this.getLatestCommit(owner, repo, branch);

    // 2. Get the tree SHA from the latest commit
    const commitData = await this.makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`
    );
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs for each file
    const tree = await Promise.all(
      files.map(async (file) => {
        const blobData = await this.makeRequest(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
          {
            method: 'POST',
            body: JSON.stringify({
              content: file.content,
              encoding: 'utf-8'
            })
          }
        );

        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blobData.sha
        };
      })
    );

    // 4. Create a new tree
    const treeData = await this.makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree
        })
      }
    );

    // 5. Create a new commit
    const newCommitData = await this.makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          tree: treeData.sha,
          parents: [latestCommitSha]
        })
      }
    );

    // 6. Update the reference
    await this.makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          sha: newCommitData.sha,
          force: false
        })
      }
    );

    return newCommitData;
  }

  // Pull latest changes from repository
  async pullChanges(owner: string, repo: string, branch: string = 'main') {
    const tree = await this.getRepositoryTree(owner, repo, branch);
    
    // Filter out non-blob items (directories, submodules, etc.)
    const files = tree.filter((item: any) => item.type === 'blob');
    
    // Fetch content for each file
    const fileContents = await Promise.all(
      files.map(async (file: any) => {
        const content = await this.getFileContent(owner, repo, file.path, branch);
        return {
          path: file.path,
          content: content?.content || '',
          sha: file.sha
        };
      })
    );

    return fileContents;
  }

  // Compare local changes with remote
  async compareWithRemote(
    owner: string,
    repo: string,
    localFiles: GitHubFile[],
    branch: string = 'main'
  ) {
    const remoteTree = await this.getRepositoryTree(owner, repo, branch);
    const remoteFilesMap = new Map(remoteTree.map((item: any) => [item.path, item.sha]));

    const changes = {
      added: [] as string[],
      modified: [] as string[],
      deleted: [] as string[],
      unchanged: [] as string[]
    };

    // Check local files against remote
    for (const localFile of localFiles) {
      const remoteSha = remoteFilesMap.get(localFile.path);
      
      if (!remoteSha) {
        changes.added.push(localFile.path);
      } else if (localFile.sha && localFile.sha !== remoteSha) {
        changes.modified.push(localFile.path);
      } else {
        changes.unchanged.push(localFile.path);
      }
      
      remoteFilesMap.delete(localFile.path);
    }

    // Remaining remote files are deleted locally
    changes.deleted = Array.from(remoteFilesMap.keys());

    return changes;
  }

  // Get commits for a repository
  async getCommits(owner: string, repo: string, branch: string = 'main', perPage: number = 10) {
    return this.makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${perPage}`
    );
  }

  // Create a new branch
  async createBranch(owner: string, repo: string, newBranch: string, fromBranch: string = 'main') {
    const sha = await this.getLatestCommit(owner, repo, fromBranch);
    
    return this.makeRequest(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${newBranch}`,
          sha
        })
      }
    );
  }
}

// Helper function to extract owner/repo from GitHub URL
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
  if (match) {
    return {
      owner: match[1],
      repo: match[2]
    };
  }
  return null;
}
