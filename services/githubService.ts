import { Project, ProjectFile, CodeLanguage } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

const getLanguageFromExt = (filename: string): CodeLanguage => {
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return CodeLanguage.JAVASCRIPT;
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return CodeLanguage.TYPESCRIPT;
    if (filename.endsWith('.html')) return CodeLanguage.HTML;
    if (filename.endsWith('.css')) return CodeLanguage.CSS;
    if (filename.endsWith('.py')) return CodeLanguage.PYTHON;
    if (filename.endsWith('.java')) return CodeLanguage.JAVA;
    if (filename.endsWith('.json')) return CodeLanguage.JSON;
    if (filename.endsWith('.cpp') || filename.endsWith('.cc') || filename.endsWith('.cxx')) return CodeLanguage.CPP;
    if (filename.endsWith('.cs')) return CodeLanguage.CSHARP;
    if (filename.endsWith('.go')) return CodeLanguage.GO;
    if (filename.endsWith('.rs')) return CodeLanguage.RUST;
    if (filename.endsWith('.sql')) return CodeLanguage.SQL;
    if (filename.endsWith('.php')) return CodeLanguage.PHP;
    if (filename.endsWith('.sh')) return CodeLanguage.BASH;
    return CodeLanguage.OTHER;
};

export const fetchRepoContents = async (owner: string, repo: string, token?: string): Promise<Project> => {
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CodeMend-AI/1.0'
    };

    if (token && token.trim()) {
        headers['Authorization'] = `token ${token.trim()}`;
    }

    try {
        // First, try to get repo info to check if it exists and get default branch
        const repoInfoRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers });
        
        if (!repoInfoRes.ok) {
            if (repoInfoRes.status === 404) {
                throw new Error(`Repository "${owner}/${repo}" not found. Check the spelling or make sure it's public.`);
            } else if (repoInfoRes.status === 403) {
                if (!token) {
                    throw new Error('Rate limit exceeded for anonymous access. Please add a GitHub Personal Access Token in settings.');
                } else {
                    throw new Error('Rate limit exceeded even with token. Please try again later.');
                }
            } else {
                throw new Error(`GitHub API error: ${repoInfoRes.status} ${repoInfoRes.statusText}`);
            }
        }

        const repoInfo = await repoInfoRes.json();
        const defaultBranch = repoInfo.default_branch;

        // Get the latest commit from the default branch
        const commitsRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?per_page=1`, { headers });
        if (!commitsRes.ok) {
            throw new Error('Could not fetch commit history');
        }
        
        const commitsData = await commitsRes.json();
        if (!commitsData || commitsData.length === 0) {
            throw new Error('No commits found in repository');
        }
        
        const sha = commitsData[0].sha;

        // Get the recursive file tree
        const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`, { headers });
        if (!treeRes.ok) {
            throw new Error('Could not fetch repository file tree');
        }
        
        const treeData = await treeRes.json();
        if (!treeData.tree) {
            throw new Error('No files found in repository');
        }

        const files: ProjectFile[] = [];

        // Filter for code files (not binary, not in ignored directories)
        const validBlobs = treeData.tree.filter((node: any) => 
            node.type === 'blob' && 
            !isBinary(node.path) &&
            !isIgnoredDirectory(node.path)
        ).slice(0, 20); // Limit to 20 files for performance

        // Process files in parallel with rate limiting
        const filePromises = validBlobs.map(async (node: any) => {
            try {
                const contentRes = await fetch(node.url, { headers });
                if (!contentRes.ok) {
                    console.warn(`Could not fetch content for ${node.path}: ${contentRes.status}`);
                    return null;
                }
                
                const contentData = await contentRes.json();
                
                // Handle base64 content
                if (!contentData.content) {
                    console.warn(`No content found for ${node.path}`);
                    return null;
                }
                
                // GitHub API returns base64 encoded content with newlines
                const base64Content = contentData.content.replace(/\n/g, '');
                const content = atob(base64Content);

                return {
                    id: crypto.randomUUID(),
                    name: node.path,
                    language: getLanguageFromExt(node.path),
                    content: content
                } as ProjectFile;
            } catch (error) {
                console.warn(`Error processing file ${node.path}:`, error);
                return null;
            }
        });

        const fileResults = await Promise.all(filePromises);
        const successfulFiles = fileResults.filter((file): file is ProjectFile => file !== null);

        if (successfulFiles.length === 0) {
            throw new Error("No readable code files found in repository. The repo might be empty or contain only binary files.");
        }

        return {
            id: crypto.randomUUID(),
            name: `${owner}/${repo}`,
            files: successfulFiles,
            activeFileId: successfulFiles[0].id,
            lastModified: Date.now()
        };

    } catch (error: any) {
        console.error('GitHub fetch error:', error);
        throw new Error(`Failed to clone repository: ${error.message}`);
    }
};

const isBinary = (path: string): boolean => {
    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.woff', '.ttf', '.eot', '.bin', '.exe', '.dll'];
    return binaryExtensions.some(ext => path.toLowerCase().endsWith(ext));
};

const isIgnoredDirectory = (path: string): boolean => {
    const ignoredDirs = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', 'target/', '__pycache__/'];
    return ignoredDirs.some(dir => path.includes(dir));
};