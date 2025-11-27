import { DatabaseConfig, StoreConfig, DatabaseMigration } from '../types/database';

// Main database configuration
export const DATABASE_CONFIG: DatabaseConfig = {
  type: 'indexeddb',
  name: 'CodeMendAI',
  version: 3,
  cloudSync: false, // Future feature
  encryption: true,
  backupEnabled: true,
  maxSize: 500, // 500MB
  autoCompaction: true
};

// IndexedDB store configurations
export const STORE_CONFIGS: StoreConfig[] = [
  {
    name: 'projects',
    keyPath: 'id',
    indexes: [
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'createdAt', keyPath: 'createdAt', unique: false },
      { name: 'updatedAt', keyPath: 'updatedAt', unique: false },
      { name: 'tags', keyPath: 'tags', unique: false, multiEntry: true },
      { name: 'isArchived', keyPath: 'isArchived', unique: false }
    ]
  },
  {
    name: 'users',
    keyPath: 'id',
    indexes: [
      { name: 'email', keyPath: 'email', unique: true },
      { name: 'username', keyPath: 'username', unique: true },
      { name: 'lastLogin', keyPath: 'lastLogin', unique: false }
    ]
  },
  {
    name: 'sessions',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId', unique: false },
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'isActive', keyPath: 'isActive', unique: false },
      { name: 'lastActivity', keyPath: 'lastActivity', unique: false }
    ]
  },
  {
    name: 'knowledgeBase',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId', unique: false },
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'tags', keyPath: 'tags', unique: false, multiEntry: true },
      { name: 'category', keyPath: 'category', unique: false },
      { name: 'language', keyPath: 'language', unique: false },
      { name: 'isGlobal', keyPath: 'isGlobal', unique: false },
      { name: 'createdAt', keyPath: 'createdAt', unique: false }
    ]
  },
  {
    name: 'settings',
    keyPath: 'id',
    indexes: [
      { name: 'key', keyPath: 'key', unique: true },
      { name: 'category', keyPath: 'category', unique: false }
    ]
  },
  {
    name: 'activityLogs',
    keyPath: 'id',
    indexes: [
      { name: 'userId', keyPath: 'userId', unique: false },
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'type', keyPath: 'type', unique: false },
      { name: 'timestamp', keyPath: 'timestamp', unique: false }
    ]
  },
  {
    name: 'backups',
    keyPath: 'id',
    indexes: [
      { name: 'projectId', keyPath: 'projectId', unique: false },
      { name: 'createdAt', keyPath: 'createdAt', unique: false },
      { name: 'isAutoBackup', keyPath: 'isAutoBackup', unique: false }
    ]
  }
];

// Default application settings
export const DEFAULT_SETTINGS = {
  // General settings
  'app.theme': 'dark',
  'app.language': 'en',
  'app.autoSave': true,
  'app.autoSaveInterval': 30000, // 30 seconds
  'app.maxRecentProjects': 10,
  
  // AI settings
  'ai.defaultModel': 'gpt-4',
  'ai.maxTokens': 4000,
  'ai.temperature': 0.1,
  'ai.enableCompression': true,
  'ai.compressionThreshold': 10000,
  
  // Storage settings
  'storage.autoBackup': true,
  'storage.backupFrequency': 'daily',
  'storage.maxBackups': 10,
  'storage.keepBackupsDays': 30,
  'storage.warnOnLargeFiles': true,
  'storage.maxFileSize': 50000, // 50KB
  
  // Git settings
  'git.autoCommit': false,
  'git.defaultCommitMessage': 'Auto-commit: {changes}',
  'git.enablePush': false,
  
  // Terminal settings
  'terminal.autoScroll': true,
  'terminal.maxOutputLines': 1000,
  'terminal.enableSounds': false,
  
  // Security settings
  'security.encryption': true,
  'security.autoLock': false,
  'security.lockTimeout': 300000, // 5 minutes
};

// Storage quotas
export const STORAGE_QUOTAS = {
  FREE: {
    maxProjects: 10,
    maxFilesPerProject: 50,
    maxFileSize: 100000, // 100KB
    totalStorage: 50 * 1024 * 1024, // 50MB
    backupEnabled: true,
    maxBackups: 5
  },
  PRO: {
    maxProjects: 100,
    maxFilesPerProject: 500,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    totalStorage: 5 * 1024 * 1024 * 1024, // 5GB
    backupEnabled: true,
    maxBackups: 50,
    cloudSync: true
  },
  ENTERPRISE: {
    maxProjects: 1000,
    maxFilesPerProject: 5000,
    maxFileSize: 100 * 1024 * 1024, // 100MB
    totalStorage: 50 * 1024 * 1024 * 1024, // 50GB
    backupEnabled: true,
    maxBackups: 500,
    cloudSync: true,
    teamFeatures: true
  }
};

// Database migrations for schema updates
export const DATABASE_MIGRATIONS: DatabaseMigration[] = [
  {
    version: 2,
    description: 'Add user sessions and activity logging',
    migrate: async (db: any) => {
      // Migration logic for v1 to v2
      const transaction = db.transaction(['projects', 'sessions', 'activityLogs'], 'readwrite');
      
      // Add lastAccessed field to all projects
      const projectsStore = transaction.objectStore('projects');
      const projects = await projectsStore.getAll();
      
      for (const project of projects) {
        project.lastAccessed = project.createdAt || Date.now();
        await projectsStore.put(project);
      }
    }
  },
  {
    version: 3,
    description: 'Add storage metrics and backup system',
    migrate: async (db: any) => {
      const transaction = db.transaction(['projects', 'backups'], 'readwrite');
      
      // Add size field to all projects
      const projectsStore = transaction.objectStore('projects');
      const projects = await projectsStore.getAll();
      
      for (const project of projects) {
        project.size = project.files?.reduce((sum: number, file: any) => 
          sum + (file.content?.length || 0), 0) || 0;
        project.storageLocation = 'local';
        await projectsStore.put(project);
      }
    }
  }
];

// Backup configuration
export const BACKUP_CONFIG = {
  autoBackup: true,
  backupInterval: 24 * 60 * 60 * 1000, // 24 hours
  maxBackups: 10,
  backupBeforeMajorOperations: true,
  compressBackups: true,
  includeSettingsInBackup: true,
  includeKnowledgeBaseInBackup: true
};

// Encryption configuration (for future use)
export const ENCRYPTION_CONFIG = {
  algorithm: 'AES-GCM',
  keyLength: 256,
  salt: 'codemend-storage-salt', // In production, this should be user-specific
  iterations: 100000
};
