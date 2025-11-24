
import { CodeLanguage, ThemeType, ThemeConfig } from './types';

export const LANGUAGES: CodeLanguage[] = [
  CodeLanguage.JAVASCRIPT,
  CodeLanguage.TYPESCRIPT,
  CodeLanguage.PYTHON,
  CodeLanguage.HTML,
  CodeLanguage.CSS,
  CodeLanguage.JAVA,
  CodeLanguage.CPP,
  CodeLanguage.CSHARP,
  CodeLanguage.GO,
  CodeLanguage.RUST,
  CodeLanguage.SQL,
  CodeLanguage.JSON,
  CodeLanguage.PHP,
  CodeLanguage.BASH,
  CodeLanguage.OTHER
];

export const DEFAULT_INSTRUCTION = "Fix any bugs and improve code quality.";

// Context Management Constants
export const CONTEXT_THRESHOLD_CHARS = 25000; 
export const SUMMARY_TOKEN_BUDGET = 1000; 

// Syntax Highlight Colors for Overlay
export const THEME_COLORS: Record<ThemeType, { keyword: string, string: string, function: string, comment: string, number: string }> = {
  cosmic: {
    keyword: '#c084fc', // Purple
    string: '#a5f3fc', // Cyan
    function: '#818cf8', // Indigo
    comment: '#64748b', // Slate
    number: '#f472b6' // Pink
  },
  aurora: {
    keyword: '#e879f9', // Fuchsia
    string: '#c4b5fd', // Violet
    function: '#f0abfc', // Pink
    comment: '#71717a', // Zinc
    number: '#22d3ee' // Cyan
  },
  forest: {
    keyword: '#4ade80', // Green
    string: '#a7f3d0', // Emerald
    function: '#2dd4bf', // Teal
    comment: '#78716c', // Stone
    number: '#fbbf24' // Amber
  },
  midnight: {
    keyword: '#ffffff', // White
    string: '#d4d4d4', // Gray
    function: '#e5e5e5', // Light Gray
    comment: '#525252', // Dark Gray
    number: '#a3a3a3' // Med Gray
  },
  sunset: {
    keyword: '#fb923c', // Orange
    string: '#fcd34d', // Amber
    function: '#fca5a5', // Red
    comment: '#737373', // Neutral
    number: '#fbbf24' // Yellow
  }
};

export const THEMES: Record<ThemeType, ThemeConfig> = {
  cosmic: {
    name: 'Cosmic',
    bgApp: 'bg-slate-900',
    bgPanel: 'bg-slate-900',
    bgPanelHeader: 'bg-slate-800/80',
    border: 'border-slate-800',
    textMain: 'text-slate-200',
    textMuted: 'text-slate-400',
    accent: 'text-indigo-400',
    accentBg: 'bg-indigo-500/10',
    button: 'bg-indigo-600',
    buttonHover: 'hover:bg-indigo-500',
    codeBg: 'bg-slate-950',
    scrollbarThumb: 'bg-slate-700',
    gradientTitle: 'from-indigo-400 to-cyan-400'
  },
  aurora: {
    name: 'Aurora',
    bgApp: 'bg-zinc-950',
    bgPanel: 'bg-zinc-900',
    bgPanelHeader: 'bg-zinc-800/80',
    border: 'border-zinc-800',
    textMain: 'text-zinc-100',
    textMuted: 'text-zinc-400',
    accent: 'text-fuchsia-400',
    accentBg: 'bg-fuchsia-500/10',
    button: 'bg-fuchsia-600',
    buttonHover: 'hover:bg-fuchsia-500',
    codeBg: 'bg-black',
    scrollbarThumb: 'bg-zinc-700',
    gradientTitle: 'from-fuchsia-400 to-violet-400'
  },
  forest: {
    name: 'Forest',
    bgApp: 'bg-stone-950',
    bgPanel: 'bg-stone-900',
    bgPanelHeader: 'bg-stone-800/80',
    border: 'border-stone-800',
    textMain: 'text-stone-200',
    textMuted: 'text-stone-400',
    accent: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10',
    button: 'bg-emerald-600',
    buttonHover: 'hover:bg-emerald-500',
    codeBg: 'bg-stone-950',
    scrollbarThumb: 'bg-stone-700',
    gradientTitle: 'from-emerald-400 to-teal-400'
  },
  midnight: {
    name: 'Midnight',
    bgApp: 'bg-black',
    bgPanel: 'bg-gray-900',
    bgPanelHeader: 'bg-gray-800/80',
    border: 'border-gray-800',
    textMain: 'text-gray-100',
    textMuted: 'text-gray-400',
    accent: 'text-white',
    accentBg: 'bg-white/10',
    button: 'bg-white text-black',
    buttonHover: 'hover:bg-gray-200',
    codeBg: 'bg-black',
    scrollbarThumb: 'bg-gray-700',
    gradientTitle: 'from-white to-gray-400'
  },
  sunset: {
    name: 'Sunset',
    bgApp: 'bg-neutral-900',
    bgPanel: 'bg-neutral-800',
    bgPanelHeader: 'bg-neutral-800/80',
    border: 'border-neutral-700',
    textMain: 'text-neutral-100',
    textMuted: 'text-neutral-400',
    accent: 'text-orange-400',
    accentBg: 'bg-orange-500/10',
    button: 'bg-orange-600',
    buttonHover: 'hover:bg-orange-500',
    codeBg: 'bg-neutral-950',
    scrollbarThumb: 'bg-neutral-600',
    gradientTitle: 'from-orange-400 to-amber-300'
  }
};
