// Database schema types
export interface DatabaseSchema {
  projects: ProjectRecord[];
  users: UserRecord[];
  sessions: SessionRecord[];
  knowledgeBase: KnowledgeRecord[];
  settings: SettingsRecord[];
  activityLogs: ActivityLogRecord[];
  backups: BackupRecord[];
}

// Project records with enhanced metadata
export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  files: ProjectFileRecord[];
  metadata: ProjectMetadata;
  createdAt: number;
  updatedAt: number;
  lastAccessed: number;
  tags: string[];
  isArchived: boolean;
  version: string;
  storageLocation: 'local' | 'cloud' | 'both';
  size: number; // in bytes
}

export interface ProjectFileRecord {
  id: string;
  name: string;
  content: string;
  language: CodeLanguage;
  createdAt: number;
  updatedAt: number;
  size: number;
  checksum: string; // For change detection
  isActive: boolean;
}

export interface ProjectMetadata {
  architecture: string;
  dependencies: string[];
  entryPoints: string[];
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedTokens: number;
  lastAnalysis: number;
  gitStatus?: GitStatusRecord;
}

// User management
export interface UserRecord {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  preferences: UserPreferences;
  createdAt: number;
  lastLogin: number;
  isActive: boolean;
  storageQuota: number;
  usedStorage: number;
  teamId?: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  fontSize: number;
  autoSave: boolean;
  autoComplete: boolean;
  defaultModel: string;
  compressionEnabled: boolean;
  maxFileSize: number;
  backupFrequency: 'never' | 'daily' | 'weekly' | 'monthly';
}

// Session management
export interface SessionRecord {
  id: string;
  userId: string;
  projectId?: string;
  startedAt: number;
  lastActivity: number;
  userAgent: string;
  ipAddress?: string;
  isActive: boolean;
  activityCount: number;
}

// Knowledge base with enhanced structure
export interface KnowledgeRecord {
  id: string;
  userId: string;
  projectId?: string;
  title: string;
  content: string;
  tags: string[];
  category: 'code' | 'documentation' | 'pattern' | 'api' | 'learning';
  language?: CodeLanguage;
  examples: string[];
  usageCount: number;
  createdAt: number;
  updatedAt: number;
  isGlobal: boolean;
  confidence: number; // 0-1 scale for AI-generated knowledge
}

// Application settings
export interface SettingsRecord {
  id: string;
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  category: 'general' | 'ai' | 'storage' | 'ui' | 'git';
  description?: string;
  updatedAt: number;
}

// Activity logging
export interface ActivityLogRecord {
  id: string;
  userId: string;
  projectId?: string;
  type: 'create' | 'update' | 'delete' | 'execute' | 'error' | 'login' | 'export';
  action: string;
  details?: any;
  timestamp: number;
  ipAddress?: string;
  userAgent?: string;
  duration?: number; // for operations that take time
}

// Backup management
export interface BackupRecord {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  files: ProjectFileRecord[];
  version: string;
  createdAt: number;
  size: number;
  checksum: string;
  storageLocation: 'local' | 'cloud';
  isAutoBackup: boolean;
  restorePoints?: string[]; // For incremental backups
}

// Git integration records
export interface GitStatusRecord {
  branch: string;
  commitsAhead: number;
  commitsBehind: number;
  hasUncommittedChanges: boolean;
  lastCommit?: GitCommitRecord;
  remoteUrl?: string;
}

export interface GitCommitRecord {
  id: string;
  message: string;
  author: string;
  timestamp: number;
  changes: FileChangeRecord[];
  branch: string;
  hash: string;
}

export interface FileChangeRecord {
  fileId: string;
  type: 'added' | 'modified' | 'deleted';
  changes: string; // diff or patch
  timestamp: number;
}

// Storage metrics
export interface StorageMetrics {
  totalProjects: number;
  totalFiles: number;
  totalSize: number;
  usedQuota: number;
  availableQuota: number;
  largestProject: { id: string; name: string; size: number };
  oldestProject: { id: string; name: string; createdAt: number };
  recentActivity: ActivityLogRecord[];
}

// Database configuration
export interface DatabaseConfig {
  type: 'indexeddb' | 'localstorage' | 'cloud' | 'hybrid';
  name: string;
  version: number;
  cloudSync?: boolean;
  encryption?: boolean;
  backupEnabled: boolean;
  maxSize: number; // in MB
  autoCompaction: boolean;
}

// Migration types for database schema updates
export interface DatabaseMigration {
  version: number;
  description: string;
  migrate: (db: any) => Promise<void>;
}

// Query types
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: QueryFilter[];
}

export interface QueryFilter {
  field: string;
  operator: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'in';
  value: any;
}

// IndexedDB store configuration
export interface StoreConfig {
  name: string;
  keyPath: string;
  indexes?: IndexConfig[];
}

export interface IndexConfig {
  name: string;
  keyPath: string | string[];
  unique?: boolean;
  multiEntry?: boolean;
  }