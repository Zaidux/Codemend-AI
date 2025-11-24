
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
    return CodeLanguage.OTHER;
};

export const fetchRepoContents = async (owner: string, repo: string, token?: string): Promise<Project> => {
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json'
    };
    
    if (token) {
        headers['Authorization'] = `token ${token}`;
    }

    // Get default branch tree recursively
    // Note: GitHub Trees API has limits, for huge repos this needs pagination, keeping simple for v1
    const branchRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits`, { headers });
    if (!branchRes.ok) throw new Error('Could not fetch repo info');
    const branchData = await branchRes.json();
    const sha = branchData[0].sha;

    const treeRes = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`, { headers });
    if (!treeRes.ok) throw new Error('Could not fetch file tree');
    const treeData = await treeRes.json();

    const files: ProjectFile[] = [];
    
    // Limit to first 20 valid text files to avoid rate limits/context explosion in this demo
    // In production, this would be handled by lazy loading
    const validBlobs = treeData.tree.filter((node: any) => node.type === 'blob' && !isBinary(node.path)).slice(0, 15);

    for (const node of validBlobs) {
        const contentRes = await fetch(node.url, { headers }); // GitHub Blob URL
        const contentData = await contentRes.json();
        
        // Content is base64 encoded
        const content = atob(contentData.content.replace(/\n/g, ''));
        
        files.push({
            id: crypto.randomUUID(),
            name: node.path,
            language: getLanguageFromExt(node.path),
            content: content
        });
    }

    if (files.length === 0) {
        throw new Error("No readable code files found in repository.");
    }

    return {
        id: crypto.randomUUID(),
        name: `${owner}/${repo}`,
        files: files,
        activeFileId: files[0].id,
        lastModified: Date.now()
    };
};

const isBinary = (path: string): boolean => {
    const ignored = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.woff', '.ttf', '.eot'];
    return ignored.some(ext => path.toLowerCase().endsWith(ext));
};
