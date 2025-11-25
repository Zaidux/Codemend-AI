# CodeMend AI

CodeMend AI is a world-class, intelligent coding assistant that runs directly in your browser or as a mobile app. Fix bugs, explain code, and build features with AI assistance - no server required!

## 🚀 Features

*   **Multi-Provider Support:** Gemini, OpenAI, OpenRouter (Claude, DeepSeek) + **Local Models** (Ollama, LM Studio)
*   **Agentic Workflows:** Specialized Planner (Architect) and Coder (Developer) roles
*   **GitHub Integration:** Clone repositories directly into your workspace
*   **Live Web Preview:** Instant preview of HTML/CSS/JS projects
*   **Smart Diff Engine:** Review AI changes before applying
*   **Knowledge Base:** Teach AI patterns recallable via `#tags`
*   **Multimodal Input:** Text, voice, and image support
*   **Mobile Ready:** Works as PWA or native mobile app
*   **Token Optimization:** Smart context management for large projects

## 🎯 Quick Start

### Web Version (Recommended)
1. Visit [your-app-url] (can be hosted anywhere - GitHub Pages, Netlify, etc.)
2. Configure your AI provider in Settings
3. Start coding!

### Mobile App
1. **PWA**: Visit in mobile browser, tap "Add to Home Screen"
2. **Native**: Download from app stores (coming soon)

### Local Development
```bash
git clone https://github.com/Zaidux/Codemend-AI
npm install
npm run dev
```

🛠️ User Guide

Getting Started

1. Select AI Provider: Settings → APIs & Models → Choose Gemini (free), OpenAI, or Local (Ollama)
2. Create Project: New project or clone from GitHub using the repo icon
3. Start Coding: Use the code editor and chat with AI

Modes & Features

· Fix Mode: AI creates plan and modifies files
· Explain Mode: Detailed code explanations
· Normal Mode: General chat with optional internet access
· #tags: Save/recall knowledge (e.g., #auth-pattern)
· Diff Review: Accept/reject AI changes visually

Mobile Usage

· Touch-optimized interface
· Offline capability for existing projects
· Voice input for hands-free coding
· File system access on mobile

🏗️ Architecture

Frontend: React 19 + TypeScript + Vite
Styling: Tailwind CSS + Custom Theme System
AI: Multi-provider LLM orchestration
Storage: LocalStorage (offline-first)
Mobile: PWA + Capacitor ready

🔧 Developer Setup

Prerequisites

· Node.js 18+
· AI API key (optional - works with local models)

Installation

```bash
# Clone and install
git clone https://github.com/Zaidux/Codemend-AI
cd codemend-ai
npm install

# Development
npm run dev

# Build for production
npm run build

# Mobile build (optional)
npm install @capacitor/core @capacitor/cli
npx cap add android ios
```

Local Model Setup

1. Install Ollama
2. Pull a model: ollama pull codellama:7b
3. In CodeMend: Settings → Provider → Local → URL: http://localhost:11434

🚀 Deployment

Web Hosting (Free Options)

· GitHub Pages: npm run build + deploy /dist
· Netlify: Drag & drop dist folder
· Vercel: Connect GitHub repo

Mobile Stores

· Android: Build with Capacitor → Upload to Play Store
· iOS: Build with Capacitor → Submit to App Store

🔮 Roadmap

· GitHub Commits: Push changes directly from UI
· Terminal Integration: Web-based terminal via WebContainers
· Team Collaboration: Real-time multi-user editing
· Plugin System: Extensible tool ecosystem
· Desktop App: Electron wrapper

📄 License

Copyright (c) 2024 CodeMend AI

Usage Rights

· Personal/Educational: Free forever
· Commercial Use: Requires license agreement
· Modifications: Allowed with attribution

Support

If this project helps you, consider supporting development:

· [Donation Link]
· [Sponsorship Options]

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
