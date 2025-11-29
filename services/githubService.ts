import { Project, ProjectFile, CodeLanguage } from '../types';
import JSZip from 'jszip';

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
        '.md': CodeLanguage.MARKDOWN,
        '.txt': CodeLanguage.TEXT,
        '.yaml': CodeLanguage.YAML,
        '.yml': CodeLanguage.YAML,
        '.xml': CodeLanguage.XML,
    };

    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return extensionMap[ext] || CodeLanguage.OTHER;
};

// Parse GitHub URL or owner/repo format
export const parseGitHubUrl = (input: string): { owner: string; repo: string } => {
    input = input.trim();
    const cleaned = input
        .replace(/^https?:\/\/github.com\//, '')
        .replace(/^github.com\//, '')
        .replace(/\.git$/, '')
        .replace(/^\//, '')
        .replace(/\/$/, '');

    const parts = cleaned.split('/');
    if (parts.length < 2) {
        throw new Error('Invalid GitHub URL. Use format: owner/repo or https://github.com/owner/repo');
    }

    return { owner: parts[0], repo: parts[1] };
};

// CORS proxy function - uses multiple fallback options
const fetchWithCorsProxy = async (url: string, token?: string): Promise<Response> => {
    const headers: HeadersInit = {
        'User-Agent': 'CodeMend-AI',
        'Accept': 'application/vnd.github.v3+json'
    };

    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    // Try direct fetch first (works if backend handles CORS)
    try {
        const response = await fetch(url, { headers });
        if (response.ok) return response;
    } catch (error) {
        console.warn('Direct fetch failed, trying CORS proxy...', error);
    }

    // Fallback 1: Use GitHub's raw content via proxy
    const proxyUrls = [
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://cors-anywhere.herokuapp.com/${url}`
    ];

    for (const proxyUrl of proxyUrls) {
        try {
            console.log(`Trying proxy: ${proxyUrl}`);
            const response = await fetch(proxyUrl, { headers });
            if (response.ok) return response;
        } catch (error) {
            console.warn(`Proxy ${proxyUrl} failed:`, error);
            continue;
        }
    }

    throw new Error('All CORS proxies failed. Please try with a GitHub token or use the backend import.');
};

// Alternative: Fetch via GitHub Contents API (slower but more reliable for public repos)
const fetchViaContentsAPI = async (owner: string, repo: string, token?: string): Promise<ProjectFile[]> => {
    const headers: HeadersInit = {
        'User-Agent': 'CodeMend-AI',
        'Accept': 'application/vnd.github.v3+json'
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const files: ProjectFile[] = [];
    const MAX_FILES = 50; // Lower limit for API method

    const fetchRecursive = async (path: string = '') => {
        if (files.length >= MAX_FILES) return;

        const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`;
        
        try {
            const response = await fetchWithCorsProxy(url, token);
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            
            const contents = await response.json();

            for (const item of contents) {
                if (files.length >= MAX_FILES) break;

                if (item.type === 'file') {
                    if (isIgnored(item.name) || isIgnored(item.path)) continue;

                    // Only fetch text-based files
                    if (!isTextFile(item.name)) continue;

                    try {
                        // For small files, we can get content directly
                        if (item.size > 100 * 1024) { // 100KB limit
                            console.warn(`Skipping large file: ${item.path} (${item.size} bytes)`);
                            continue;
                        }

                        // If content is already provided (small files)
                        if (item.content && item.encoding === 'base64') {
                            const content = atob(item.content);
                            files.push({
                                id: crypto.randomUUID(),
                                name: item.path,
                                language: getLanguageFromExt(item.name),
                                content: content
                            });
                        } else {
                            // Fetch file content separately
                            const fileResponse = await fetchWithCorsProxy(item.download_url, token);
                            if (fileResponse.ok) {
                                const content = await fileResponse.text();
                                files.push({
                                    id: crypto.randomUUID(),
                                    name: item.path,
                                    language: getLanguageFromExt(item.name),
                                    content: content
                                });
                            }
                        }
                    } catch (error) {
                        console.warn(`Failed to fetch ${item.path}:`, error);
                    }
                } else if (item.type === 'dir') {
                    // Recursively fetch directory contents
                    await fetchRecursive(item.path);
                }
            }
        } catch (error) {
            console.error(`Failed to fetch path ${path}:`, error);
        }
    };

    await fetchRecursive();
    return files;
};

export const fetchRepoContents = async (input: string, token?: string): Promise<Project> => {
    const { owner, repo } = parseGitHubUrl(input);

    try {
        console.log(`🚀 Fetching repository: ${owner}/${repo}`);

        // Method 1: Try ZIP download first (most efficient)
        try {
            return await fetchViaZip(owner, repo, token);
        } catch (zipError) {
            console.warn('ZIP method failed, trying Contents API...', zipError);
            
            // Method 2: Fallback to Contents API
            const files = await fetchViaContentsAPI(owner, repo, token);
            
            if (files.length === 0) {
                throw new Error('No readable code files found. Repository might be private or empty.');
            }

            return {
                id: crypto.randomUUID(),
                name: `${owner}/${repo}`,
                files: files,
                activeFileId: files[0].id,
                lastModified: Date.now()
            };
        }

    } catch (error: any) {
        console.error('GitHub Import Error:', error);
        
        // Provide helpful error messages
        if (error.message.includes('404') || error.message.includes('Not Found')) {
            throw new Error(`Repository "${owner}/${repo}" not found. Check the spelling or ensure it's public.`);
        } else if (error.message.includes('403') || error.message.includes('API rate limit')) {
            throw new Error('GitHub API rate limit exceeded. Please add a GitHub token or try again later.');
        } else if (error.message.includes('CORS')) {
            throw new Error('CORS error. Please use a GitHub token or try the backend import feature.');
        } else {
            throw new Error(`Import failed: ${error.message}`);
        }
    }
};

const fetchViaZip = async (owner: string, repo: string, token?: string): Promise<Project> => {
    const headers: HeadersInit = {
        'User-Agent': 'CodeMend-AI',
        'Accept': 'application/vnd.github.v3+json'
    };
    if (token) headers['Authorization'] = `token ${token}`;

    // 1. Fetch Repository Metadata to get default branch
    const metaRes = await fetchWithCorsProxy(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, token);
    if (!metaRes.ok) throw new Error(`Repo not found or private. Status: ${metaRes.status}`);
    const meta = await metaRes.json();
    const defaultBranch = meta.default_branch || 'main';

    // 2. Fetch the ZIP archive
    const zipUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/zipball/${defaultBranch}`;
    const zipRes = await fetchWithCorsProxy(zipUrl, token);

    if (!zipRes.ok) {
        throw new Error(`Failed to download repo archive: ${zipRes.statusText}`);
    }

    // 3. Process the ZIP file
    const blob = await zipRes.blob();
    const zip = await JSZip.loadAsync(blob);

    const files: ProjectFile[] = [];
    const MAX_FILES = 500;
    const MAX_SIZE = 1000 * 1024; // 1MB

    const entries = Object.keys(zip.files).filter(path => !zip.files[path].dir);
    const sortedEntries = prioritizeEntries(entries);

    for (const path of sortedEntries) {
        if (files.length >= MAX_FILES) break;
        if (isIgnored(path)) continue;

        const fileEntry = zip.files[path];

        try {
            const content = await fileEntry.async('string');

            // Check for binary files
            if (content.substring(0, 1000).includes('\u0000')) {
                console.warn(`Skipping binary file: ${path}`);
                continue;
            }

            if (content.length > MAX_SIZE) {
                console.warn(`Skipping large file: ${path} (${content.length} bytes)`);
                continue;
            }

            // Clean path (remove the top-level directory from GitHub zips)
            const cleanPath = path.substring(path.indexOf('/') + 1);
            if (!cleanPath) continue;

            files.push({
                id: crypto.randomUUID(),
                name: cleanPath,
                language: getLanguageFromExt(cleanPath),
                content: content
            });

        } catch (err) {
            console.warn(`Failed to parse ${path}`, err);
        }
    }

    if (files.length === 0) throw new Error("No readable code files found.");

    return {
        id: crypto.randomUUID(),
        name: `${owner}/${repo}`,
        files: files,
        activeFileId: files[0].id,
        lastModified: Date.now()
    };
};

const prioritizeEntries = (paths: string[]): string[] => {
    return paths.sort((a, b) => {
        // Priority files (config, root files)
        const priorityFiles = ['package.json', 'README.md', 'tsconfig.json', 'webpack.config.js', 'index.js', 'app.js', 'main.js'];
        
        const isPriorityA = priorityFiles.some(f => a.includes(f));
        const isPriorityB = priorityFiles.some(f => b.includes(f));
        if (isPriorityA && !isPriorityB) return -1;
        if (!isPriorityA && isPriorityB) return 1;

        // Prefer shorter paths (root files)
        const depthA = a.split('/').length;
        const depthB = b.split('/').length;
        if (depthA !== depthB) return depthA - depthB;

        // Prefer code files over others
        const extA = a.split('.').pop() || '';
        const extB = b.split('.').pop() || '';
        const codeExts = ['ts', 'js', 'jsx', 'tsx', 'json', 'html', 'css', 'py', 'java'];
        const isCodeA = codeExts.includes(extA);
        const isCodeB = codeExts.includes(extB);
        if (isCodeA && !isCodeB) return -1;
        if (!isCodeA && isCodeB) return 1;

        return a.localeCompare(b);
    });
};

const isIgnored = (path: string): boolean => {
    const ignoredPatterns = [
        'node_modules', '.git', 'dist', 'build', '.DS_Store',
        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
        '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip',
        '.tar', '.gz', '.mp4', '.mp3', '.wav', '.avi', '.mov',
        '.exe', '.dll', '.so', '.dylib'
    ];
    return ignoredPatterns.some(pattern => 
        path.toLowerCase().includes(pattern.toLowerCase())
    );
};

const isTextFile = (filename: string): boolean => {
    const textExtensions = [
        '.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json',
        '.md', '.txt', '.yml', '.yaml', '.xml', '.csv', '.sql',
        '.py', '.java', '.cpp', '.c', '.h', '.cs', '.go', '.rs',
        '.php', '.rb', '.sh', '.ps1', '.bat', '.config'
    ];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return textExtensions.includes(ext);
};

// Alternative simple fetch for public repos (no auth needed)
export const fetchPublicRepoSimple = async (input: string): Promise<Project> => {
    const { owner, repo } = parseGitHubUrl(input);
    
    // Use raw.githubusercontent.com for direct file access
    const files = await fetchViaContentsAPI(owner, repo);
    
    if (files.length === 0) {
        throw new Error('No files found or repository is private.');
    }

    return {
        id: crypto.randomUUID(),
        name: `${owner}/${repo}`,
        files: files,
        activeFileId: files[0].id,
        lastModified: Date.now()
    };
};