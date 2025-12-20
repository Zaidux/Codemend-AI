# Recent Improvements (Dec 20, 2024)

## ✅ Completed Enhancements

### 1. Web Preview Rendering Fixed 🎨
**Problem**: Web preview showed console logs but the app wasn't rendering.

**Solution**: Improved JSX transformation and auto-mount logic for React components.

### 2. AI-Powered Session Naming 🤖
**Problem**: Sessions used first 30 chars of message.

**Solution**: Gemini Flash API generates concise 3-5 word descriptive titles.

### 3. Session Renaming ✏️
**Problem**: Could only rename projects, not sessions.

**Solution**: Added inline edit UI with keyboard shortcuts.

### 4. Git Pull Detection 🔄
**Problem**: No indication of remote changes.

**Solution**: GitHub API integration with visual status indicators.

### 5. Tool Execution Optimization ⚡
**Solution**: Shortened error messages by ~30% for faster rendering.

See commit ca60bc8 for full details.
