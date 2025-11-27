import { 
  DatabaseSchema, 
  ProjectRecord, 
  UserRecord, 
  KnowledgeRecord, 
  SettingsRecord,
  ActivityLogRecord,
  BackupRecord,
  StorageMetrics,
  DatabaseConfig,
  QueryOptions,
  QueryFilter,
  DatabaseAdapter
} from '../types/database';
import { DATABASE_CONFIG, STORE_CONFIGS, DEFAULT_SETTINGS, BACKUP_CONFIG } from '../config/storageConfig';

// Database adapter interface for multiple backends
export interface IDatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  create<T>(storeName: string, data: Omit<T, 'id'> & { id?: string }): Promise<string>;
  read<T>(storeName: string, id: string): Promise<T | null>;
  update<T>(storeName: string, id: string, updates: Partial<T>): Promise<void>;
  delete(storeName: string, id: string): Promise<void>;
  query<T>(storeName: string, options?: QueryOptions): Promise<T[]>;
  transaction<T>(operations: () => Promise<T>): Promise<T>;
  isInitialized(): boolean;
}

// IndexedDB Adapter (current implementation)
class IndexedDBAdapter implements IDatabaseAdapter {
  private db: IDBDatabase | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initDatabase();
    return this.initPromise;
  }

  private async initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_CONFIG.name, DATABASE_CONFIG.version);

      request.onerror = () => {
        console.error('Database initialization failed:', request.error);
        reject(new Error(`Database error: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        
        // Set up error handling
        this.db.onerror = (event) => {
          console.error('Database error:', event);
        };

        console.log('Database initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createStores(db);
        this.initializeDefaultData(db);
      };
    });
  }

  // Create database stores
  private createStores(db: IDBDatabase): void {
    // Remove existing stores if they have different configuration
    const existingStores = Array.from(db.objectStoreNames);
    
    for (const storeName of existingStores) {
      if (!STORE_CONFIGS.some(config => config.name === storeName)) {
        db.deleteObjectStore(storeName);
      }
    }

    // Create new stores
    for (const config of STORE_CONFIGS) {
      if (!db.objectStoreNames.contains(config.name)) {
        const store = db.createObjectStore(config.name, { 
          keyPath: config.keyPath 
        });

        // Create indexes
        if (config.indexes) {
          for (const indexConfig of config.indexes) {
            store.createIndex(
              indexConfig.name,
              indexConfig.keyPath,
              { unique: indexConfig.unique, multiEntry: indexConfig.multiEntry }
            );
          }
        }
      }
    }
  }

  // Initialize with default data
  private initializeDefaultData(db: IDBDatabase): void {
    const transaction = db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');

    // Insert default settings
    Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
      const setting: SettingsRecord = {
        id: key,
        key: key,
        value: value,
        type: typeof value as any,
        category: key.split('.')[0] as any,
        updatedAt: Date.now()
      };
      store.put(setting);
    });

    // Create default user if none exists
    const userTransaction = db.transaction(['users'], 'readwrite');
    const userStore = userTransaction.objectStore('users');
    
    const defaultUser: UserRecord = {
      id: 'default-user',
      email: 'user@codemend.ai',
      username: 'Developer',
      preferences: {
        theme: 'dark',
        fontSize: 14,
        autoSave: true,
        autoComplete: true,
        defaultModel: 'gpt-4',
        compressionEnabled: true,
        maxFileSize: 50000,
        backupFrequency: 'daily'
      },
      createdAt: Date.now(),
      lastLogin: Date.now(),
      isActive: true,
      storageQuota: 50 * 1024 * 1024, // 50MB
      usedStorage: 0
    };

    userStore.put(defaultUser);
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      this.initPromise = null;
    }
  }

  async create<T>(storeName: string, data: Omit<T, 'id'> & { id?: string }): Promise<string> {
    await this.connect();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Generate ID if not provided
      const record = {
        ...data,
        id: data.id || this.generateId()
      };

      const request = store.add(record);

      request.onsuccess = () => {
        resolve(record.id);
      };

      request.onerror = () => {
        reject(new Error(`Failed to create record in ${storeName}: ${request.error}`));
      };
    });
  }

  async read<T>(storeName: string, id: string): Promise<T | null> {
    await this.connect();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to read record from ${storeName}: ${request.error}`));
      };
    });
  }

  async update<T>(storeName: string, id: string, updates: Partial<T>): Promise<void> {
    await this.connect();

    return new Promise(async (resolve, reject) => {
      const existing = await this.read(storeName, id);
      if (!existing) {
        reject(new Error(`Record not found: ${id}`));
        return;
      }

      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      const updatedRecord = {
        ...existing,
        ...updates,
        updatedAt: Date.now()
      };

      const request = store.put(updatedRecord);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to update record in ${storeName}: ${request.error}`));
      };
    });
  }

  async delete(storeName: string, id: string): Promise<void> {
    await this.connect();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete record from ${storeName}: ${request.error}`));
      };
    });
  }

  async query<T>(storeName: string, options: QueryOptions = {}): Promise<T[]> {
    await this.connect();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      let request: IDBRequest;

      // Apply ordering if specified
      if (options.orderBy) {
        const index = store.index(options.orderBy);
        request = index.getAll();
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        let results = request.result as T[];

        // Apply filters
        if (options.filters) {
          results = this.applyFilters(results, options.filters);
        }

        // Apply sorting
        if (options.orderBy) {
          results.sort((a: any, b: any) => {
            const aVal = a[options.orderBy!];
            const bVal = b[options.orderBy!];
            const direction = options.orderDirection === 'desc' ? -1 : 1;
            
            if (aVal < bVal) return -1 * direction;
            if (aVal > bVal) return 1 * direction;
            return 0;
          });
        }

        // Apply pagination
        if (options.offset) {
          results = results.slice(options.offset);
        }
        if (options.limit) {
          results = results.slice(0, options.limit);
        }

        resolve(results);
      };

      request.onerror = () => {
        reject(new Error(`Query failed on ${storeName}: ${request.error}`));
      };
    });
  }

  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    await this.connect();
    // For IndexedDB, we execute operations directly since each operation handles its own transaction
    return operations();
  }

  isInitialized(): boolean {
    return this.isInitialized;
  }

  private applyFilters<T>(data: T[], filters: QueryFilter[]): T[] {
    return data.filter(item => {
      return filters.every(filter => {
        const value = (item as any)[filter.field];
        
        switch (filter.operator) {
          case '==': return value === filter.value;
          case '!=': return value !== filter.value;
          case '>': return value > filter.value;
          case '>=': return value >= filter.value;
          case '<': return value < filter.value;
          case '<=': return value <= filter.value;
          case 'contains': 
            return typeof value === 'string' && value.includes(filter.value);
          case 'in':
            return Array.isArray(filter.value) && filter.value.includes(value);
          default: return true;
        }
      });
    });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// PostgreSQL Adapter (for future use with Supabase, etc.)
class PostgreSQLAdapter implements IDatabaseAdapter {
  private connection: any = null;
  private config: any;
  private initialized = false;

  constructor(config: { connectionString: string; ssl?: boolean }) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.initialized) return;
    
    // In a real implementation, this would use pg, postgres.js, or similar
    // For now, this is a placeholder structure
    console.log('Connecting to PostgreSQL...');
    
    // Example with supabase-js:
    // this.connection = createClient(this.config.connectionString, this.config.key);
    
    // For demonstration, we'll simulate connection
    await new Promise(resolve => setTimeout(resolve, 100));
    this.initialized = true;
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      // await this.connection.end();
      this.connection = null;
    }
    this.initialized = false;
  }

  async create<T>(storeName: string, data: Omit<T, 'id'> & { id?: string }): Promise<string> {
    await this.connect();
    
    // Convert to SQL INSERT
    const tableName = this.mapStoreToTable(storeName);
    const id = data.id || `pg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Remove id from data if it exists since we'll use our generated one
    const { id: _, ...insertData } = data;
    
    const columns = ['id', ...Object.keys(insertData)].join(', ');
    const values = [id, ...Object.values(insertData)].map(v => 
      typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
    ).join(', ');
    
    // In real implementation:
    // const result = await this.connection.query(
    //   `INSERT INTO ${tableName} (${columns}) VALUES (${values}) RETURNING id`
    // );
    // return result.rows[0].id;
    
    console.log(`[PostgreSQL] INSERT INTO ${tableName} (${columns}) VALUES (${values})`);
    return id;
  }

  async read<T>(storeName: string, id: string): Promise<T | null> {
    await this.connect();
    
    const tableName = this.mapStoreToTable(storeName);
    
    // In real implementation:
    // const result = await this.connection.query(
    //   `SELECT * FROM ${tableName} WHERE id = $1`, [id]
    // );
    // return result.rows[0] || null;
    
    console.log(`[PostgreSQL] SELECT * FROM ${tableName} WHERE id = '${id}'`);
    return null;
  }

  async update<T>(storeName: string, id: string, updates: Partial<T>): Promise<void> {
    await this.connect();
    
    const tableName = this.mapStoreToTable(storeName);
    const setClause = Object.entries(updates)
      .map(([key, value]) => {
        const sqlValue = typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
        return `${key} = ${sqlValue}`;
      })
      .join(', ');
    
    // await this.connection.query(
    //   `UPDATE ${tableName} SET ${setClause} WHERE id = $1`, [id]
    // );
    
    console.log(`[PostgreSQL] UPDATE ${tableName} SET ${setClause} WHERE id = '${id}'`);
  }

  async delete(storeName: string, id: string): Promise<void> {
    await this.connect();
    
    const tableName = this.mapStoreToTable(storeName);
    // await this.connection.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
    
    console.log(`[PostgreSQL] DELETE FROM ${tableName} WHERE id = '${id}'`);
  }

  async query<T>(storeName: string, options?: QueryOptions): Promise<T[]> {
    await this.connect();
    
    const tableName = this.mapStoreToTable(storeName);
    let query = `SELECT * FROM ${tableName}`;
    const params: any[] = [];
    
    if (options?.filters) {
      const whereClause = options.filters.map((filter, index) => {
        params.push(filter.value);
        return this.filterToSQL(filter, index + 1);
      }).join(' AND ');
      query += ` WHERE ${whereClause}`;
    }
    
    if (options?.orderBy) {
      query += ` ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`;
    }
    
    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
    }
    
    if (options?.offset) {
      query += ` OFFSET ${options.offset}`;
    }
    
    // const result = await this.connection.query(query, params);
    // return result.rows;
    
    console.log(`[PostgreSQL] ${query}`, params);
    return [] as T[];
  }

  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    await this.connect();
    
    // In PostgreSQL:
    // const client = await this.connection.connect();
    // try {
    //   await client.query('BEGIN');
    //   const result = await operations();
    //   await client.query('COMMIT');
    //   return result;
    // } catch (error) {
    //   await client.query('ROLLBACK');
    //   throw error;
    // } finally {
    //   client.release();
    // }
    
    return operations();
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private mapStoreToTable(storeName: string): string {
    const mapping: Record<string, string> = {
      'projects': 'projects',
      'users': 'users',
      'sessions': 'sessions',
      'knowledgeBase': 'knowledge_base',
      'settings': 'settings',
      'activityLogs': 'activity_logs',
      'backups': 'backups'
    };
    return mapping[storeName] || storeName;
  }

  private filterToSQL(filter: QueryFilter, paramIndex: number): string {
    const operators: Record<string, string> = {
      '==': '=',
      '!=': '!=',
      '>': '>',
      '>=': '>=',
      '<': '<',
      '<=': '<=',
      'contains': 'LIKE',
      'in': 'IN'
    };

    const sqlOperator = operators[filter.operator];
    let value = filter.value;

    if (filter.operator === 'contains') {
      value = `%${value}%`;
    }

    if (filter.operator === 'in' && Array.isArray(value)) {
      value = `(${value.map(v => `'${v}'`).join(', ')})`;
      return `${filter.field} ${sqlOperator} ${value}`;
    }

    return `${filter.field} ${sqlOperator} $${paramIndex}`;
  }
}

// Updated DatabaseService that can switch between adapters
export class DatabaseService {
  private static instance: DatabaseService;
  private adapter: IDatabaseAdapter;
  private currentAdapterType: 'indexeddb' | 'postgresql' = 'indexeddb';
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  constructor() {
    // Default to IndexedDB
    this.adapter = new IndexedDBAdapter();
  }

  // Switch database backend
  async switchAdapter(adapterType: 'indexeddb' | 'postgresql', config?: any): Promise<void> {
    if (this.currentAdapterType === adapterType) return;

    // Disconnect current adapter
    if (this.adapter) {
      await this.adapter.disconnect();
    }

    // Initialize new adapter
    switch (adapterType) {
      case 'indexeddb':
        this.adapter = new IndexedDBAdapter();
        break;
      case 'postgresql':
        this.adapter = new PostgreSQLAdapter(config || {});
        break;
      default:
        throw new Error(`Unsupported adapter type: ${adapterType}`);
    }

    await this.adapter.connect();
    this.currentAdapterType = adapterType;
    this.isInitialized = true;
  }

  // Initialize the database (maintains backward compatibility)
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.adapter.connect().then(() => {
      this.isInitialized = true;
    });
    
    return this.initPromise;
  }

  // All the existing methods now delegate to the adapter
  async create<T>(storeName: string, data: Omit<T, 'id'> & { id?: string }): Promise<string> {
    await this.initialize();
    const id = await this.adapter.create(storeName, data);
    this.logActivity('create', storeName, id);
    return id;
  }

  async read<T>(storeName: string, id: string): Promise<T | null> {
    await this.initialize();
    return this.adapter.read(storeName, id);
  }

  async update<T>(storeName: string, id: string, updates: Partial<T>): Promise<void> {
    await this.initialize();
    await this.adapter.update(storeName, id, updates);
    this.logActivity('update', storeName, id);
  }

  async delete(storeName: string, id: string): Promise<void> {
    await this.initialize();
    await this.adapter.delete(storeName, id);
    this.logActivity('delete', storeName, id);
  }

  async query<T>(storeName: string, options?: QueryOptions): Promise<T[]> {
    await this.initialize();
    return this.adapter.query(storeName, options);
  }

  // Project-specific operations (maintained from original)
  async createProject(projectData: Omit<ProjectRecord, 'id'>): Promise<string> {
    const project: Omit<ProjectRecord, 'id'> = {
      ...projectData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastAccessed: Date.now(),
      isArchived: false,
      size: projectData.files.reduce((sum, file) => sum + file.content.length, 0),
      storageLocation: this.currentAdapterType === 'postgresql' ? 'cloud' : 'local'
    };

    return this.create<ProjectRecord>('projects', project);
  }

  async getProject(projectId: string): Promise<ProjectRecord | null> {
    const project = await this.read<ProjectRecord>('projects', projectId);
    
    if (project) {
      // Update last accessed time
      await this.update('projects', projectId, { lastAccessed: Date.now() });
    }

    return project;
  }

  async getAllProjects(includeArchived = false): Promise<ProjectRecord[]> {
    const options: QueryOptions = {
      orderBy: 'updatedAt',
      orderDirection: 'desc'
    };

    if (!includeArchived) {
      options.filters = [{ field: 'isArchived', operator: '==', value: false }];
    }

    return this.query<ProjectRecord>('projects', options);
  }

  async archiveProject(projectId: string): Promise<void> {
    await this.update('projects', projectId, { 
      isArchived: true,
      updatedAt: Date.now()
    });
  }

  // Knowledge base operations
  async saveKnowledge(knowledge: Omit<KnowledgeRecord, 'id'>): Promise<string> {
    const knowledgeRecord: Omit<KnowledgeRecord, 'id'> = {
      ...knowledge,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usageCount: 0
    };

    return this.create<KnowledgeRecord>('knowledgeBase', knowledgeRecord);
  }

  async getKnowledgeByTags(tags: string[]): Promise<KnowledgeRecord[]> {
    // This is a simplified implementation - in production, you'd want more sophisticated tag matching
    const allKnowledge = await this.query<KnowledgeRecord>('knowledgeBase');
    
    return allKnowledge.filter(record =>
      tags.some(tag => record.tags.includes(tag)) || record.isGlobal
    );
  }

  // Settings operations
  async getSetting<T>(key: string): Promise<T | null> {
    const setting = await this.read<SettingsRecord>('settings', key);
    return setting ? setting.value : null;
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    const existing = await this.read<SettingsRecord>('settings', key);
    
    const setting: SettingsRecord = {
      id: key,
      key: key,
      value: value,
      type: typeof value as any,
      category: key.split('.')[0] as any,
      updatedAt: Date.now()
    };

    if (existing) {
      await this.update('settings', key, setting);
    } else {
      await this.create('settings', setting);
    }
  }

  // Backup operations
  async createBackup(projectId: string, description?: string): Promise<string> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const backup: Omit<BackupRecord, 'id'> = {
      projectId,
      name: `Backup-${new Date().toISOString().split('T')[0]}`,
      description: description || `Auto-backup created ${new Date().toLocaleString()}`,
      files: project.files,
      version: project.version,
      createdAt: Date.now(),
      size: project.size,
      checksum: this.generateChecksum(project.files),
      storageLocation: this.currentAdapterType === 'postgresql' ? 'cloud' : 'local',
      isAutoBackup: !description
    };

    return this.create<BackupRecord>('backups', backup);
  }

  async getProjectBackups(projectId: string): Promise<BackupRecord[]> {
    return this.query<BackupRecord>('backups', {
      filters: [{ field: 'projectId', operator: '==', value: projectId }],
      orderBy: 'createdAt',
      orderDirection: 'desc'
    });
  }

  // Storage metrics
  async getStorageMetrics(): Promise<StorageMetrics> {
    const projects = await this.getAllProjects();
    const activityLogs = await this.query<ActivityLogRecord>('activityLogs', {
      limit: 10,
      orderBy: 'timestamp',
      orderDirection: 'desc'
    });

    const totalSize = projects.reduce((sum, project) => sum + project.size, 0);
    const totalFiles = projects.reduce((sum, project) => sum + project.files.length, 0);

    const largestProject = projects.reduce((largest, project) => 
      project.size > largest.size ? project : largest
    );

    const oldestProject = projects.reduce((oldest, project) => 
      project.createdAt < oldest.createdAt ? project : oldest
    );

    return {
      totalProjects: projects.length,
      totalFiles,
      totalSize,
      usedQuota: totalSize,
      availableQuota: 50 * 1024 * 1024 - totalSize, // 50MB default quota
      largestProject: {
        id: largestProject.id,
        name: largestProject.name,
        size: largestProject.size
      },
      oldestProject: {
        id: oldestProject.id,
        name: oldestProject.name,
        createdAt: oldestProject.createdAt
      },
      recentActivity: activityLogs
    };
  }

  // Utility methods
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateChecksum(files: any[]): string {
    // Simple checksum implementation - in production, use a proper hash
    const content = files.map(f => f.content).join('');
    let hash = 0;
    
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  private async logActivity(
    type: string, 
    entity: string, 
    entityId: string,
    details?: any
  ): Promise<void> {
    const activity: Omit<ActivityLogRecord, 'id'> = {
      userId: 'default-user', // In real app, get from auth context
      type: type as any,
      action: `${type}_${entity}`,
      details,
      timestamp: Date.now()
    };

    await this.create('activityLogs', activity);
  }

  // Cleanup and maintenance
  async compactDatabase(): Promise<void> {
    // Remove old backups
    const backups = await this.query<BackupRecord>('backups', {
      orderBy: 'createdAt',
      orderDirection: 'asc'
    });

    if (backups.length > BACKUP_CONFIG.maxBackups) {
      const toDelete = backups.slice(0, backups.length - BACKUP_CONFIG.maxBackups);
      
      for (const backup of toDelete) {
        await this.delete('backups', backup.id);
      }
    }

    // Remove old activity logs (keep last 1000)
    const activities = await this.query<ActivityLogRecord>('activityLogs', {
      orderBy: 'timestamp',
      orderDirection: 'asc'
    });

    if (activities.length > 1000) {
      const toDelete = activities.slice(0, activities.length - 1000);
      
      for (const activity of toDelete) {
        await this.delete('activityLogs', activity.id);
      }
    }
  }

  // Export/Import
  async exportData(): Promise<Blob> {
    const data = {
      projects: await this.getAllProjects(true),
      knowledgeBase: await this.query<KnowledgeRecord>('knowledgeBase'),
      settings: await this.query<SettingsRecord>('settings'),
      backups: await this.query<BackupRecord>('backups'),
      exportDate: new Date().toISOString(),
      version: DATABASE_CONFIG.version
    };

    return new Blob([JSON.stringify(data, null, 2)], { 
      type: 'application/json' 
    });
  }

  async importData(file: File): Promise<void> {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate import data
    if (!data.version || !data.exportDate) {
      throw new Error('Invalid export file format');
    }

    // Import data (in a real app, you'd want more validation and conflict resolution)
    if (data.projects) {
      for (const project of data.projects) {
        await this.create('projects', project);
      }
    }

    if (data.knowledgeBase) {
      for (const knowledge of data.knowledgeBase) {
        await this.create('knowledgeBase', knowledge);
      }
    }

    // Note: Settings might be handled differently based on user preference
  }

  // Close database connection
  async close(): Promise<void> {
    await this.adapter.disconnect();
    this.isInitialized = false;
    this.initPromise = null;
  }

  // Get current adapter type
  getCurrentAdapterType(): 'indexeddb' | 'postgresql' {
    return this.currentAdapterType;
  }
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance();