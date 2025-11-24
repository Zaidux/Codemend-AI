
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
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  code: string;
  language: CodeLanguage;
  messages: ChatMessage[];
  lastModified: number;
  mode: AppMode;
}

export interface FixRequest {
  code: string;
  language: CodeLanguage;
  history: ChatMessage[]; // Full conversation history
  currentMessage: string; // The new prompt
  mode: AppMode;
  useHighCapacity: boolean;
}

export interface FixResponse {
  response: string;
  error?: string;
  contextSummarized?: boolean; // Flag to tell UI we optimized context
}