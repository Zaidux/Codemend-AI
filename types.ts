
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

export type AppMode = 'FIX' | 'EXPLAIN';
export type ThemeType = 'cosmic' | 'aurora' | 'forest' | 'midnight' | 'sunset';
export type ViewMode = 'classic' | 'chat';

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

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string; // Can be text or JSON string for tool calls
  timestamp: number;
  isToolCall?: boolean;
  toolCallId?: string;
}

export interface ProjectFile {
  id: string;
  name: string;
  language: CodeLanguage;
  content: string;
}

export interface Session {
  id: string;
  title: string;
  files: ProjectFile[];
  activeFileId: string;
  messages: ChatMessage[];
  lastModified: number;
  mode: AppMode;
}

export interface FixRequest {
  activeFile: ProjectFile;
  allFiles: ProjectFile[]; // Context of other files
  history: ChatMessage[]; 
  currentMessage: string; 
  mode: AppMode;
  useHighCapacity: boolean;
}

export interface FixResponse {
  response: string;
  error?: string;
  contextSummarized?: boolean;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: any;
}
