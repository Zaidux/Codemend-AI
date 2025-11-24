
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
export type LLMProvider = 'gemini' | 'openai' | 'openrouter';

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

export interface Project {
    id: string;
    name: string;
    files: ProjectFile[];
    activeFileId: string;
    lastModified: number;
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

export interface LLMConfig {
    provider: LLMProvider;
    apiKey?: string;
    baseUrl?: string; // For OpenAI compatible
    plannerRoleId: string;
    coderRoleId: string;
    activeModelId: string;
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
}

export interface ToolCall {
    id: string;
    name: string;
    args: any;
}

export interface FixResponse {
  response: string;
  error?: string;
  toolCalls?: ToolCall[];
  contextSummarized?: boolean;
}
