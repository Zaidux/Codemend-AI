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

// Helper: Extract Repo Name from URL or String
export const extractRepoName = (urlOrPath: string): string => {
    if (!urlOrPath) return '';
    
    // Handle both "owner/repo" and full URL formats
    if (urlOrPath.includes('github.com/')) {
        const match = urlOrPath.match(/github\.com\/([^\/]+\/[^\/]+)/);
        if (match) {
            return match[1].replace(/\.git$/, '');
        }
    }
    // Clean up trailing slashes or .git extensions if input is just owner/repo
    return urlOrPath.replace(/^\//, '').replace(/\/$/, '').replace(/\.git$/, '');
};

// Helper: Find duplicate project
export const findDuplicateProject = (projects: Project[], repoUrl: string): Project | null => {
    const repoName = extractRepoName(repoUrl);
    
    return projects.find(project => 
        project.name.toLowerCase() === repoName.toLowerCase() ||
        project.githubUrl?.toLowerCase() === repoUrl.toLowerCase() ||
        (project.githubUrl && extractRepoName(project.githubUrl) === repoName)
    ) || null;
};

// Parse GitHub URL or owner/repo format
export const parseGitHubUrl = (input: string): { owner: string; repo: string } => {
    const cleaned = extractRepoName(input);
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

    // Fallback: Use GitHub's raw content via proxy
    const proxyUrls = [
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        `https://cors-anywhere.herokuapp.com/${url}`
    ];

    for (const proxyUrl of proxyUrls) {
        try {
            const response = await fetch(proxyUrl, { headers });
            if (response.ok) return response;
        } catch (error) {
            console.warn(`Proxy ${proxyUrl} failed:`, error);
            continue;
        }
    }

    throw new Error('All CORS proxies failed. Please try with a GitHub token or use the backend import.');
};

// Fetch via GitHub Contents API
const fetchViaContentsAPI = async (owner: string, repo: string, token?: string): Promise<ProjectFile[]> => {
    const headers: HeadersInit = {
        'User-Agent': 'CodeMend-AI',
        'Accept': 'application/vnd.github.v3+json'
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const files: ProjectFile[] = [];
    const MAX_FILES = 50; 

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
                    if (!isTextFile(item.name)) continue;

                    try {
                        if (item.size > 100 * 1024) continue;

                        if (item.content && item.encoding === 'base64') {
                            const content = atob(item.content);
                            files.push({
                                id: crypto.randomUUID(),
                                name: item.path,
                                language: getLanguageFromExt(item.name),
                                content: content
                            });
                        } else {
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

const fetchViaZip = async (owner: string, repo: string, token?: string): Promise<{name: string, files: ProjectFile[]}> => {
    const headers: HeadersInit = {
        'User-Agent': 'CodeMend-AI',
        'Accept': 'application/vnd.github.v3+json'
    };
    if (token) headers['Authorization'] = `token ${token}`;

    const metaRes = await fetchWithCorsProxy(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, token);
    if (!metaRes.ok) throw new Error(`Repo not found or private. Status: ${metaRes.status}`);
    const meta = await metaRes.json();
    const defaultBranch = meta.default_branch || 'main';

    const zipUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/zipball/${defaultBranch}`;
    const zipRes = await fetchWithCorsProxy(zipUrl, token);

    if (!zipRes.ok) throw new Error(`Failed to download repo archive: ${zipRes.statusText}`);

    const blob = await zipRes.blob();
    const zip = await JSZip.loadAsync(blob);

    const files: ProjectFile[] = [];
    const MAX_FILES = 500;
    const MAX_SIZE = 1000 * 1024;

    const entries = Object.keys(zip.files).filter(path => !zip.files[path].dir);
    const sortedEntries = prioritizeEntries(entries);

    for (const path of sortedEntries) {
        if (files.length >= MAX_FILES) break;
        if (isIgnored(path)) continue;

        const fileEntry = zip.files[path];

        try {
            const content = await fileEntry.async('string');
            if (content.substring(0, 1000).includes('\u0000')) continue;
            if (content.length > MAX_SIZE) continue;

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
        name: `${owner}/${repo}`,
        files: files
    };
};

const prioritizeEntries = (paths: string[]): string[] => {
    return paths.sort((a, b) => {
        const priorityFiles = ['package.json', 'README.md', 'tsconfig.json', 'webpack.config.js', 'index.js', 'main.js'];
        const isPriorityA = priorityFiles.some(f => a.includes(f));
        const isPriorityB = priorityFiles.some(f => b.includes(f));
        if (isPriorityA && !isPriorityB) return -1;
        if (!isPriorityA && isPriorityB) return 1;
        return a.localeCompare(b);
    });
};

const isIgnored = (path: string): boolean => {
    const ignoredPatterns = [
        'node_modules', '.git', 'dist', 'build', '.DS_Store', 'package-lock.json', 
        '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.exe', '.dll'
    ];
    return ignoredPatterns.some(pattern => path.toLowerCase().includes(pattern.toLowerCase()));
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

// Main Export function - returns project data without ID for flexibility
export const fetchRepoContents = async (input: string, token?: string): Promise<{name: string, files: ProjectFile[]}> => {
    const { owner, repo } = parseGitHubUrl(input);

    try {
        console.log(`🚀 Fetching repository: ${owner}/${repo}`);

        try {
            return await fetchViaZip(owner, repo, token);
        } catch (zipError) {
            console.warn('ZIP method failed, trying Contents API...', zipError);
            const files = await fetchViaContentsAPI(owner, repo, token);

            if (files.length === 0) {
                throw new Error('No readable code files found. Repository might be private or empty.');
            }

            return {
                name: `${owner}/${repo}`,
                files: files
            };
        }

    } catch (error: any) {
        console.error('GitHub Import Error:', error);
        if (error.message.includes('404') || error.message.includes('Not Found')) {
            throw new Error(`Repository "${owner}/${repo}" not found. Check the spelling or ensure it's public.`);
        } else if (error.message.includes('403') || error.message.includes('API rate limit')) {
            throw new Error('GitHub API rate limit exceeded. Please add a GitHub token.');
        } else {
            throw new Error(`Import failed: ${error.message}`);
        }
    }
};

// NEW: Function to update existing project with latest GitHub contents
export const updateExistingProject = async (project: Project, token?: string): Promise<Project> => {
    if (!project.githubUrl) {
        throw new Error('Project does not have a GitHub URL to update from');
    }

    try {
        console.log(`🔄 Updating project: ${project.name}`);
        
        const { name, files } = await fetchRepoContents(project.githubUrl, token);
        
        // Preserve the original project ID and merge with new data
        return {
            ...project,
            name: name,
            files: files,
            activeFileId: files[0]?.id || project.activeFileId,
            lastModified: Date.now()
        };
    } catch (error) {
        console.error('Failed to update project:', error);
        throw new Error(`Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

// NEW: Enhanced GitHub import handler with duplication check
export const handleGitHubImport = async (
    repoInput: string,
    existingProjects: Project[],
    token?: string,
    onUpdate?: (project: Project) => void,
    onCreate?: (project: Project) => void
): Promise<{action: 'created' | 'updated' | 'cancelled', project?: Project}> => {
    if (!repoInput.trim()) {
        throw new Error('Please enter a GitHub repository URL or owner/repo');
    }

    const repoName = extractRepoName(repoInput);
    const existingProject = findDuplicateProject(existingProjects, repoInput);

    if (existingProject) {
        // Ask user if they want to update the existing project
        const shouldUpdate = window.confirm(
            `Project "${existingProject.name}" already exists. Do you want to update it with the latest changes from GitHub?`
        );
        
        if (shouldUpdate) {
            const updatedProject = await updateExistingProject(existingProject, token);
            onUpdate?.(updatedProject);
            return { action: 'updated', project: updatedProject };
        } else {
            return { action: 'cancelled' };
        }
    } else {
        // Create new project
        const { name, files } = await fetchRepoContents(repoInput, token);
        
        const newProject: Project = {
            id: crypto.randomUUID(),
            name: name,
            files: files,
            activeFileId: files[0]?.id || '',
            githubUrl: repoInput,
            lastModified: Date.now()
        };
        
        onCreate?.(newProject);
        return { action: 'created', project: newProject };
    }
};