import { Project, ProjectFile, CodeLanguage } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

// Enhanced language detection
const getLanguageFromExt = (filename: string): CodeLanguage => {
    const extensionMap: Record<string, CodeLanguage> = {
        '.js': CodeLanguage.JAVASCRIPT,
        '.jsx': CodeLanguage.JAVASCRIPT,
        '.ts': CodeLanguage.TYPESCRIPT,
        '.tsx': CodeLanguage.TYPESCRIPT,
        '.html': CodeLanguage.HTML,
        '.htm': CodeLanguage.HTML,
        '.css': CodeLanguage.CSS,
        '.py': CodeLanguage.PYTHON,
        '.java': CodeLanguage.JAVA,
        '.json': CodeLanguage.JSON,
        '.cpp': CodeLanguage.CPP,
        '.cc': CodeLanguage.CPP,
        '.cxx': CodeLanguage.CPP,
        '.cs': CodeLanguage.CSHARP,
        '.go': CodeLanguage.GO,
        '.rs': CodeLanguage.RUST,
        '.sql': CodeLanguage.SQL,
        '.php': CodeLanguage.PHP,
        '.sh': CodeLanguage.BASH,
        '.bash': CodeLanguage.BASH,
        '.md': CodeLanguage.OTHER,
        '.txt': CodeLanguage.OTHER,
    };

    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return extensionMap[ext] || CodeLanguage.OTHER;
};

// Parse GitHub URL or owner/repo format
export const parseGitHubUrl = (input: string): { owner: string; repo: string } => {
    input = input.trim();
    
    // Remove leading/trailing slashes and GitHub URL prefixes
    const cleaned = input
        .replace(/^https?:\/\/github.com\//, '')
        .replace(/^github.com\//, '')
        .replace(/\.git$/, '')
        .replace(/^\//, '')
        .replace(/\/$/, '');

    const parts = cleaned.split('/');
    
    if (parts.length < 2) {
        throw new Error('Invalid GitHub URL or repository format. Use: owner/repo or https://github.com/owner/repo');
    }
    
    const owner = parts[0];
    const repo = parts[1];
    
    if (!owner || !repo) {
        throw new Error('Invalid GitHub URL or repository format. Use: owner/repo or https://github.com/owner/repo');
    }
    
    return { owner, repo };
};

// Smart file prioritization for large repositories
const prioritizeFiles = (files: any[]): any[] => {
    const priorityPatterns = [
        /^package\.json$/,
        /^README\.md$/i,
        /^index\./,
        /^main\./,
        /^app\./,
        /^src\/index\./,
        /^src\/main\./,
        /^src\/app\./,
        /\.(js|ts|jsx|tsx|py|java)$/,
        /\.(html|css)$/,
    ];

    return files.sort((a, b) => {
        const aScore = priorityPatterns.findIndex(pattern => pattern.test(a.path));
        const bScore = priorityPatterns.findIndex(pattern => pattern.test(b.path));
        
        // Higher priority files come first (lower index = higher priority)
        if (aScore !== -1 && bScore !== -1) return aScore - bScore;
        if (aScore !== -1) return -1;
        if (bScore !== -1) return 1;
        return a.path.localeCompare(b.path);
    });
};

export const fetchRepoContents = async (input: string, token?: string): Promise<Project> => {
    const { owner, repo } = parseGitHubUrl(input);
    
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'CodeMend-AI/1.0'
    };

    if (token && token.trim()) {
        headers['Authorization'] = `token ${token.trim()}`;
    }

    try {
        console.log(`Fetching repository: ${owner}/${repo}`);
        
        // Get repository info
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
                const errorText = await repoInfoRes.text();
                throw new Error(`GitHub API error: ${repoInfoRes.status} - ${errorText}`);
            }
        }

        const repoInfo = await repoInfoRes.json();
        const defaultBranch = repoInfo.default_branch;
        const repoSize = repoInfo.size; // Size in KB

        console.log(`Repository size: ${repoSize}KB, Default branch: ${defaultBranch}`);

        // For large repositories, use a different strategy
        const isLargeRepo = repoSize > 5000; // 5MB threshold

        let files: ProjectFile[] = [];

        if (isLargeRepo) {
            console.log('Large repository detected, using optimized loading strategy...');
            files = await fetchLargeRepoContents(owner, repo, defaultBranch, headers);
        } else {
            files = await fetchFullRepoContents(owner, repo, defaultBranch, headers);
        }

        if (files.length === 0) {
            throw new Error("No readable code files found in repository. The repo might be empty or contain only binary files.");
        }

        return {
            id: crypto.randomUUID(),
            name: `${owner}/${repo}`,
            files: files,
            activeFileId: files[0].id,
            lastModified: Date.now()
        };

    } catch (error: any) {
        console.error('GitHub fetch error:', error);
        throw new Error(`Failed to clone repository: ${error.message}`);
    }
};

