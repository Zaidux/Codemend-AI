import { Project, ProjectFile, ProjectSummary, FileChange, GitStatus, CodeLanguage } from '../types';
import { contextService } from './contextService';
import { extractRepoName } from './githubService';
import { ProjectUtils, mergeProjects, detectMergeConflicts } from '../utils/projectUtils';

export class ProjectService {
  private static instance: ProjectService;

  public static getInstance(): ProjectService {
    if (!ProjectService.instance) {
      ProjectService.instance = new ProjectService();
    }
    return ProjectService.instance;
  }

  private readonly PROJECTS_STORAGE_KEY = 'codemend-projects';
  private readonly ARCHIVES_STORAGE_KEY = 'codemend-archives';

  // Create project with enhanced analysis
  async createProject(name: string, files: ProjectFile[] = [], githubUrl?: string): Promise<Project> {
    const tempId = this.generateUUID();
    
    // Create a temp project for analysis
    const tempProject: Project = {
      id: tempId,
      name: name.trim(),
      files: files,
      activeFileId: files[0]?.id || '',
      lastModified: Date.now()
    };
    
    // Analyze project structure for better metadata
    const projectStructure = ProjectUtils.analyzeProjectStructure(files);
    const projectStats = ProjectUtils.generateProjectStats(tempProject);
    const potentialIssues = ProjectUtils.findPotentialIssues(tempProject);

    // Optimize files (remove duplicates, etc.)
    const optimizedFiles = ProjectUtils.optimizeProject(tempProject).files;

    const project: Project = {
      id: tempId,
      name: name.trim(),
      files: optimizedFiles,
      activeFileId: optimizedFiles[0]?.id || '',
      lastModified: Date.now(),
      structure: projectStructure,
      metadata: {
        description: '',
        tags: [],
        version: '1.0.0'
      }
    };

    this.saveProjectToStorage(project);
    console.log(`✅ Created project: ${project.name}`, {
      files: project.files.length,
      architecture: projectStructure.architecture,
      issues: potentialIssues.length
    });
    
    return project;
  }

  // Enhanced: Find project by repo with similarity checking
  async findProjectByRepo(repoInput: string): Promise<Project | null> {
    const cleanName = extractRepoName(repoInput).toLowerCase();
    if (!cleanName) return null;

    const projects = this.getAllProjectsFromStorage();

    // First try exact match
    const exactMatch = projects.find(p => {
      if (p.name.toLowerCase() === cleanName) return true;
      // Note: githubUrl is not in the Project type, check if it exists
      return false;
    });

    if (exactMatch) return exactMatch;

    // If no exact match, try to find similar projects using ProjectUtils
    console.log('No exact match found, checking for similar projects...');
    return null; // We'll handle similarity in handleGitHubImport instead
  }

  // NEW: Find similar projects using ProjectUtils
  async findSimilarProjects(files: ProjectFile[], threshold: number = 0.7): Promise<{project: Project, similarity: number}[]> {
    const projects = this.getAllProjectsFromStorage();
    const results: {project: Project, similarity: number}[] = [];

    const testProject: Project = {
      id: 'temp',
      name: 'test',
      files: files,
      activeFileId: files[0]?.id || '',
      lastModified: Date.now()
    };

    for (const project of projects) {
      const similarity = ProjectUtils.calculateProjectSimilarity(testProject, project);
      if (similarity >= threshold) {
        results.push({ project, similarity });
      }
    }

    // Sort by similarity (highest first)
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  // Enhanced: Update project with structure analysis
  async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
    const project = await this.loadProject(projectId, false);
    if (!project) {
      throw new Error(`Project ${projectId} not found in active projects`);
    }

    const updatedProject: Project = {
      ...project,
      ...updates,
      lastModified: Date.now()
    };

    // Re-analyze project structure if files changed
    if (updates.files) {
      const projectStructure = ProjectUtils.analyzeProjectStructure(updatedProject.files);
      updatedProject.structure = projectStructure;
    }

    this.saveProjectToStorage(updatedProject);
    return updatedProject;
  }

