import { Project, ProjectFile, FileChange, CodeLanguage, ProjectStructure } from '../types';

export class ProjectUtils {
  // Analyze project structure and extract key information
  static analyzeProjectStructure(files: ProjectFile[]): ProjectStructure {
    const structure: ProjectStructure = {
      fileTypes: {},
      dependencies: [],
      entryPoints: [],
      architecture: 'unknown',
      totalFiles: files.length,
      totalSize: 0
    };

    // Count file types and calculate total size
    files.forEach(file => {
      // File type distribution
      const lang = file.language || CodeLanguage.OTHER;
      structure.fileTypes[lang] = (structure.fileTypes[lang] || 0) + 1;
      
      // Total size
      structure.totalSize += file.content.length;

      // Detect entry points
      if (this.isEntryPoint(file.name)) {
        structure.entryPoints.push(file.name);
      }

      // Extract dependencies
      const deps = this.extractDependenciesFromFile(file);
      structure.dependencies.push(...deps);
    });

    // Remove duplicate dependencies
    structure.dependencies = [...new Set(structure.dependencies)];

    // Determine architecture
    structure.architecture = this.determineArchitecture(files, structure);

    return structure;
  }

  // Check if a file is likely an entry point
  private static isEntryPoint(filename: string): boolean {
    const entryPatterns = [
      /^index\.(js|ts|jsx|tsx)$/,
      /^main\.(js|ts|jsx|tsx)$/,
      /^app\.(js|ts|jsx|tsx)$/,
      /^server\.(js|ts)$/,
      /^App\.(js|ts|jsx|tsx)$/,
      /^Main\.(js|ts|jsx|tsx)$/,
      /package\.json$/
    ];

    return entryPatterns.some(pattern => pattern.test(filename));
  }

