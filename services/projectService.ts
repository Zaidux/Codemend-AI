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

  // FIX: Use consistent localStorage keys
  private readonly PROJECTS_STORAGE_KEY = 'codemend-projects';
  private readonly ARCHIVES_STORAGE_KEY = 'codemend-archives';

  // Create project
  async createProject(name: string, files: ProjectFile[] = [], githubUrl?: string): Promise<Project> {
    const project: Project = {
      id: this.generateUUID(),
      name: name.trim(),
      files: files,
      activeFileId: files[0]?.id || '',
      lastModified: Date.now(),
      createdAt: Date.now(),
      githubUrl: githubUrl,
      metadata: {
        description: '',
        tags: [],
        version: '1.0.0',
        githubUrl: githubUrl
      }
    };

    this.saveProjectToStorage(project);
    return project;
  }

  // Find project by repo
  async findProjectByRepo(repoInput: string): Promise<Project | null> {
    const cleanName = extractRepoName(repoInput).toLowerCase();
    if (!cleanName) return null;

    const projects = this.getAllProjectsFromStorage();

    return projects.find(p => {
      if (p.name.toLowerCase() === cleanName) return true;
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

  // NEW: Generic project update method
  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const updatedProject: Project = {
      ...project,
      ...updates,
      lastModified: Date.now()
    };

    this.saveProjectToStorage(updatedProject);
    return updatedProject;
  }

  // Update project files
  async updateProjectFiles(projectId: string, files: ProjectFile[]): Promise<Project> {
    return this.updateProject(projectId, { files });
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
      updatedFiles = [...project.files];
      updatedFiles[existingFileIndex] = file;
    } else {
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
      localStorage.setItem(this.PROJECTS_STORAGE_KEY, JSON.stringify(updatedProjects));
    } catch (error) {
      console.error('Error deleting project:', error);
      throw new Error(`Failed to delete project: ${error}`);
    }
  }

  // Archive project
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
    localStorage.setItem(this.ARCHIVES_STORAGE_KEY, JSON.stringify(archives));

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
    localStorage.setItem(this.ARCHIVES_STORAGE_KEY, JSON.stringify(updatedArchives));

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

    const currentFilesMap = new Map(project.files.map(f => [f.name, f]));
    const externalFilesMap = new Map(externalFiles.map(f => [f.name, f]));

    // Check for modified files
    for (const [name, externalFile] of externalFilesMap) {
      const currentFile = currentFilesMap.get(name);

      if (currentFile) {
        if (currentFile.content !== externalFile.content) {
          changes.push({
            type: 'modified',
            file: externalFile,
            previousContent: currentFile.content,
            currentContent: externalFile.content
          });
        }
      } else {
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
          const existingIndex = updatedFiles.findIndex(f => f.name === change.file.name);
          if (existingIndex >= 0) {
            updatedFiles[existingIndex] = change.file;
          } else {
            updatedFiles.push(change.file);
          }
          break;

        case 'deleted':
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

    return contextService.generateProjectSummary(project, project.files, {});
  }

  // Export project as ZIP
  async exportProject(projectId: string): Promise<Blob> {
    const project = await this.loadProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

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
            id: this.generateUUID(),
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

    localStorage.setItem(this.PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  }

  private getAllProjectsFromStorage(): Project[] {
    try {
      const stored = localStorage.getItem(this.PROJECTS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error reading projects from storage:', error);
      return [];
    }
  }

  private getArchivedProjectsFromStorage(): Project[] {
    try {
      const stored = localStorage.getItem(this.ARCHIVES_STORAGE_KEY);
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