import { Project, ProjectFile, CodeLanguage } from '../types';
import JSZip from 'jszip'; // Requires: npm install jszip

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
        '.yaml': CodeLanguage.OTHER,
        '.yml': CodeLanguage.OTHER,
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
        throw new Error('Invalid GitHub URL. Use format: owner/repo');
    }

    return { owner: parts[0], repo: parts[1] };
};

export const fetchRepoContents = async (input: string, token?: string): Promise<Project> => {
    const { owner, repo } = parseGitHubUrl(input);
    const headers: HeadersInit = { 'User-Agent': 'CodeMend-AI' };
    
    if (token) headers['Authorization'] = `token ${token}`;

    try {
        console.log(`🚀 Fetching zipball for ${owner}/${repo}...`);
        
        // 1. Fetch Repository Metadata to get default branch
        const metaRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, { headers });
        if (!metaRes.ok) throw new Error(`Repo not found or private. Status: ${metaRes.status}`);
        const meta = await metaRes.json();
        const defaultBranch = meta.default_branch || 'main';

        // 2. Fetch the ZIP archive (This is the most efficient way - 1 request)
        // Note: For private repos, this requires the token scope 'repo'
        const zipUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/zipball/${defaultBranch}`;
        const zipRes = await fetch(zipUrl, { headers });

        if (!zipRes.ok) {
            throw new Error(`Failed to download repo archive: ${zipRes.statusText}`);
        }

        // 3. Process the ZIP file
        const blob = await zipRes.blob();
        const zip = await JSZip.loadAsync(blob);
        
        const files: ProjectFile[] = [];
        const MAX_FILES = 100; // Safety limit
        const MAX_SIZE = 200 * 1024; // 200KB limit per file

        // The zip usually has a root folder like "user-repo-sha/"
        // We iterate over all files
        const entries = Object.keys(zip.files).filter(path => !zip.files[path].dir);

        // Sort to prioritize root files and source code
        const sortedEntries = prioritizeEntries(entries);

        for (const path of sortedEntries) {
            if (files.length >= MAX_FILES) break;
            if (isIgnored(path)) continue;

            const fileEntry = zip.files[path];
            
            // Check file size using uncompressed size if available
            // (JSZip isn't always accurate on size before read, but we try)
            // @ts-ignore - _data is internal but often useful, strictly we should trust the stream
            
            try {
                // Read as standard text
                const content = await fileEntry.async('string');
                
                // Binary Check: Look for null bytes in the first 1000 chars
                if (content.substring(0, 1000).includes('\u0000')) {
                    console.warn(`Skipping binary file: ${path}`);
                    continue;
                }

                if (content.length > MAX_SIZE) {
                    console.warn(`Skipping large file: ${path} (${content.length} bytes)`);
                    continue;
                }

                // Clean path (remove the top-level directory usually present in GitHub zips)
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

    } catch (error: any) {
        console.error('GitHub Import Error:', error);
        throw new Error(`Import failed: ${error.message}`);
    }
};

const prioritizeEntries = (paths: string[]): string[] => {
    return paths.sort((a, b) => {
        // Prefer shorter paths (root files)
        const depthA = a.split('/').length;
        const depthB = b.split('/').length;
        if (depthA !== depthB) return depthA - depthB;
        
        // Prefer code extensions
        const extA = a.split('.').pop() || '';
        const extB = b.split('.').pop() || '';
        const priority = ['json', 'ts', 'js', 'md', 'html', 'css'];
        const scoreA = priority.indexOf(extA);
        const scoreB = priority.indexOf(extB);
        
        return scoreB - scoreA;
    });
};

const isIgnored = (path: string): boolean => {
    const ignoredPatterns = [
        'node_modules', '.git', 'dist', 'build', '.DS_Store',
        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
        '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip'
    ];
    return ignoredPatterns.some(pattern => path.includes(pattern));
};