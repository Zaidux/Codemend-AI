
# CodeMend AI

CodeMend AI is a world-class, intelligent coding assistant designed to help developers fix bugs, explain complex logic, and architect solutions using advanced LLM capabilities (Gemini, OpenAI, Anthropic).

## 🚀 Features

*   **Multi-Provider Support:** Seamlessly switch between Google Gemini, OpenAI (GPT-4), and OpenRouter (Claude, DeepSeek).
*   **Agentic Workflows:** Specialized roles for Planning (Architect) and Coding (Developer) to handle complex tasks.
*   **GitHub Integration:** Clone repositories directly into the workspace to analyze and fix code.
*   **Live Web Preview:** Instantly preview HTML/CSS/JS projects in a sandboxed iframe.
*   **Diff Engine:** Review AI-proposed changes line-by-line before applying them.
*   **Knowledge Base:** Teach the AI new patterns or preferences, which it recalls via `#tags`.
*   **Multimodal Input:** Chat using text, voice, and images.
*   **Token Optimization:** Smart context management ("Lazy Loading") for large projects using file search tools.

## 🛠️ Usage

### Getting Started
1.  **Select Provider:** Open Settings -> APIs & Models. Enter your API Key for Gemini (Free tier available), OpenAI, or OpenRouter.
2.  **Create Project:** Use the Sidebar to create a new project or **Clone from GitHub** using the Github icon.
3.  **Chat:** Type your request. Use specific modes:
    *   **Fix:** The AI creates a plan and attempts to modify files.
    *   **Explain:** The AI explains the code context.
    *   **Normal:** General conversation with Internet access.

### Advanced Features
*   **#tags:** Save a snippet to the Knowledge Base (e.g., `#auth-pattern`). Use `#auth-pattern` in chat to inject that context.
*   **Diff Review:** When the AI uses `update_file`, a diff overlay appears. Accept or Reject changes.
*   **Roles:** In Settings, you can create custom personas (e.g., "Rust Expert") and assign them to the Planner or Coder agents.

## 🏗️ Architecture

CodeMend is built with:
*   **React 18 & TypeScript:** For a robust, type-safe frontend.
*   **Tailwind CSS:** For a highly customizable, theme-aware UI.
*   **PrismJS:** For syntax highlighting.
*   **Gemini SDK & Fetch API:** For communicating with LLM providers.
*   **LocalStorage:** For client-side persistence of projects and sessions.

## 🔮 Future Roadmap

*   **GitHub Commit:** Push changes back to the repository directly from the UI.
*   **Terminal Integration:** A web-based terminal for running scripts (via WebContainers).
*   **Team Sync:** Real-time collaboration on projects.
*   **Plugin System:** Allow third-party tools to be registered with the Agent.

## 📄 License & Terms

**Copyright (c) 2024 CodeMend AI Author**

### 1. Educational & Personal Use
Permission is hereby granted, free of charge, to any person obtaining a copy of this software (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, and distribute copies of the Software for **private, educational, or non-profit purposes**.

### 2. Commercial Use & Royalties
Use of this Software for commercial purposes (including but not limited to: using the Software to build proprietary products for sale, offering the Software as a paid service, or integrating it into a for-profit workflow) requires a **Commercial License**.

Developers or Organizations intending to use CodeMend AI commercially must negotiate a Royalty Agreement with the original author.

### 3. Donations
If you find this project useful for your learning or personal projects, consider supporting the developer:
*   [Link to Donation Platform Placeholder]

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