// Fetch full repository contents (for small repos)
const fetchFullRepoContents = async (owner: string, repo: string, branch: string, headers: HeadersInit): Promise<ProjectFile[]> => {
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

    // Filter and prioritize files
    const validBlobs = treeData.tree.filter((node: any) => 
        node.type === 'blob' && 
        !isBinary(node.path) &&
        !isIgnoredDirectory(node.path)
    );

    const prioritizedBlobs = prioritizeFiles(validBlobs).slice(0, 50); // Increased limit for better coverage

    // Process files with concurrency control
    const BATCH_SIZE = 5;
    const files: ProjectFile[] = [];

    for (let i = 0; i < prioritizedBlobs.length; i += BATCH_SIZE) {
        const batch = prioritizedBlobs.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (node: any) => {
            try {
                const contentRes = await fetch(node.url, { headers });
                if (!contentRes.ok) {
                    console.warn(`Could not fetch content for ${node.path}: ${contentRes.status}`);
                    return null;
                }

                const contentData = await contentRes.json();
                
                if (!contentData.content) {
                    console.warn(`No content found for ${node.path}`);
                    return null;
                }

                const base64Content = contentData.content.replace(/\n/g, '');
                const content = atob(base64Content);

                // Skip very large files
                if (content.length > 100000) { // 100KB limit
                    console.warn(`Skipping large file: ${node.path} (${content.length} bytes)`);
                    return null;
                }

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

        const batchResults = await Promise.all(batchPromises);
        const successfulFiles = batchResults.filter((file): file is ProjectFile => file !== null);
        files.push(...successfulFiles);

        // Small delay between batches to avoid rate limits
        if (i + BATCH_SIZE < prioritizedBlobs.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return files;
};

// Optimized loading for large repositories
const fetchLargeRepoContents = async (owner: string, repo: string, branch: string, headers: HeadersInit): Promise<ProjectFile[]> => {
    // For large repos, focus on key files only
    const keyFiles = [
        'package.json', 'README.md', 'index.js', 'index.ts', 'main.js', 'main.ts', 
        'app.js', 'app.ts', 'src/index.js', 'src/index.ts', 'src/main.js', 'src/main.ts',
        'requirements.txt', 'setup.py', 'pom.xml', 'build.gradle', 'Cargo.toml'
    ];

    const files: ProjectFile[] = [];

    // Try to fetch key files first
    for (const filePath of keyFiles) {
        try {
            const contentRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${filePath}`, { headers });
            if (contentRes.ok) {
                const contentData = await contentRes.json();
                
                if (contentData.content) {
                    const base64Content = contentData.content.replace(/\n/g, '');
                    const content = atob(base64Content);

                    files.push({
                        id: crypto.randomUUID(),
                        name: filePath,
                        language: getLanguageFromExt(filePath),
                        content: content
                    });
                }
            }
        } catch (error) {
            console.warn(`Could not fetch key file ${filePath}:`, error);
        }
    }

    // If we have package.json, parse it to find entry points
    const packageJson = files.find(f => f.name === 'package.json');
    if (packageJson && packageJson.language === CodeLanguage.JSON) {
        try {
            const pkg = JSON.parse(packageJson.content);
            const entryPoints = [pkg.main, pkg.module, 'src/index.js', 'src/index.ts'].filter(Boolean);
            
            for (const entryPoint of entryPoints) {
                if (!files.some(f => f.name === entryPoint)) {
                    try {
                        const contentRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${entryPoint}`, { headers });
                        if (contentRes.ok) {
                            const contentData = await contentRes.json();
                            if (contentData.content) {
                                const base64Content = contentData.content.replace(/\n/g, '');
                                const content = atob(base64Content);

                                files.push({
                                    id: crypto.randomUUID(),
                                    name: entryPoint,
                                    language: getLanguageFromExt(entryPoint),
                                    content: content
                                });
                            }
                        }
                    } catch (error) {
                        console.warn(`Could not fetch entry point ${entryPoint}:`, error);
                    }
                }
            }
        } catch (error) {
            console.warn('Error parsing package.json:', error);
        }
    }

    return files;
};

const isBinary = (path: string): boolean => {
    const binaryExtensions = [
        '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.woff', '.ttf', '.eot', 
        '.bin', '.exe', '.dll', '.so', '.dylib', '.jar', '.war', '.ear', '.class',
        '.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac', '.ogg'
    ];
    return binaryExtensions.some(ext => path.toLowerCase().endsWith(ext));
};

const isIgnoredDirectory = (path: string): boolean => {
    const ignoredDirs = [
        'node_modules/', '.git/', 'dist/', 'build/', '.next/', 'target/', '__pycache__/',
        '.vscode/', '.idea/', '.DS_Store/', 'coverage/', '.nyc_output/', 'logs/'
    ];
    return ignoredDirs.some(dir => path.includes(dir));
};