  // Extract dependencies from file content
  private static extractDependenciesFromFile(file: ProjectFile): string[] {
    const dependencies: string[] = [];
    const content = file.content;

    // Package.json dependencies
    if (file.name === 'package.json' && file.language === CodeLanguage.JSON) {
      try {
        const pkg = JSON.parse(content);
        if (pkg.dependencies) {
          dependencies.push(...Object.keys(pkg.dependencies));
        }
        if (pkg.devDependencies) {
          dependencies.push(...Object.keys(pkg.devDependencies));
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Python requirements
    if (file.name === 'requirements.txt') {
      const requirements = content.split('\n')
        .filter(line => line.trim() && !line.trim().startsWith('#'))
        .map(line => line.split('==')[0].split('>=')[0].trim());
      dependencies.push(...requirements);
    }

    // Import statements (JavaScript/TypeScript)
    if ([CodeLanguage.JAVASCRIPT, CodeLanguage.TYPESCRIPT].includes(file.language)) {
      const importRegex = /(?:import|from|require)\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        if (match[1] && !match[1].startsWith('.') && !match[1].startsWith('/')) {
          const dep = match[1].split('/')[0];
          if (dep && !dep.startsWith('@')) {
            dependencies.push(dep);
          }
        }
      }
    }

    return dependencies;
  }

  // Determine project architecture
  private static determineArchitecture(files: ProjectFile[], structure: ProjectStructure): string {
    const hasBackend = files.some(f => 
      f.name.includes('server.') || 
      f.name.includes('api.') || 
      f.name.includes('.py') ||
      f.name.includes('.java') ||
      f.name.includes('.go')
    );

    const hasFrontend = files.some(f => 
      f.name.includes('.html') || 
      f.name.includes('.jsx') || 
      f.name.includes('.tsx') ||
      f.name.includes('react') ||
      f.name.includes('vue') ||
      f.name.includes('component')
    );

    if (hasBackend && hasFrontend) return 'fullstack';
    if (hasBackend) return 'backend';
    if (hasFrontend) return 'frontend';
    
    // Check for specific frameworks
    if (structure.dependencies.some(d => d.includes('react'))) return 'react';
    if (structure.dependencies.some(d => d.includes('vue'))) return 'vue';
    if (structure.dependencies.some(d => d.includes('angular'))) return 'angular';
    if (structure.dependencies.some(d => d.includes('express'))) return 'node-backend';
    if (structure.dependencies.some(d => d.includes('flask') || d.includes('django'))) return 'python-backend';

    return 'unknown';
  }

  // Find related files based on imports and dependencies
  static findRelatedFiles(targetFile: ProjectFile, allFiles: ProjectFile[]): ProjectFile[] {
    const related: ProjectFile[] = [];
    const content = targetFile.content;

    // Find imported/required files
    const importRegex = /(?:import|from|require)\s+['"](\.\/[^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const resolvedFile = this.resolveImportPath(targetFile.name, importPath, allFiles);
      if (resolvedFile) {
        related.push(resolvedFile);
      }
    }

    return related;
  }

  // Resolve import path to actual file
  private static resolveImportPath(baseFile: string, importPath: string, allFiles: ProjectFile[]): ProjectFile | null {
    // Simple path resolution - in a real implementation, this would handle node_modules, etc.
    const baseDir = baseFile.substring(0, baseFile.lastIndexOf('/') + 1);
    const resolvedPath = importPath.startsWith('./') 
      ? baseDir + importPath.substring(2)
      : importPath;

    // Try exact match first
    let file = allFiles.find(f => f.name === resolvedPath);
    if (file) return file;

    // Try with extensions
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.ts'];
    for (const ext of extensions) {
      file = allFiles.find(f => f.name === resolvedPath + ext);
      if (file) return file;
    }

    return null;
  }

  // Calculate similarity between two projects (for duplicate detection)
  static calculateProjectSimilarity(projectA: Project, projectB: Project): number {
    const filesA = projectA.files;
    const filesB = projectB.files;

    if (filesA.length === 0 || filesB.length === 0) return 0;

    // Compare file structures
    const commonFiles = filesA.filter(fileA => 
      filesB.some(fileB => fileB.name === fileA.name)
    ).length;

    const totalFiles = new Set([...filesA.map(f => f.name), ...filesB.map(f => f.name)]).size;

    return commonFiles / totalFiles;
  }

  // Optimize project for performance (remove duplicates, etc.)
  static optimizeProject(project: Project): Project {
    const uniqueFiles = project.files.filter((file, index, self) => 
      index === self.findIndex(f => f.name === file.name)
    );

    return {
      ...project,
      files: uniqueFiles
    };
  }

  // Generate project statistics
  static generateProjectStats(project: Project): {
    totalFiles: number;
    totalLines: number;
    totalSize: number;
    languages: Record<string, number>;
    averageFileSize: number;
  } {
    let totalLines = 0;
    let totalSize = 0;
    const languages: Record<string, number> = {};

    project.files.forEach(file => {
      const lines = file.content.split('\n').length;
      totalLines += lines;
      totalSize += file.content.length;
      
      const lang = file.language || CodeLanguage.OTHER;
      languages[lang] = (languages[lang] || 0) + 1;
    });

    return {
      totalFiles: project.files.length,
      totalLines,
      totalSize,
      languages,
      averageFileSize: totalSize / project.files.length
    };
  }

  // Find potential issues in project
  static findPotentialIssues(project: Project): string[] {
    const issues: string[] = [];

    // Check for common issues
    const hasPackageJson = project.files.some(f => f.name === 'package.json');
    const hasNodeModules = project.files.some(f => f.name.includes('node_modules/'));

    if (hasNodeModules) {
      issues.push('Project contains node_modules - consider removing for better performance');
    }

    if (!hasPackageJson && project.files.some(f => f.language === CodeLanguage.JAVASCRIPT)) {
      issues.push('JavaScript project missing package.json');
    }

    // Check for large files
    project.files.forEach(file => {
      if (file.content.length > 100000) { // 100KB
        issues.push(`Large file detected: ${file.name} (${Math.round(file.content.length / 1024)}KB)`);
      }
    });

    // Check for missing entry points
    const hasEntryPoint = project.files.some(f => this.isEntryPoint(f.name));
    if (!hasEntryPoint && project.files.length > 0) {
      issues.push('No clear entry point detected in project');
    }

    return issues;
  }
}

// Utility function to merge two projects
export const mergeProjects = (baseProject: Project, incomingProject: Project): Project => {
  const mergedFiles = [...baseProject.files];
  
  incomingProject.files.forEach(incomingFile => {
    const existingIndex = mergedFiles.findIndex(f => f.name === incomingFile.name);
    if (existingIndex >= 0) {
      // Update existing file
      mergedFiles[existingIndex] = incomingFile;
    } else {
      // Add new file
      mergedFiles.push(incomingFile);
    }
  });

  return {
    ...baseProject,
    files: mergedFiles,
    lastModified: Date.now()
  };
};

// Utility function to detect conflicts during merge
export const detectMergeConflicts = (baseProject: Project, incomingProject: Project): FileChange[] => {
  const conflicts: FileChange[] = [];
  
  incomingProject.files.forEach(incomingFile => {
    const baseFile = baseProject.files.find(f => f.name === incomingFile.name);
    if (baseFile && baseFile.content !== incomingFile.content) {
      conflicts.push({
        type: 'conflict',
        file: incomingFile,
        previousContent: baseFile.content,
        currentContent: incomingFile.content,
        conflict: true
      });
    }
  });

  return conflicts;
};