  // Enhanced: Archive project with better logging
  async archiveProject(projectId: string): Promise<void> {
    try {
      const project = await this.loadProject(projectId, false);
      if (!project) {
        throw new Error(`Project ${projectId} not found in active projects`);
      }

      console.log('📦 Archiving project:', {
        name: project.name,
        id: projectId,
        files: project.files.length,
        architecture: project.structure?.architecture
      });

      // Add archive metadata
      const archivedProject = {
        ...project,
        metadata: {
          ...project.metadata,
          archived: true,
          archivedAt: Date.now(),
          archivedReason: 'User action'
        }
      };

      // Save to archive storage
      const archives = this.getArchivedProjectsFromStorage();
      archives.push(archivedProject);
      localStorage.setItem(this.ARCHIVES_STORAGE_KEY, JSON.stringify(archives));

      // Remove from active projects
      const projects = this.getAllProjectsFromStorage();
      const updatedProjects = projects.filter(p => p.id !== projectId);
      localStorage.setItem(this.PROJECTS_STORAGE_KEY, JSON.stringify(updatedProjects));

      console.log('✅ Project archived successfully:', project.name);
    } catch (error) {
      console.error('❌ Error in archiveProject:', error);
      throw new Error(`Failed to archive project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // NEW: Analyze project and return detailed information
  async analyzeProject(projectId: string): Promise<{
    structure: any;
    stats: any;
    issues: string[];
    relatedFiles: Record<string, ProjectFile[]>;
    recommendations: string[];
  }> {
    const project = await this.loadProject(projectId, true);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const structure = ProjectUtils.analyzeProjectStructure(project.files);
    const stats = ProjectUtils.generateProjectStats(project);
    const issues = ProjectUtils.findPotentialIssues(project);

    // Find related files for key files
    const relatedFiles: Record<string, ProjectFile[]> = {};
    const keyFiles = project.files.filter(f => 
      f.name.includes('index.') || 
      f.name.includes('App.') || 
      f.name.includes('main.')
    ).slice(0, 5); // Limit to 5 key files

    for (const keyFile of keyFiles) {
      relatedFiles[keyFile.name] = ProjectUtils.findRelatedFiles(keyFile, project.files);
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (issues.length > 0) {
      recommendations.push('Fix the issues identified in the project analysis');
    }
    if (structure.dependencies.length > 20) {
      recommendations.push('Consider reducing dependencies for better performance');
    }
    if (stats.averageFileSize > 10000) {
      recommendations.push('Some files are large - consider splitting them up');
    }

    return {
      structure,
      stats,
      issues,
      relatedFiles,
      recommendations
    };
  }

  // NEW: Merge projects intelligently
  async mergeProjects(targetProjectId: string, sourceProject: Project): Promise<{project: Project, conflicts: FileChange[]}> {
    const targetProject = await this.loadProject(targetProjectId, false);
    if (!targetProject) {
      throw new Error(`Target project ${targetProjectId} not found`);
    }

    // Detect conflicts
    const conflicts = detectMergeConflicts(targetProject, sourceProject);
    
    // Merge projects using ProjectUtils
    const mergedProject = mergeProjects(targetProject, sourceProject);
    
    // Update structure analysis
    const projectStructure = ProjectUtils.analyzeProjectStructure(mergedProject.files);
    const projectStats = ProjectUtils.generateProjectStats(mergedProject);

    mergedProject.structure = projectStructure;

    this.saveProjectToStorage(mergedProject);

    return {
      project: mergedProject,
      conflicts
    };
  }

  // NEW: Get project insights
  async getProjectInsights(projectId: string): Promise<{
    complexity: 'simple' | 'moderate' | 'complex';
    quality: number; // 0-100
    suggestions: string[];
    techStack: string[];
  }> {
    const project = await this.loadProject(projectId, true);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const structure = project.structure || ProjectUtils.analyzeProjectStructure(project.files);
    const stats = ProjectUtils.generateProjectStats(project);
    const issues = ProjectUtils.findPotentialIssues(project);

    // Calculate complexity
    let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
    if (project.files.length > 50) complexity = 'complex';
    else if (project.files.length > 20) complexity = 'moderate';

    // Calculate quality score (0-100)
    let quality = 100;
    if (issues.length > 0) quality -= issues.length * 5;
    if (stats.averageFileSize > 20000) quality -= 10;
    if (structure.dependencies.length > 30) quality -= 10;
    quality = Math.max(0, quality);

    // Determine tech stack
    const techStack: string[] = [];
    if (structure.architecture.includes('react')) techStack.push('React');
    if (structure.architecture.includes('vue')) techStack.push('Vue');
    if (structure.architecture.includes('angular')) techStack.push('Angular');
    if (structure.architecture.includes('node')) techStack.push('Node.js');
    if (structure.architecture.includes('python')) techStack.push('Python');
    if (structure.fileTypes[CodeLanguage.TYPESCRIPT]) techStack.push('TypeScript');

    // Generate suggestions
    const suggestions: string[] = [];
    if (quality < 80) {
      suggestions.push('Project quality could be improved');
    }
    if (issues.length > 0) {
      suggestions.push(`Address ${issues.length} identified issues`);
    }
    if (stats.totalSize > 1024 * 1024) { // 1MB
      suggestions.push('Project is large - consider optimization');
    }

    return {
      complexity,
      quality,
      suggestions,
      techStack
    };
  }

  // Rest of the methods remain mostly the same, but enhanced where needed...

  // Enhanced: Get project summary using contextService
  async getProjectSummary(projectId: string): Promise<ProjectSummary> {
    const project = await this.loadProject(projectId, true);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Get insights first
    const insights = await this.getProjectInsights(projectId);
    
    // Use the context service with enhanced data
    return contextService.generateProjectSummary(
      project, 
      project.files, 
      {
        structure: project.structure,
        insights
      }
    );
  }

  // Load project from storage (active or archived)
  async loadProject(projectId: string, includeArchived: boolean = false): Promise<Project | null> {
    // Try active projects first
    const projects = this.getAllProjectsFromStorage();
    const activeProject = projects.find(p => p.id === projectId);
    
    if (activeProject) {
      return activeProject;
    }

    // If includeArchived, also check archived projects
    if (includeArchived) {
      const archives = this.getArchivedProjectsFromStorage();
      const archivedProject = archives.find(p => p.id === projectId);
      return archivedProject || null;
    }

    return null;
  }

  // Delete project permanently
  async deleteProject(projectId: string): Promise<void> {
    console.log('🗑️ Deleting project:', projectId);

    // Remove from active projects
    const projects = this.getAllProjectsFromStorage();
    const updatedProjects = projects.filter(p => p.id !== projectId);
    localStorage.setItem(this.PROJECTS_STORAGE_KEY, JSON.stringify(updatedProjects));

    // Also remove from archives if it exists there
    const archives = this.getArchivedProjectsFromStorage();
    const updatedArchives = archives.filter(p => p.id !== projectId);
    localStorage.setItem(this.ARCHIVES_STORAGE_KEY, JSON.stringify(updatedArchives));

    console.log('✅ Project deleted successfully');
  }

  // Detect changes between two sets of files
  async detectChanges(oldProject: Project, newFiles: ProjectFile[]): Promise<FileChange[]> {
    const changes: FileChange[] = [];
    const oldFilesMap = new Map(oldProject.files.map(f => [f.name, f]));
    const newFilesMap = new Map(newFiles.map(f => [f.name, f]));

    // Check for added and modified files
    for (const newFile of newFiles) {
      const oldFile = oldFilesMap.get(newFile.name);
      
      if (!oldFile) {
        // New file added
        changes.push({
          type: 'added',
          file: newFile,
          previousContent: '',
          currentContent: newFile.content
        });
      } else if (oldFile.content !== newFile.content) {
        // File modified
        changes.push({
          type: 'modified',
          file: newFile,
          previousContent: oldFile.content,
          currentContent: newFile.content
        });
      }
    }

    // Check for deleted files
    for (const oldFile of oldProject.files) {
      if (!newFilesMap.has(oldFile.name)) {
        changes.push({
          type: 'deleted',
          file: oldFile,
          previousContent: oldFile.content,
          currentContent: ''
        });
      }
    }

    return changes;
  }

  // Get all projects (for listing)
  getAllProjects(): Project[] {
    return this.getAllProjectsFromStorage();
  }

  // Get archived projects
  getArchivedProjects(): Project[] {
    return this.getArchivedProjectsFromStorage();
  }

  // Restore project from archive
  async restoreProject(projectId: string): Promise<void> {
    const archives = this.getArchivedProjectsFromStorage();
    const archivedProject = archives.find(p => p.id === projectId);

    if (!archivedProject) {
      throw new Error(`Archived project ${projectId} not found`);
    }

    // Remove archived metadata
    const restoredProject = {
      ...archivedProject,
      lastModified: Date.now(),
      metadata: {
        ...archivedProject.metadata,
        archived: false,
        restoredAt: Date.now()
      }
    };

    // Add back to active projects
    const projects = this.getAllProjectsFromStorage();
    projects.push(restoredProject);
    localStorage.setItem(this.PROJECTS_STORAGE_KEY, JSON.stringify(projects));

    // Remove from archives
    const updatedArchives = archives.filter(p => p.id !== projectId);
    localStorage.setItem(this.ARCHIVES_STORAGE_KEY, JSON.stringify(updatedArchives));

    console.log('✅ Project restored successfully:', restoredProject.name);
  }

  // Private helper methods (unchanged)
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