import { Project, ProjectFile, ProjectSummary, FileChange, GitStatus } from '../types';
import { contextService } from './contextService';
import { extractRepoName } from './githubService';

export class ProjectService {
  private static instance: ProjectService;

  public static getInstance(): ProjectService {
    if (!ProjectService.instance) {
      ProjectService.instance = new ProjectService();
    }
    return ProjectService.instance;
  }

  // --- UPDATED: createProject now accepts optional metadata/githubUrl ---
  async createProject(name: string, files: ProjectFile[] = [], githubUrl?: string): Promise<Project> {
    const project: Project = {
      id: this.generateUUID(),
      name: name.trim(),
      files: files,
      activeFileId: files[0]?.id || '',
      lastModified: Date.now(),
      createdAt: Date.now(),
      githubUrl: githubUrl, // specific field if your type supports it
      metadata: {
        description: '',
        tags: [],
        version: '1.0.0',
        githubUrl: githubUrl // store in metadata as fallback
      }
    };

    // Save to localStorage
    this.saveProjectToStorage(project);
    return project;
  }

  // --- NEW: Helper to find existing project by Repo Name or URL ---
  async findProjectByRepo(repoInput: string): Promise<Project | null> {
    const cleanName = extractRepoName(repoInput).toLowerCase();
    if (!cleanName) return null;

    const projects = this.getAllProjectsFromStorage();
    
    return projects.find(p => {
      // 1. Check direct name match (e.g., "facebook/react")
      if (p.name.toLowerCase() === cleanName) return true;

      // 2. Check metadata URL if it exists
      const pRepo = p.metadata?.githubUrl ? extractRepoName(p.metadata.githubUrl) : '';
      if (pRepo.toLowerCase() === cleanName) return true;

      return false;
    }) || null;
  }

  // Load project from storage
  async loadProject(projectId: string): Promise<Project | null> {
    try {
      const projects = this.getAllProjectsFromStorage();
      return projects.find(p => p.id === projectId) || null;
    } catch (error) {
      console.error('Error loading project:', error);
      return null;
    }
  }

  // Update project files
  async updateProjectFiles(projectId: string, files: ProjectFile[]): Promise<Project> {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const updatedProject: Project = {
      ...project,
      files: files,
      lastModified: Date.now()
    };

    this.saveProjectToStorage(updatedProject);
    return updatedProject;
  }

  // Add or update a single file
  async updateFile(projectId: string, file: ProjectFile): Promise<Project> {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const existingFileIndex = project.files.findIndex(f => f.id === file.id);
    let updatedFiles: ProjectFile[];

    if (existingFileIndex >= 0) {
      // Update existing file
      updatedFiles = [...project.files];
      updatedFiles[existingFileIndex] = file;
    } else {
      // Add new file
      updatedFiles = [...project.files, file];
    }

    return this.updateProjectFiles(projectId, updatedFiles);
  }

  // Delete a file
  async deleteFile(projectId: string, fileId: string): Promise<Project> {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const updatedFiles = project.files.filter(f => f.id !== fileId);
    return this.updateProjectFiles(projectId, updatedFiles);
  }

  // Delete entire project
  async deleteProject(projectId: string): Promise<void> {
    try {
      const projects = this.getAllProjectsFromStorage();
      const updatedProjects = projects.filter(p => p.id !== projectId);
      localStorage.setItem('codemend-projects', JSON.stringify(updatedProjects));
    } catch (error) {
      console.error('Error deleting project:', error);
      throw new Error(`Failed to delete project: ${error}`);
    }
  }

  // Archive project (move to separate storage)
  async archiveProject(projectId: string): Promise<void> {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Add archive metadata
    const archivedProject = {
      ...project,
      metadata: {
        ...project.metadata,
        archived: true,
        archivedAt: Date.now()
      }
    };

    // Save to archive storage
    const archives = this.getArchivedProjectsFromStorage();
    archives.push(archivedProject);
    localStorage.setItem('codemend-archives', JSON.stringify(archives));

    // Remove from active projects
    await this.deleteProject(projectId);
  }

