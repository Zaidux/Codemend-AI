// Re-export specific types if needed, or define them here.
// I am keeping your existing structure but fixing the DatabaseConfig conflict.

export enum CodeLanguage {
  JAVASCRIPT = 'JavaScript',
  TYPESCRIPT = 'TypeScript',
  PYTHON = 'Python',
  HTML = 'HTML',
  CSS = 'CSS',
  JAVA = 'Java',
  CPP = 'C++',
  CSHARP = 'C#',
  GO = 'Go',
  RUST = 'Rust',
  SQL = 'SQL',
  JSON = 'JSON',
  PHP = 'PHP',
  BASH = 'Bash',
  OTHER = 'Other'
}

export type AppMode = 'FIX' | 'EXPLAIN' | 'CHAT' | 'NORMAL';
export type ThemeType = 'cosmic' | 'aurora' | 'forest' | 'midnight' | 'sunset' | 'crimson';
export type ViewMode = 'classic' | 'chat';
export type LLMProvider = 'gemini' | 'openai' | 'openrouter' | 'local';

export interface ThemeConfig {
  name: string;
  bgApp: string;
  bgPanel: string;
  bgPanelHeader: string;
  border: string;
  textMain: string;
  textMuted: string;
  accent: string;
  accentBg: string;
  button: string;
  buttonHover: string;
  codeBg: string;
  scrollbarThumb: string;
  gradientTitle: string;
}

export interface ProjectFile {
    id: string;
    name: string;
    language: CodeLanguage;
    content: string;
}

export interface FileChange {
  type: 'added' | 'modified' | 'deleted' | 'conflict';
  file: ProjectFile;
  previousContent: string;
  currentContent: string;
  conflict?: boolean;
}

export interface GitCommit {
  id: string;
  message: string;
  author: string;
  timestamp: number;
  changes: FileChange[];
  branch: string;
}

export interface GitBranch {
  name: string;
  head: string;
  commits: string[];
}

export interface GitStatus {
  hasGit: boolean;
  changes: FileChange[];
  currentBranch: string;
  branches: string[];
  ahead: number;
  behind: number;
}

export interface ProjectMetadata {
  description?: string;
  tags: string[];
  version: string;
  archived?: boolean;
  archivedAt?: number;
}

export interface ProjectStructure {
  fileTypes: Record<string, number>;
  dependencies: string[];
  entryPoints: string[];
  architecture: string;
  totalFiles: number;
  totalSize: number;
}

export interface Project {
    id: string;
    name: string;
    files: ProjectFile[];
    activeFileId: string;
    lastModified: number;
    metadata?: ProjectMetadata;
    structure?: ProjectStructure;
    gitStatus?: GitStatus;
}

export interface Attachment {
    type: 'image' | 'audio';
    content: string; // Base64
    mimeType: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  attachments?: Attachment[];
}

export interface Session {
  id: string;
  projectId: string;
  title: string;
  messages: ChatMessage[];
  lastModified: number;
  mode: AppMode;
}

export interface AgentRole {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    isCustom: boolean;
}

export interface KnowledgeEntry {
    id: string;
    tags: string[];
    content: string;
    scope: 'project' | 'global';
    timestamp: number;
}

export interface TodoItem {
    id: string;
    task: string;
    status: 'pending' | 'in_progress' | 'completed';
    phase: string;
}

export interface FileDiff {
    id: string;
    fileName: string;
    originalContent: string;
    newContent: string;
    type: 'create' | 'update' | 'delete';
}

export interface GitHubConfig {
    personalAccessToken?: string;
}

export interface CompressionConfig {
  enabled: boolean;
  maxFiles: number;
  maxFileSize: number;
  autoSummarize: boolean;
  preserveStructure: boolean;
}

export interface ProjectSummary {
  id: string;
  projectId: string;
  summary: string;
  keyFiles: string[];
  architecture: string;
  dependencies: string[];
  entryPoints: string[];
  timestamp: number;
}

export interface FileSummary {
  fileId: string;
  fileName: string;
  summary: string;
  purpose: string;
  keyFunctions: string[];
  dependencies: string[];
  complexity: 'low' | 'medium' | 'high';
}

export interface ContextTransfer {
  id: string;
  sourceModel: string;
  targetModel: string;
  projectSummary: ProjectSummary;
  conversationContext: string;
  currentTask: string;
  completedSteps: string[];
  pendingSteps: string[];
  timestamp: number;
}

// *** FIXED DATABASE CONFIG ***
// This unifies the fields needed by the UI
export interface DatabaseConfig {
  type: 'indexeddb' | 'postgresql' | 'mongodb' | 'supabase';
  connectionString?: string;
  databaseName?: string;
  username?: string;
  password?: string;
  host?: string;
  port?: number;
  ssl?: boolean;
  backupEnabled: boolean;
  encryption: boolean;
  maxSize: number; // in MB
  cloudSync?: boolean;
}

export interface LLMConfig {
    provider: LLMProvider;
    apiKey?: string;
    baseUrl?: string; // Used for local/custom providers
    plannerRoleId: string;
    coderRoleId: string;
    // Granular Model Assignment
    activeModelId: string; // Fallback / Chat Default
    plannerModelId: string;
    coderModelId: string;
    chatModelId: string;
    github?: GitHubConfig;
    compression?: CompressionConfig;
    database?: DatabaseConfig; // Optional separate database config
}

export interface FixRequest {
  llmConfig: LLMConfig;
  history: ChatMessage[];
  currentMessage: string;
  activeFile: ProjectFile;
  allFiles: ProjectFile[];
  mode: AppMode;
  attachments?: Attachment[];
  useHighCapacity: boolean;
  roles: AgentRole[];
  knowledgeBase: KnowledgeEntry[];
  useInternet: boolean;
  currentTodos: TodoItem[];
  projectSummary?: ProjectSummary;
  useCompression?: boolean;
  contextTransfer?: ContextTransfer;
}

export interface ToolCall {
    id: string;
    name: string;
    args: any;
}

export interface SearchResult {
    fileId: string;
    fileName: string;
    line: number;
    content: string;
}

export interface FixResponse {
  response: string;
  error?: string;
  toolCalls?: ToolCall[];
  contextSummarized?: boolean;
  proposedChanges?: FileDiff[];
  searchResults?: SearchResult[];
}