  // Restore archived project
  async restoreProject(projectId: string): Promise<Project> {
    const archives = this.getArchivedProjectsFromStorage();
    const archivedProject = archives.find(p => p.id === projectId);

    if (!archivedProject) {
      throw new Error(`Archived project ${projectId} not found`);
    }

    // Remove archive metadata
    const restoredProject = {
      ...archivedProject,
      metadata: {
        ...archivedProject.metadata,
        archived: false,
        archivedAt: undefined
      }
    };

    // Save to active projects
    this.saveProjectToStorage(restoredProject);

    // Remove from archives
    const updatedArchives = archives.filter(p => p.id !== projectId);
    localStorage.setItem('codemend-archives', JSON.stringify(updatedArchives));

    return restoredProject;
  }

  // Get all projects
  async getAllProjects(): Promise<Project[]> {
    return this.getAllProjectsFromStorage();
  }

  // Get archived projects
  async getArchivedProjects(): Promise<Project[]> {
    return this.getArchivedProjectsFromStorage();
  }

  // Detect changes between current project state and external changes
  async detectChanges(project: Project, externalFiles: ProjectFile[]): Promise<FileChange[]> {
    const changes: FileChange[] = [];

    // Create maps for easier comparison
    const currentFilesMap = new Map(project.files.map(f => [f.name, f]));
    const externalFilesMap = new Map(externalFiles.map(f => [f.name, f]));

    // Check for modified files
    for (const [name, externalFile] of externalFilesMap) {
      const currentFile = currentFilesMap.get(name);

      if (currentFile) {
        // File exists in both - check if content changed
        if (currentFile.content !== externalFile.content) {
          changes.push({
            type: 'modified',
            file: externalFile,
            previousContent: currentFile.content,
            currentContent: externalFile.content
          });
        }
      } else {
        // New file in external source
        changes.push({
          type: 'added',
          file: externalFile,
          previousContent: '',
          currentContent: externalFile.content
        });
      }
    }

    // Check for deleted files
    for (const [name, currentFile] of currentFilesMap) {
      if (!externalFilesMap.has(name)) {
        changes.push({
          type: 'deleted',
          file: currentFile,
          previousContent: currentFile.content,
          currentContent: ''
        });
      }
    }

    return changes;
  }

  // Apply changes to project
  async applyChanges(projectId: string, changes: FileChange[]): Promise<Project> {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    let updatedFiles = [...project.files];

    for (const change of changes) {
      switch (change.type) {
        case 'added':
        case 'modified':
          // Add or update file
          const existingIndex = updatedFiles.findIndex(f => f.name === change.file.name);
          if (existingIndex >= 0) {
            updatedFiles[existingIndex] = change.file;
          } else {
            updatedFiles.push(change.file);
          }
          break;

        case 'deleted':
          // Remove file
          updatedFiles = updatedFiles.filter(f => f.name !== change.file.name);
          break;
      }
    }

    return this.updateProjectFiles(projectId, updatedFiles);
  }

  // Get project summary
  async getProjectSummary(projectId: string): Promise<ProjectSummary> {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Use the context service to generate summary
    return contextService.generateProjectSummary(project, project.files, {});
  }

  // Export project as ZIP (placeholder for future implementation)
  async exportProject(projectId: string): Promise<Blob> {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // For now, return a JSON blob
    const projectData = JSON.stringify(project, null, 2);
    return new Blob([projectData], { type: 'application/json' });
  }

  // Import project from file
  async importProject(file: File): Promise<Project> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const projectData = JSON.parse(e.target?.result as string);
          const project: Project = {
            ...projectData,
            id: this.generateUUID(), // Generate new ID to avoid conflicts
            lastModified: Date.now()
          };

          this.saveProjectToStorage(project);
          resolve(project);
        } catch (error) {
          reject(new Error('Invalid project file format'));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  // Private helper methods
  private saveProjectToStorage(project: Project): void {
    const projects = this.getAllProjectsFromStorage();
    const existingIndex = projects.findIndex(p => p.id === project.id);

    if (existingIndex >= 0) {
      projects[existingIndex] = project;
    } else {
      projects.push(project);
    }

    localStorage.setItem('codemend-projects', JSON.stringify(projects));
  }

  private getAllProjectsFromStorage(): Project[] {
    try {
      const stored = localStorage.getItem('codemend-projects');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error reading projects from storage:', error);
      return [];
    }
  }

  private getArchivedProjectsFromStorage(): Project[] {
    try {
      const stored = localStorage.getItem('codemend-archives');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error reading archives from storage:', error);
      return [];
    }
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Export singleton instance
export const projectService = ProjectService.getInstance();