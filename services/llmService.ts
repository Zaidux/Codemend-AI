import { FixRequest, FixResponse, ToolCall, LLMConfig, Attachment, KnowledgeEntry, FileDiff, ProjectFile, SearchResult } from '../types';
import { contextService } from './contextService';
import { callGemini, callOpenAICompatible, callOpenAICompatibleStream } from './llmClient';
import { ToolUsageLogger, KnowledgeManager } from './llmTools';
import { errorDetectionService } from './errorDetectionService';

// --- HELPERS ---
const estimateTokens = (text: string) => Math.ceil(text.length / 4);
const LAZY_LOAD_THRESHOLD = 30000;
const MAX_AGENT_TURNS = 5; // Prevent infinite loops
const PROTECTED_FILES = ['.env', '.git', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store'];

// Generate UUID for tool calls and changes
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Security Check
const isFileProtected = (fileName: string): boolean => {
  return PROTECTED_FILES.some(protectedStr => fileName.includes(protectedStr));
};

// --- ROBUST JSON PARSER ---
const safeJsonParse = (jsonStr: string): any => {
  if (!jsonStr) return {};
  
  // 1. Strip Markdown code blocks if present
  let cleanStr = jsonStr.replace(/```json\n?|```/g, '').trim();
  
  // 2. Simple Parse Attempt
  try {
    return JSON.parse(cleanStr);
  } catch (e) {
    // 3. Advanced Sanitation for Common LLM and Streaming Errors
    try {
      // Fix trailing commas in objects/arrays
      cleanStr = cleanStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      
      // Fix missing quotes on keys (common streaming error: {name, "value"} -> {"name": "value"})
      cleanStr = cleanStr.replace(/{\s*([a-zA-Z_][a-zA-Z0-9_]*)(\s*[,:}])/g, '{"$1"$2');
      cleanStr = cleanStr.replace(/,\s*([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, ',"$1"$2');
      
      // Fix incomplete string quotes (e.g., {"name: "value"} -> {"name": "value"})
      cleanStr = cleanStr.replace(/(["'])([^"']*?)([,:}])/g, (match, quote, content, ending) => {
        if (!content.endsWith(quote)) return quote + content + quote + ending;
        return match;
      });
      
      // Escape unescaped newlines inside string values
      cleanStr = cleanStr.replace(/\n/g, '\\n').replace(/\r/g, '');
      
      return JSON.parse(cleanStr);
    } catch (e2) {
      // 4. Last resort: try to extract key-value pairs manually
      try {
        const keyValuePairs = cleanStr.match(/(["']?[a-zA-Z_][a-zA-Z0-9_]*["']?)\s*:\s*(["'][^"']*["']|[^,}]+)/g);
        if (keyValuePairs) {
          const obj: any = {};
          keyValuePairs.forEach(pair => {
            const [key, value] = pair.split(':').map(s => s.trim());
            const cleanKey = key.replace(/["']/g, '');
            const cleanValue = value.replace(/^["']|["']$/g, '');
            obj[cleanKey] = cleanValue;
          });
          console.warn("JSON Parse: Used fallback parser", obj);
          return obj;
        }
      } catch (e3) {
        // Final fallback
      }
      
      console.error("JSON Parse Failed:", cleanStr);
      throw new Error(`Invalid JSON format. Logic failed to repair: ${jsonStr.substring(0, 50)}...`);
    }
  }
};

// --- ENHANCED RETRY LOGIC WITH EXPONENTIAL BACKOFF (Phase 7) ---
/**
 * Retry a tool execution with exponential backoff for transient errors
 */
const retryToolWithBackoff = async (
  toolName: string,
  args: any,
  files: ProjectFile[],
  logger: ToolUsageLogger,
  knowledgeManager: KnowledgeManager,
  sessionId?: string
): Promise<{ output: string; change?: FileDiff; multiChanges?: FileDiff[] }> => {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = executeToolAction(toolName, args, files, logger, knowledgeManager);
      
      // If successful, return immediately
      if (!result.output.startsWith('Error:')) {
        if (attempt > 1) {
          // Mark the error as resolved
          console.log(`✅ Tool ${toolName} succeeded on attempt ${attempt}`);
        }
        return result;
      }
      
      // Check if error is retryable
      const error = new Error(result.output);
      error.name = 'ToolExecutionError';
      const detectedError = errorDetectionService.detectFromToolExecution(
        toolName,
        error,
        sessionId,
        attempt
      );
      
      // Check if we should retry
      if (!errorDetectionService.shouldRetry(detectedError)) {
        console.warn(`❌ Error not retryable for ${toolName}:`, result.output);
        return result; // Return error result
      }
      
      // Wait with exponential backoff before retrying
      const delay = errorDetectionService.getRetryDelay(attempt);
      console.log(`⏳ Retrying ${toolName} in ${delay}ms (attempt ${attempt}/3)...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      lastError = error;
    } catch (error: any) {
      lastError = error;
      console.error(`❌ Exception during ${toolName} execution:`, error);
      
      // For unexpected errors, wait and retry
      const delay = errorDetectionService.getRetryDelay(attempt);
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  return {
    output: `Error: All retry attempts failed for ${toolName}. Last error: ${lastError?.message || 'Unknown error'}`,
  };
};

// --- INTELLIGENT TOOL PARAMETER FIX ---
/**
 * Attempts to automatically fix common tool parameter errors
 * Returns whether retry should be attempted and fixed parameters
 */
const attemptToolParameterFix = (
  toolName: string,
  originalArgs: any,
  errorMessage: string,
  allFiles: ProjectFile[]
): { shouldRetry: boolean; fixedArgs?: any; suggestion?: string } => {
  const fileNames = allFiles.map(f => f.name);
  
  // File not found errors
  if (errorMessage.includes('File') && errorMessage.includes('not found')) {
    const attemptedFileName = originalArgs.fileName || originalArgs.name;
    if (attemptedFileName) {
      // Try fuzzy matching
      const similarFiles = fileNames.filter(f => 
        f.toLowerCase().includes(attemptedFileName.toLowerCase()) ||
        attemptedFileName.toLowerCase().includes(f.toLowerCase())
      );
      
      if (similarFiles.length === 1) {
        return {
          shouldRetry: true,
          fixedArgs: { ...originalArgs, fileName: similarFiles[0], name: similarFiles[0] },
          suggestion: `Found similar file: ${similarFiles[0]}`
        };
      } else if (similarFiles.length > 1) {
        return {
          shouldRetry: false,
          suggestion: `Multiple matches found: ${similarFiles.join(', ')}. Please be more specific.`
        };
      }
      
      // Check for common path issues (e.g., missing 'src/')
      const withSrc = `src/${attemptedFileName}`;
      const withoutSrc = attemptedFileName.replace(/^src\//, '');
      
      if (fileNames.includes(withSrc)) {
        return {
          shouldRetry: true,
          fixedArgs: { ...originalArgs, fileName: withSrc, name: withSrc },
          suggestion: `File exists at ${withSrc}`
        };
      } else if (fileNames.includes(withoutSrc)) {
        return {
          shouldRetry: true,
          fixedArgs: { ...originalArgs, fileName: withoutSrc, name: withoutSrc },
          suggestion: `File exists at ${withoutSrc}`
        };
      }
    }
  }
  
  // Line number out of bounds
  if (errorMessage.includes('line') && (errorMessage.includes('range') || errorMessage.includes('invalid'))) {
    const fileName = originalArgs.fileName;
    const file = allFiles.find(f => f.name === fileName);
    if (file) {
      const lineCount = file.content.split('\n').length;
      const startLine = Math.max(1, Math.min(originalArgs.startLine || 1, lineCount));
      const endLine = Math.max(startLine, Math.min(originalArgs.endLine || lineCount, lineCount));
      
      return {
        shouldRetry: true,
        fixedArgs: { ...originalArgs, startLine, endLine },
        suggestion: `Adjusted line numbers to valid range (1-${lineCount})`
      };
    }
  }
  
  // Missing required parameters
  if (errorMessage.includes('required') || errorMessage.includes('missing')) {
    if (toolName === 'read_file_section' && !originalArgs.startLine) {
      return {
        shouldRetry: true,
        fixedArgs: { ...originalArgs, startLine: 1, endLine: 50 },
        suggestion: 'Added default line range (1-50)'
      };
    }
    
    if (toolName === 'manage_tasks' && !originalArgs.action) {
      return {
        shouldRetry: true,
        fixedArgs: { ...originalArgs, action: 'list' },
        suggestion: 'Defaulted to list action'
      };
    }
  }
  
  // Invalid content format (e.g., empty content for create_file)
  if (errorMessage.includes('content') && (toolName === 'create_file' || toolName === 'update_file')) {
    if (!originalArgs.content || originalArgs.content.trim().length === 0) {
      return {
        shouldRetry: false,
        suggestion: 'File content cannot be empty. Please provide actual code/content.'
      };
    }
  }
  
  return {
    shouldRetry: false,
    suggestion: 'Unable to automatically fix parameters. Check tool requirements.'
  };
};

// --- LOCAL MODEL SUPPORT ---
interface LocalProviderConfig {
  name: string;
  baseUrl: string;
  models: string[];
  requiresAuth: boolean;
  customHeaders?: Record<string, string>;
}

const LOCAL_PROVIDERS: Record<string, LocalProviderConfig> = {
  ollama: {
    name: 'Ollama',
    baseUrl: 'http://localhost:11434',
    models: ['codellama:7b', 'llama2:7b', 'mistral:7b', 'phi3:latest'],
    requiresAuth: false
  },
  lmstudio: {
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234',
    models: ['local-model'],
    requiresAuth: false
  },
  textwebui: {
    name: 'Text Generation WebUI',
    baseUrl: 'http://localhost:5000',
    models: ['local-model'],
    requiresAuth: false
  },
  huggingface: {
    name: 'Hugging Face Inference',
    baseUrl: 'https://api-inference.huggingface.co',
    models: ['mistralai/Mistral-7B-Instruct-v0.2', 'codellama/CodeLlama-7b-Instruct-hf'],
    requiresAuth: true
  },
  custom: {
    name: 'Custom Endpoint',
    baseUrl: '',
    models: ['custom-model'],
    requiresAuth: false
  }
};

const getLocalProviderConfig = (provider: string, customUrl?: string): LocalProviderConfig => {
  const config = LOCAL_PROVIDERS[provider] || LOCAL_PROVIDERS.custom;
  if (provider === 'custom' && customUrl) {
    return { ...config, baseUrl: customUrl };
  }
  return config;
};

// --- SEARCH LOGIC ---
const performSearch = (query: string, files: ProjectFile[]): SearchResult[] => {
  const results: SearchResult[] = [];
  const safeFiles = files || [];
  const lowerQuery = query.toLowerCase();
  
  safeFiles.forEach(f => {
    if (!f || !f.content) return;
    const lines = f.content.split('\n');
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(lowerQuery)) {
        results.push({
          fileId: f.id || generateUUID(),
          fileName: f.name || 'unknown',
          line: index + 1,
          content: line.trim()
        });
      }
    });
  });
  
  return results.slice(0, 20);
};

// --- STREAMING INTERFACE ---
interface StreamingCallbacks {
  onContent: (content: string) => void;
  onToolCalls?: (toolCalls: ToolCall[]) => void;
  onProposedChanges?: (changes: FileDiff[]) => void;
  onStatusUpdate?: (status: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: string) => void;
}

// --- ENHANCED PROMPT ENGINEERING WITH KNOWLEDGE INTEGRATION ---
const buildSystemPrompt = (
  mode: string,
  fileContext: string,
  knowledgeContext: string,
  currentMessage: string,
  coderRole: any,
  hasTools: boolean,
  knowledgeManager: KnowledgeManager,
  isFollowUpTurn: boolean = false
): string => {
  const turnInstructions = isFollowUpTurn ? 
    `URGENT: You are in the middle of a task. Do not explain your reasoning. CALL THE NEXT TOOL IMMEDIATELY.` : 
    `BE CONCISE. Act immediately.`;

  // MODE-SPECIFIC INSTRUCTIONS
  let modeInstructions = '';
  let canModifyCode = true;
  
  switch (mode) {
    case 'FIX':
      modeInstructions = `MODE: FIX - Automated Bug Fixing
- Analyze error logs/stack traces carefully
- Identify root cause immediately  
- Apply fixes using update_file tool
- Test logic mentally before applying
- Explain what was wrong and how you fixed it
- ALWAYS use tools to make changes, never just suggest`;
      break;
    
    case 'EXPLAIN':
      modeInstructions = `MODE: EXPLAIN - Read-Only Analysis
- You CANNOT modify any files
- Provide detailed explanations of code functionality
- Break down complex logic step-by-step
- Use read_file to inspect specific sections
- Use search_files to find related code
- Suggest improvements but DO NOT implement them`;
      canModifyCode = false;
      break;
    
    case 'CHAT':
    case 'NORMAL':
      modeInstructions = `MODE: INTERACTIVE - Full Development Assistant
- Answer questions AND implement features
- Use tools proactively to understand project
- Create new files, update existing ones
- Manage tasks using manage_tasks tool
- Save important knowledge as you learn
- Be conversational but action-oriented`;
      break;
    
    default:
      modeInstructions = `MODE: ${mode}`;
  }

  const toolInstructions = hasTools ? `
CRITICAL TOOL USAGE RULES:
1. CREATE FILES: create_file(name, content, language) - Provide COMPLETE content
   ⚠️  PROACTIVELY CREATE NEW FILES when needed:
   - Component files (e.g., Button.tsx, Header.tsx)
   - Utility/helper files (e.g., utils.ts, helpers.ts, constants.ts)
   - Configuration files (e.g., config.ts, .env.example)
   - Type definition files (e.g., types.ts, interfaces.ts)
   - Test files (e.g., component.test.ts)
   - Style files (e.g., styles.css, theme.ts)
   - Documentation files (e.g., README.md, API.md)
   💡 Don't ask - just create! If the project needs a new file, create it immediately.

2. UPDATE FILES: update_file(name, content) - ⚠️ CRITICAL: MUST provide COMPLETE FULL file content${!canModifyCode ? ' (DISABLED in EXPLAIN mode)' : ''}
   ❌ NEVER use placeholders like "// ... existing code ...", "// ... rest of code ...", "/* previous code */"
   ❌ NEVER provide partial content - you MUST include EVERY SINGLE LINE of the file
   ✅ Read the file first if needed, then provide COMPLETE updated version
   ✅ Include ALL imports, ALL functions, ALL code - leave NOTHING out
   
3. DELETE FILES: delete_file(name)${!canModifyCode ? ' (DISABLED in EXPLAIN mode)' : ''}
4. READ FILE: read_file(fileName) - Inspect specific file contents
5. READ SECTION: read_file_section(fileName, startLine, endLine) - Read specific line range
6. LIST FILES: list_files(path?) - See project structure
7. SEARCH CODE: search_files(query) - Find code patterns across project
8. SAVE KNOWLEDGE: save_knowledge(tags, content) - Use tags like #react, #auth, #user-pref
9. MANAGE TASKS: manage_tasks(action, task?, status?) - Actions: add, update, complete, delete

FILE ORGANIZATION BEST PRACTICES:
- Separate concerns: one component/utility per file
- Use descriptive file names (e.g., UserAuthService.ts not auth.ts)
- Group related files in logical structures
- Create index files for easier imports
- Add types/interfaces files when needed
- Don't stuff everything in one file!

EXECUTION PROTOCOL:
- DO NOT ASK permission - JUST USE TOOLS
- DO NOT EXPLAIN what you will do - DO IT
- If tool fails, fix parameters and retry
- Chain multiple tools for complex tasks
- CREATE NEW FILES whenever project structure demands it
` : '';

  return `
${coderRole?.systemPrompt || 'You are an expert AI coding assistant that learns and remembers across sessions.'}

${modeInstructions}
VERBOSITY: LOW. ${turnInstructions}

PROJECT CONTEXT:
${fileContext}

${knowledgeContext ? `REMEMBERED KNOWLEDGE:\n${knowledgeContext}\n` : ''}
USER REQUEST: ${currentMessage}

${toolInstructions}

RESPONSE GUIDELINES:
- Think step-by-step but don't narrate your thinking
- Use tools proactively and immediately
- Save learnings for future sessions
- Be helpful, accurate, and efficient
- Provide complete, working code
`;
};

// --- SHARED TOOL EXECUTION LOGIC ---
const executeToolAction = (
  toolName: string,
  args: any,
  files: ProjectFile[],
  logger: ToolUsageLogger,
  knowledgeManager: KnowledgeManager,
  onStatusUpdate?: (status: string) => void
): { output: string; change?: FileDiff } => {
  let toolOutput = "";
  let change: FileDiff | undefined;

  // Visual feedback for the tool action
  if (onStatusUpdate) onStatusUpdate(`⚡ Executing ${toolName}...`);

  try {
    if (toolName === 'update_file') {
      if (isFileProtected(args.name)) {
        toolOutput = `Error: Cannot modify protected file "${args.name}" for security reasons.`;
        logger.logToolCall('update_file', false, `Blocked write to ${args.name}`);
        if (onStatusUpdate) onStatusUpdate(`🚫 Blocked write to ${args.name}`);
      } else {
        const existing = files.find(f => f.name === args.name);
        if (existing) {
          change = {
            id: generateUUID(),
            fileName: args.name,
            originalContent: existing.content,
            newContent: args.content,
            type: 'update'
          };
          toolOutput = `Success: Prepared update for ${args.name}.`;
          logger.logToolCall('update_file', true, `Updated ${args.name}`);
          if (onStatusUpdate) onStatusUpdate(`📝 Updated ${args.name}`);
        } else {
          // If update fails, helpfully list files
          const fileList = files.map(f => f.name).slice(0, 50).join(', ');
          toolOutput = `Error: File "${args.name}" not found. Available files: ${fileList}`;
          logger.logToolCall('update_file', false, `File not found: ${args.name}`);
        }
      }
    } else if (toolName === 'create_file') {
      if (isFileProtected(args.name)) {
        toolOutput = `Error: Cannot create protected file "${args.name}".`;
      } else {
        change = {
          id: generateUUID(),
          fileName: args.name,
          originalContent: '',
          newContent: args.content,
          type: 'create'
        };
        toolOutput = `Success: Prepared creation of ${args.name}.`;
        logger.logToolCall('create_file', true, `Created ${args.name}`);
        if (onStatusUpdate) onStatusUpdate(`✨ Created ${args.name}`);
      }
    } else if (toolName === 'apply_multi_patch') {
      if (onStatusUpdate) onStatusUpdate(`🔀 Applying multi-file patch...`);
      const patches = args.patches || [];
      const results: string[] = [];
      const changes: FileDiff[] = [];
      let successCount = 0;
      let errorCount = 0;
      
      // Validate all patches first (atomic operation)
      for (const patch of patches) {
        if (isFileProtected(patch.file)) {
          toolOutput = `Error: Cannot modify protected file "${patch.file}". Multi-patch aborted.`;
          logger.logToolCall('apply_multi_patch', false, `Blocked by protected file: ${patch.file}`);
          if (onStatusUpdate) onStatusUpdate(`🚫 Multi-patch blocked`);
          return { output: toolOutput };
        }
        
        const existing = files.find(f => f.name === patch.file);
        if (!existing) {
          toolOutput = `Error: File "${patch.file}" not found. Multi-patch aborted.\n\nAvailable files: ${files.map(f => f.name).slice(0, 20).join(', ')}`;
          logger.logToolCall('apply_multi_patch', false, `File not found: ${patch.file}`);
          if (onStatusUpdate) onStatusUpdate(`🚫 Multi-patch blocked`);
          return { output: toolOutput };
        }
      }
      
      // All validations passed, apply all patches
      for (const patch of patches) {
        const existing = files.find(f => f.name === patch.file);
        if (existing) {
          changes.push({
            id: generateUUID(),
            fileName: patch.file,
            originalContent: existing.content,
            newContent: patch.content,
            type: 'update'
          });
          results.push(`✅ ${patch.file}`);
          successCount++;
        }
      }
      
      toolOutput = `Success: Applied multi-patch to ${successCount} file(s)${args.description ? `\nDescription: ${args.description}` : ''}\n\nUpdated files:\n${results.join('\n')}`;
      logger.logToolCall('apply_multi_patch', true, `Updated ${successCount} files`);
      if (onStatusUpdate) onStatusUpdate(`✅ Multi-patch applied (${successCount} files)`);
      
      // Return special marker for multi-patch
      return { output: toolOutput, change: undefined, multiChanges: changes };
    } else if (toolName === 'delete_file') {
      if (isFileProtected(args.name)) {
        toolOutput = `Error: Cannot delete protected file "${args.name}".`;
      } else {
        const existing = files.find(f => f.name === args.name);
        if (existing) {
          change = {
            id: generateUUID(),
            fileName: args.name,
            originalContent: existing.content,
            newContent: '',
            type: 'delete'
          };
          toolOutput = `Success: Prepared deletion of ${args.name}.`;
          logger.logToolCall('delete_file', true, `Deleted ${args.name}`);
          if (onStatusUpdate) onStatusUpdate(`🗑️ Deleted ${args.name}`);
        } else {
          toolOutput = `Error: File "${args.name}" not found.`;
        }
      }
    } else if (toolName === 'list_files') {
      if (onStatusUpdate) onStatusUpdate(`📂 Listing files...`);
      // Simple filtering if path is provided, otherwise all files
      const relevantFiles = args.path ? files.filter(f => f.name.startsWith(args.path)) : files;
      const fileList = relevantFiles.map(f => {
        const lineCount = f.content ? f.content.split('\n').length : 0;
        return `- ${f.name} (${lineCount} lines)`;
      }).join('\n');
      toolOutput = `Project Files:\n${fileList || 'No files found.'}`;
      logger.logToolCall('list_files', true, `Listed ${relevantFiles.length} files`);
    } else if (toolName === 'search_files') {
      if (onStatusUpdate) onStatusUpdate(`🔍 Searching for "${args.query}"...`);
      const results = performSearch(args.query, files);
      toolOutput = `Search Results for "${args.query}":\n${results.map(r => `- ${r.fileName}:${r.line} ${r.content}`).join('\n')}`;
      if (results.length === 0) toolOutput = "No matches found.";
      logger.logToolCall('search_files', true, `Found ${results.length} results`);
    } else if (toolName === 'read_file') {
      if (onStatusUpdate) onStatusUpdate(`📖 Reading ${args.fileName}...`);
      const f = files.find(file => file.name === args.fileName);
      if (f) {
        const lineCount = f.content.split('\n').length;
        toolOutput = `Content of ${f.name} (${lineCount} lines):\n\`\`\`${f.language}\n${f.content}\n\`\`\``;
        logger.logToolCall('read_file', true, `Read ${f.name}`);
      } else {
        // ENHANCEMENT: Return file list if file is not found
        const fileList = files.map(f => f.name).join('\n');
        toolOutput = `Error: File "${args.fileName}" not found.\n\nHere is a list of ALL valid files in the project. Please pick one from this list:\n${fileList}`;
        logger.logToolCall('read_file', false, `File not found: ${args.fileName} (Sent file list)`);
      }
    } else if (toolName === 'read_multiple_files') {
      if (onStatusUpdate) onStatusUpdate(`📖 Reading ${args.files.length} files for comparison...`);
      
      const fileReads = args.files || [];
      const maxFiles = 3;
      
      if (fileReads.length > maxFiles) {
        toolOutput = `Error: Can only read up to ${maxFiles} files at once. You requested ${fileReads.length}.`;
        logger.logToolCall('read_multiple_files', false, `Too many files requested: ${fileReads.length}`);
      } else {
        const results: string[] = [];
        const startLines = args.startLines || [];
        const endLines = args.endLines || [];
        
        fileReads.forEach((fileName: string, index: number) => {
          const f = files.find(file => file.name === fileName);
          if (f) {
            const lines = f.content.split('\n');
            const start = startLines[index] ? Math.max(0, startLines[index] - 1) : 0;
            const end = endLines[index] ? Math.min(lines.length, endLines[index]) : lines.length;
            const section = lines.slice(start, end);
            
            // Format with line numbers for easy reference
            const numberedLines = section.map((line, i) => {
              const lineNum = (start + i + 1).toString().padStart(4, ' ');
              return `${lineNum} | ${line}`;
            }).join('\n');
            
            const rangeInfo = startLines[index] || endLines[index] 
              ? ` (lines ${start + 1}-${end})`
              : ` (${lines.length} lines)`;
            
            results.push(`\n════════════════════════════════════════\n📄 ${f.name}${rangeInfo}\n════════════════════════════════════════\n\`\`\`${f.language}\n${numberedLines}\n\`\`\``);
          } else {
            results.push(`\n❌ File not found: ${fileName}`);
          }
        });
        
        const reasonText = args.reason ? `\n\n💡 Comparison Purpose: ${args.reason}\n` : '';
        toolOutput = `${reasonText}\n🔍 Side-by-Side File Comparison (${fileReads.length} files):\n${results.join('\n\n')}`;
        logger.logToolCall('read_multiple_files', true, `Compared ${fileReads.length} files`);
      }
    } else if (toolName === 'read_file_section') {
      if (onStatusUpdate) onStatusUpdate(`📖 Reading ${args.fileName} lines ${args.startLine}-${args.endLine}...`);
      const f = files.find(file => file.name === args.fileName);
      if (f) {
        const lines = f.content.split('\n');
        const start = Math.max(0, args.startLine - 1);
        const end = Math.min(lines.length, args.endLine);
        const section = lines.slice(start, end).join('\n');
        const totalLines = lines.length;
        toolOutput = `Section of ${f.name} (lines ${args.startLine}-${args.endLine} of ${totalLines}):\n\`\`\`${f.language}\n${section}\n\`\`\``;
        logger.logToolCall('read_file_section', true, `Read ${f.name} lines ${args.startLine}-${args.endLine}`);
      } else {
        const fileList = files.map(f => f.name).join('\n');
        toolOutput = `Error: File "${args.fileName}" not found.\n\nAvailable files:\n${fileList}`;
        logger.logToolCall('read_file_section', false, `File not found: ${args.fileName}`);
      }
    } else if (toolName === 'save_knowledge') {
      if (onStatusUpdate) onStatusUpdate(`💾 Saving knowledge...`);
      knowledgeManager.saveKnowledge(
        args.tags,
        args.content,
        args.tags.includes('#global') ? 'global' : 'project'
      );
      toolOutput = `Saved knowledge: ${args.content}`;
      logger.logToolCall('save_knowledge', true, `Saved knowledge`);
    } else if (toolName === 'manage_tasks') {
      if (onStatusUpdate) onStatusUpdate(`📋 Managing tasks...`);
      const { action, task, taskId, status, phase } = args;
      
      // Note: This tool returns instructions for the UI to handle
      // The actual task management happens in the UI (App.tsx processToolCalls)
      if (action === 'add' && task) {
        toolOutput = `Task added to project: "${task}" ${phase ? `in phase "${phase}"` : ''}`;
        logger.logToolCall('manage_tasks', true, `Added task: ${task}`);
      } else if (action === 'update' && taskId) {
        toolOutput = `Task ${taskId} updated${status ? ` to status: ${status}` : ''}`;
        logger.logToolCall('manage_tasks', true, `Updated task ${taskId}`);
      } else if (action === 'complete' && taskId) {
        toolOutput = `Task ${taskId} marked as completed`;
        logger.logToolCall('manage_tasks', true, `Completed task ${taskId}`);
      } else if (action === 'delete' && taskId) {
        toolOutput = `Task ${taskId} deleted from project`;
        logger.logToolCall('manage_tasks', true, `Deleted task ${taskId}`);
      } else if (action === 'list') {
        toolOutput = `Task list will be shown to user in UI`;
        logger.logToolCall('manage_tasks', true, `Listed tasks`);
      } else {
        toolOutput = `Error: Invalid manage_tasks parameters. action=${action}, task=${task}, taskId=${taskId}`;
      }
    
    // ===== PLANNER-ONLY TOOL HANDLERS =====
    
    } else if (toolName === 'create_todo') {
      if (onStatusUpdate) onStatusUpdate(`📝 Creating todo: ${args.title}...`);
      const { title, description, priority, estimatedTime, phase, requirements } = args;
      
      const todoId = `todo_${Date.now()}`;
      const reqText = requirements && requirements.length > 0 
        ? `\n\nRequirements:\n${requirements.map((r: string) => `  • ${r}`).join('\n')}`
        : '';
      
      toolOutput = `✅ Created todo item:\n\n**${title}** [${priority.toUpperCase()}]\n${description}${reqText}\n\nEstimated time: ${estimatedTime || 'Not specified'}\nPhase: ${phase || 'General'}\nTodo ID: ${todoId}\n\nThis todo has been added to the project task list.`;
      logger.logToolCall('create_todo', true, `Created todo: ${title}`);
      
      // Return metadata for UI processing
      return {
        output: toolOutput,
        change: undefined,
        metadata: {
          type: 'todo_created',
          todoId,
          title,
          description,
          priority,
          estimatedTime,
          phase,
          requirements,
          status: 'pending'
        }
      };
      
    } else if (toolName === 'update_todo_status') {
      if (onStatusUpdate) onStatusUpdate(`✏️ Updating todo status...`);
      const { todoId, status, notes, completionPercentage } = args;
      
      const statusEmoji = status === 'completed' ? '✅' : status === 'in_progress' ? '🔄' : '⏳';
      toolOutput = `${statusEmoji} Updated todo ${todoId}:\nNew status: ${status.replace('_', ' ').toUpperCase()}${notes ? `\nNotes: ${notes}` : ''}${completionPercentage !== undefined ? `\nCompletion: ${completionPercentage}%` : ''}`;
      logger.logToolCall('update_todo_status', true, `Updated todo ${todoId} to ${status}`);
      
      return {
        output: toolOutput,
        change: undefined,
        metadata: {
          type: 'todo_updated',
          todoId,
          status,
          notes,
          completionPercentage
        }
      };
      
    } else if (toolName === 'create_document') {
      if (onStatusUpdate) onStatusUpdate(`📄 Creating document: ${args.path}...`);
      const { path, content, type, title } = args;
      
      // Create document file
      change = {
        id: Date.now().toString(),
        fileName: path,
        originalContent: '',
        newContent: content,
        type: 'create' as const
      };
      
      toolOutput = `📄 Created documentation file: ${path}\nType: ${type || 'document'}\n${title ? `Title: ${title}\n` : ''}\nThe document has been created and will be saved to the project.`;
      logger.logToolCall('create_document', true, `Created document: ${path}`);
      
    } else if (toolName === 'verify_implementation') {
      if (onStatusUpdate) onStatusUpdate(`🔍 Verifying implementation in ${args.filePath}...`);
      const { filePath, requirements, verificationLevel = 'thorough', expectedPatterns } = args;
      
      const file = files.find(f => f.name === filePath);
      if (!file) {
        toolOutput = `❌ Verification failed: File "${filePath}" not found.\n\nAvailable files:\n${files.map(f => f.name).join('\n')}`;
        logger.logToolCall('verify_implementation', false, `File not found: ${filePath}`);
      } else {
        const results: string[] = [];
        let passedCount = 0;
        let failedCount = 0;
        
        // Regex verification (always performed)
        if (expectedPatterns && expectedPatterns.length > 0) {
          results.push('\n📋 Pattern Verification (Regex):');
          expectedPatterns.forEach((pattern: string) => {
            const regex = new RegExp(pattern, 'i');
            const found = regex.test(file.content);
            if (found) {
              results.push(`  ✅ Found pattern: ${pattern}`);
              passedCount++;
            } else {
              results.push(`  ❌ Missing pattern: ${pattern}`);
              failedCount++;
            }
          });
        }
        
        // Requirements verification (semantic - simulated here, real AI would analyze)
        results.push('\n📝 Requirements Verification:');
        requirements.forEach((req: string) => {
          // Simple heuristic: check if requirement keywords are in code
          const keywords = req.toLowerCase().split(' ').filter(w => w.length > 3);
          const codeContent = file.content.toLowerCase();
          const foundKeywords = keywords.filter(kw => codeContent.includes(kw));
          const matchPercentage = keywords.length > 0 ? (foundKeywords.length / keywords.length) * 100 : 0;
          
          if (matchPercentage >= 70) {
            results.push(`  ✅ ${req} (${Math.round(matchPercentage)}% match)`);
            passedCount++;
          } else {
            results.push(`  ⚠️  ${req} (${Math.round(matchPercentage)}% match - needs review)`);
            failedCount++;
          }
        });
        
        const completeness = passedCount > 0 ? Math.round((passedCount / (passedCount + failedCount)) * 100) : 0;
        const status = completeness >= 80 ? '✅ PASSED' : completeness >= 50 ? '⚠️  PARTIAL' : '❌ FAILED';
        
        toolOutput = `🔍 Verification Results for ${filePath}\n\nVerification Level: ${verificationLevel}\nCompleteness: ${completeness}%\nStatus: ${status}\n${results.join('\n')}\n\n📊 Summary: ${passedCount} passed, ${failedCount} need attention`;
        logger.logToolCall('verify_implementation', true, `Verified ${filePath}: ${completeness}% complete`);
        
        return {
          output: toolOutput,
          change: undefined,
          metadata: {
            type: 'verification_result',
            filePath,
            passed: completeness >= 80,
            completeness,
            passedCount,
            failedCount,
            verificationLevel
          }
        };
      }
      
    } else if (toolName === 'delegate_task') {
      if (onStatusUpdate) onStatusUpdate(`🚀 Delegating task: ${args.title}...`);
      const { title, description, requirements, priority, estimatedTime, targetProject, filesToModify, dependencies } = args;
      
      const taskId = `task_${Date.now()}`;
      const reqList = requirements.map((r: string) => `  • ${r}`).join('\n');
      const filesList = filesToModify && filesToModify.length > 0 
        ? `\n\nFiles to modify:\n${filesToModify.map((f: string) => `  • ${f}`).join('\n')}`
        : '';
      const depsList = dependencies && dependencies.length > 0
        ? `\n\nDependencies:\n${dependencies.map((d: string) => `  • ${d}`).join('\n')}`
        : '';
      
      toolOutput = `🚀 Task Delegation Request Created\n\n**${title}** [${priority.toUpperCase()}]\n\n${description}\n\nRequirements:\n${reqList}${filesList}${depsList}\n\nEstimated time: ${estimatedTime || 'Not specified'}\nTarget: ${targetProject || 'Current project'}\nTask ID: ${taskId}\n\n⏸️  This task will be presented to the user for approval before execution.`;
      logger.logToolCall('delegate_task', true, `Delegated task: ${title}`);
      
      return {
        output: toolOutput,
        change: undefined,
        metadata: {
          type: 'task_delegated',
          taskId,
          title,
          description,
          requirements,
          priority,
          estimatedTime,
          targetProject,
          filesToModify,
          dependencies,
          status: 'pending_approval'
        }
      };
      
    } else if (toolName === 'replace_section') {
      if (onStatusUpdate) onStatusUpdate(`✏️ Replacing lines ${args.startLine}-${args.endLine} in ${args.fileName}...`);
      const f = files.find(file => file.name === args.fileName);
      if (f) {
        const lines = f.content.split('\n');
        const start = Math.max(0, args.startLine - 1);
        const end = Math.min(lines.length, args.endLine);
        
        // Replace the section
        const before = lines.slice(0, start);
        const after = lines.slice(end);
        const newLines = args.newContent.split('\n');
        const updatedContent = [...before, ...newLines, ...after].join('\n');
        
        change = { 
          id: Date.now().toString(),
          fileName: f.name, 
          originalContent: f.content, 
          newContent: updatedContent, 
          type: 'update' as const
        };
        toolOutput = `✅ Replaced lines ${args.startLine}-${args.endLine} in ${f.name}`;
        logger.logToolCall('replace_section', true, `Modified ${f.name} lines ${args.startLine}-${args.endLine}`);
      } else {
        toolOutput = `Error: File "${args.fileName}" not found.`;
        logger.logToolCall('replace_section', false, `File not found: ${args.fileName}`);
      }
    } else if (toolName === 'codebase_search') {
      if (onStatusUpdate) onStatusUpdate(`🔎 Searching codebase for "${args.pattern}"...`);
      const { pattern, isRegex = false, filePattern, caseSensitive = false, contextLines = 2 } = args;
      
      let results: Array<{fileName: string, line: number, content: string, context: string[]}> = [];
      let filteredFiles = files;
      
      // Apply file pattern filter
      if (filePattern) {
        const regex = filePattern.replace(/\*/g, '.*').replace(/\?/g, '.');
        const fileRegex = new RegExp(regex);
        filteredFiles = files.filter(f => fileRegex.test(f.name));
      }
      
      // Search through files
      for (const file of filteredFiles) {
        const fileLines = file.content.split('\n');
        const searchRegex = isRegex 
          ? new RegExp(pattern, caseSensitive ? 'g' : 'gi')
          : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
        
        fileLines.forEach((line, idx) => {
          if (searchRegex.test(line)) {
            const start = Math.max(0, idx - contextLines);
            const end = Math.min(fileLines.length, idx + contextLines + 1);
            const contextBefore = fileLines.slice(start, idx);
            const contextAfter = fileLines.slice(idx + 1, end);
            
            results.push({
              fileName: file.name,
              line: idx + 1,
              content: line,
              context: [...contextBefore, `>>> ${line}`, ...contextAfter]
            });
          }
        });
      }
      
      if (results.length > 0) {
        const summary = `Found ${results.length} match(es) across ${new Set(results.map(r => r.fileName)).size} file(s):\n\n`;
        const details = results.slice(0, 50).map(r => 
          `📄 ${r.fileName}:${r.line}\n${r.context.join('\n')}\n`
        ).join('\n---\n');
        toolOutput = summary + details + (results.length > 50 ? `\n... and ${results.length - 50} more matches` : '');
      } else {
        toolOutput = `No matches found for "${pattern}"`;
      }
      logger.logToolCall('codebase_search', true, `Found ${results.length} matches`);
    } else if (toolName === 'run_command') {
      if (onStatusUpdate) onStatusUpdate(`⚙️ Running command: ${args.command}...`);
      
      // Safety check - block dangerous commands
      const dangerous = ['rm -rf', 'format', 'mkfs', 'dd if=', ':(){:|:&};:'];
      const isDangerous = dangerous.some(cmd => args.command.includes(cmd));
      
      if (isDangerous) {
        toolOutput = `❌ Error: Command blocked for safety reasons. Refusing to execute potentially destructive command.`;
        logger.logToolCall('run_command', false, 'Blocked dangerous command');
      } else {
        // In a real implementation, this would execute the command
        // For safety, we'll return a placeholder
        toolOutput = `⚠️ Command execution not implemented in browser. Command: "${args.command}"\n\nSuggestion: User should run this in their terminal.`;
        logger.logToolCall('run_command', false, 'Not implemented in browser');
      }
    } else if (toolName === 'git_operations') {
      if (onStatusUpdate) onStatusUpdate(`🔀 Git ${args.operation}...`);
      
      // Placeholder - real implementation would use actual git
      if (args.operation === 'status') {
        toolOutput = `Git Status:\n(Not implemented - this would show modified files, staged changes, etc.)`;
      } else if (args.operation === 'diff') {
        toolOutput = `Git Diff:\n(Not implemented - this would show file changes)`;
      } else if (args.operation === 'log') {
        toolOutput = `Git Log:\n(Not implemented - this would show commit history)`;
      } else if (args.operation === 'commit') {
        toolOutput = `Git Commit:\n(Not implemented - would commit staged files with message: "${args.message}")`;
      }
      logger.logToolCall('git_operations', false, 'Not implemented in browser');
    } else if (toolName === 'refactor_code') {
      if (onStatusUpdate) onStatusUpdate(`🔧 Refactoring ${args.refactorType} in ${args.fileName}...`);
      
      const f = files.find(file => file.name === args.fileName);
      if (!f) {
        toolOutput = `Error: File "${args.fileName}" not found.`;
        logger.logToolCall('refactor_code', false, `File not found`);
      } else {
        // Placeholder for refactoring logic
        if (args.refactorType === 'rename') {
          const regex = new RegExp(`\\b${args.target}\\b`, 'g');
          const newContent = f.content.replace(regex, args.newName || args.target);
          const occurrences = (f.content.match(regex) || []).length;
          
          change = { 
            id: Date.now().toString(),
            fileName: f.name, 
            originalContent: f.content, 
            newContent: newContent, 
            type: 'update' as const
          };
          toolOutput = `✅ Renamed "${args.target}" to "${args.newName}" (${occurrences} occurrences)`;
          logger.logToolCall('refactor_code', true, `Renamed in ${f.name}`);
        } else if (args.refactorType === 'extract_function') {
          toolOutput = `Extract function refactoring: Lines ${args.startLine}-${args.endLine}\n(Advanced refactoring not yet implemented)`;
          logger.logToolCall('refactor_code', false, 'Extract function not implemented');
        } else {
          toolOutput = `Refactor type "${args.refactorType}" not fully implemented.`;
          logger.logToolCall('refactor_code', false, 'Not implemented');
        }
      }
    } else if (toolName === 'generate_tests') {
      if (onStatusUpdate) onStatusUpdate(`🧪 Generating tests for ${args.fileName}...`);
      const f = files.find(file => file.name === args.fileName);
      if (!f) {
        toolOutput = `Error: File "${args.fileName}" not found.`;
        logger.logToolCall('generate_tests', false, 'File not found');
      } else {
        const testType = args.testType || 'unit';
        const framework = args.framework || 'vitest';
        const coverage = args.coverage || 'comprehensive';
        
        // Generate test file name
        const testFileName = f.name.replace(/\.(tsx?|jsx?)$/, '.test.$1');
        const testTemplate = `import { describe, it, expect${framework === 'vitest' ? ', vi' : ''} } from '${framework}';\nimport { /* imports from ${f.name} */ } from './${f.name.split('/').pop()}';\n\ndescribe('${f.name}', () => {\n  it('should ${coverage === 'basic' ? 'work correctly' : 'handle normal cases'}', () => {\n    // TODO: Add test implementation\n    expect(true).toBe(true);\n  });\n\n  ${coverage !== 'basic' ? `it('should handle edge cases', () => {\n    // TODO: Add edge case tests\n  });\n\n  it('should handle error cases', () => {\n    // TODO: Add error handling tests\n  });` : ''}\n});\n`;
        
        toolOutput = `✅ Generated ${testType} tests for ${f.name}\n\nTest file: ${testFileName}\n\`\`\`typescript\n${testTemplate}\`\`\`\n\n💡 Review and customize the tests based on your specific requirements.`;
        logger.logToolCall('generate_tests', true, `Generated tests for ${f.name}`);
      }
    } else if (toolName === 'security_scan') {
      if (onStatusUpdate) onStatusUpdate(`🔒 Running security scan...`);
      const scope = args.scope || 'project';
      const findings: string[] = [];
      
      const filesToScan = scope === 'file' && args.fileName 
        ? files.filter(f => f.name === args.fileName)
        : files;
      
      // Simple security checks
      for (const file of filesToScan) {
        const content = file.content.toLowerCase();
        
        // Check for hardcoded secrets
        if (content.match(/api[_-]?key|password|secret|token.*=.*['"][\w-]{20,}['"]/i)) {
          findings.push(`⚠️ ${file.name}: Possible hardcoded secret detected`);
        }
        
        // Check for SQL injection vulnerabilities
        if (content.includes('query(') && content.includes('+') && content.includes('req.')) {
          findings.push(`🔴 ${file.name}: Potential SQL injection vulnerability (string concatenation in query)`);
        }
        
        // Check for XSS vulnerabilities
        if (content.includes('innerhtml') || content.includes('dangerouslysetinnerhtml')) {
          findings.push(`⚠️ ${file.name}: Potential XSS risk (innerHTML usage)`);
        }
        
        // Check for eval usage
        if (content.includes('eval(')) {
          findings.push(`🔴 ${file.name}: Dangerous eval() usage detected`);
        }
        
        // Check for console.log in production
        if (content.includes('console.log') || content.includes('console.error')) {
          findings.push(`💡 ${file.name}: Console statements found (consider removing for production)`);
        }
      }
      
      toolOutput = findings.length > 0
        ? `Security Scan Results:\n\n${findings.join('\n')}\n\n🔍 Scanned ${filesToScan.length} file(s)`
        : `✅ No security issues detected in ${filesToScan.length} file(s)`;
      
      logger.logToolCall('security_scan', true, `Found ${findings.length} issues`);
    } else if (toolName === 'analyze_dependencies') {
      if (onStatusUpdate) onStatusUpdate(`📦 Analyzing dependencies...`);
      const packageJson = files.find(f => f.name === 'package.json');
      
      if (!packageJson) {
        toolOutput = `Error: package.json not found in project.`;
        logger.logToolCall('analyze_dependencies', false, 'No package.json');
      } else {
        try {
          const pkg = JSON.parse(packageJson.content);
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          const depCount = Object.keys(deps).length;
          
          toolOutput = `📦 Dependency Analysis:\n\n`;
          toolOutput += `Total dependencies: ${depCount}\n`;
          toolOutput += `Dependencies: ${Object.keys(pkg.dependencies || {}).length}\n`;
          toolOutput += `Dev dependencies: ${Object.keys(pkg.devDependencies || {}).length}\n\n`;
          toolOutput += `💡 Key dependencies:\n${Object.entries(deps).slice(0, 10).map(([name, ver]) => `  • ${name}: ${ver}`).join('\n')}`;
          
          if (depCount > 10) toolOutput += `\n  ... and ${depCount - 10} more`;
          
          toolOutput += `\n\n⚠️ Note: For detailed outdated/security analysis, use npm audit or npm outdated`;
          
          logger.logToolCall('analyze_dependencies', true, `Analyzed ${depCount} dependencies`);
        } catch (e) {
          toolOutput = `Error: Invalid package.json format`;
          logger.logToolCall('analyze_dependencies', false, 'Invalid JSON');
        }
      }
    } else if (toolName === 'code_review') {
      if (onStatusUpdate) onStatusUpdate(`👀 Performing code review...`);
      const fileToReview = args.fileName ? files.find(f => f.name === args.fileName) : null;
      const reviewFiles = fileToReview ? [fileToReview] : files.slice(0, 5); // Limit to 5 files for project review
      const issues: string[] = [];
      
      for (const file of reviewFiles) {
        const content = file.content;
        const lines = content.split('\n');
        
        // Check for long functions
        let braceDepth = 0;
        let functionStart = -1;
        lines.forEach((line, idx) => {
          if (line.match(/function|const.*=>|class/)) functionStart = idx;
          braceDepth += (line.match(/{/g) || []).length;
          braceDepth -= (line.match(/}/g) || []).length;
          if (braceDepth === 0 && functionStart >= 0 && idx - functionStart > 50) {
            issues.push(`📏 ${file.name}:${functionStart + 1}: Function too long (${idx - functionStart} lines)`);
            functionStart = -1;
          }
        });
        
        // Check for missing error handling
        if (content.includes('async ') && !content.includes('try') && !content.includes('catch')) {
          issues.push(`⚠️ ${file.name}: Async code without error handling`);
        }
        
        // Check for TODO/FIXME comments
        lines.forEach((line, idx) => {
          if (line.match(/\/\/.*TODO|\/\/.*FIXME/i)) {
            issues.push(`💡 ${file.name}:${idx + 1}: ${line.trim()}`);
          }
        });
        
        // Check for magic numbers
        const magicNumbers = content.match(/[^0-9a-zA-Z_](100|200|404|500|1000|3600)[^0-9a-zA-Z_]/g);
        if (magicNumbers && magicNumbers.length > 3) {
          issues.push(`🔢 ${file.name}: Consider extracting magic numbers to constants`);
        }
      }
      
      toolOutput = issues.length > 0
        ? `Code Review Results:\n\n${issues.slice(0, 20).join('\n')}${issues.length > 20 ? `\n\n... and ${issues.length - 20} more issues` : ''}`
        : `✅ No significant issues found in code review`;
      
      logger.logToolCall('code_review', true, `Found ${issues.length} issues`);
    } else if (toolName === 'performance_profile') {
      if (onStatusUpdate) onStatusUpdate(`⚡ Analyzing performance...`);
      const fileToProfile = args.fileName ? files.find(f => f.name === args.fileName) : null;
      const profileFiles = fileToProfile ? [fileToProfile] : files.filter(f => f.name.match(/\.(tsx?|jsx?)$/)).slice(0, 5);
      const findings: string[] = [];
      
      for (const file of profileFiles) {
        const content = file.content;
        
        // Check for React re-render issues
        if (content.includes('useState') && !content.includes('useMemo') && !content.includes('useCallback')) {
          findings.push(`⚡ ${file.name}: Consider using useMemo/useCallback to prevent unnecessary re-renders`);
        }
        
        // Check for large inline functions
        const inlineFunctions = content.match(/\{[^}]{200,}\}/g);
        if (inlineFunctions && inlineFunctions.length > 0) {
          findings.push(`📦 ${file.name}: Large inline functions detected (${inlineFunctions.length})`);
        }
        
        // Check for synchronous blocking operations
        if (content.includes('JSON.parse') && content.includes('localStorage')) {
          findings.push(`🐌 ${file.name}: Synchronous localStorage + JSON.parse may block UI`);
        }
        
        // Check complexity
        const cyclomaticComplexity = (content.match(/if|else|for|while|case|catch|\?\?|\|\|/g) || []).length;
        if (cyclomaticComplexity > 20) {
          findings.push(`🔴 ${file.name}: High cyclomatic complexity (${cyclomaticComplexity})`);
        }
      }
      
      toolOutput = findings.length > 0
        ? `Performance Analysis:\n\n${findings.join('\n')}\n\n💡 Consider optimizing these areas for better performance`
        : `✅ No significant performance issues detected`;
      
      logger.logToolCall('performance_profile', true, `Analyzed ${profileFiles.length} files`);
    } else {
      toolOutput = `Error: Unknown tool "${toolName}"`;
    }
  } catch (err: any) {
    toolOutput = `Error executing ${toolName}: ${err.message}`;
    logger.logToolCall(toolName, false, err.message);
  }

  return { output: toolOutput, change };
};

// --- ORCHESTRATOR (NON-STREAMING) ---
export const fixCodeWithGemini = async (request: FixRequest): Promise<FixResponse> => {
  const { llmConfig, history, currentMessage, allFiles, activeFile, mode, attachments, roles, knowledgeBase, useInternet, currentTodos, projectSummary, useCompression, contextTransfer } = request;
  const logger = ToolUsageLogger.getInstance();
  const knowledgeManager = KnowledgeManager.getInstance();
  
  if (knowledgeBase) knowledgeManager.loadKnowledge(knowledgeBase);
  
  if (!llmConfig) return { response: "", error: "Missing LLM configuration" };
  if (!currentMessage?.trim()) return { response: "", error: "Empty message" };

  const safeAllFiles = allFiles || [];
  const safeActiveFile = activeFile || safeAllFiles[0];
  const safeHistory = history || [];
  
  if (!safeActiveFile) return { response: "", error: "No active file available" };

  const isGemini = llmConfig.provider === 'gemini';
  const isLocal = llmConfig.provider === 'local';
  
  let apiKey = llmConfig.apiKey || '';
  let baseUrl = llmConfig.baseUrl || '';
  
  if (isLocal) {
    const localConfig = getLocalProviderConfig('custom', baseUrl);
    baseUrl = localConfig.baseUrl || baseUrl;
    if (localConfig.requiresAuth && !apiKey) return { response: "", error: `API Key required for ${localConfig.name}` };
  } else if (llmConfig.provider === 'openrouter') {
    baseUrl = 'https://openrouter.ai/api/v1';
  } else if (llmConfig.provider === 'openai') {
    baseUrl = baseUrl || 'https://api.openai.com/v1';
  }

  // Context and Compression
  const totalChars = safeAllFiles.reduce((acc, f) => acc + (f.content?.length || 0), 0);
  const shouldCompress = useCompression || (totalChars > LAZY_LOAD_THRESHOLD && !request.useHighCapacity);
  
  let fileContext = "";
  let usedCompression = false;
  
  if (shouldCompress && projectSummary) {
    usedCompression = true;
    const compressionConfig = llmConfig.compression || { enabled: true, maxFiles: 15, maxFileSize: 50000, autoSummarize: true, preserveStructure: true };
    const relevantFiles = contextService.filterRelevantFiles(safeAllFiles, currentMessage, safeActiveFile, compressionConfig);
    fileContext = `PROJECT CONTEXT:\n${projectSummary.summary || 'No summary available'}\n\nKEY FILES:\n${relevantFiles.map(f => `- ${f.name}`).join('\n')}\n\nACTIVE FILE (${safeActiveFile.name}):\n\`\`\`${safeActiveFile.language}\n${safeActiveFile.content}\n\`\`\``;
  } else {
    fileContext = `ALL PROJECT FILES:\n${safeAllFiles.map(f => `File: ${f.name} (${f.language})\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n')}`;
  }

  // Knowledge Retrieval
  const messageTokens = currentMessage.toLowerCase().split(/[\s,.]+/);
  const tagsInMessage: string[] = currentMessage.match(/#[\w-]+/g) || [];
  
  // Use enhanced knowledge manager for better retrieval
  const fileNames = safeAllFiles.map(f => f.name);
  const relevantKnowledge = knowledgeManager.getRelevantKnowledge(currentMessage, fileNames);
  
  const knowledgeContext = relevantKnowledge.length > 0 ? 
    `\nRELEVANT KNOWLEDGE/PREFERENCES:\n${relevantKnowledge.map(k => `- ${k.content} [${k.tags.join(', ')}]`).join('\n')}` : "";

  const coderRole = (roles || []).find(r => r.id === llmConfig.coderRoleId) || (roles || [])[1];
  let activeAgentModel = llmConfig.chatModelId || llmConfig.coderModelId || llmConfig.activeModelId;
  if (!activeAgentModel) return { response: "", error: "No active model configured." };

  const systemInstruction = buildSystemPrompt(
    mode,
    fileContext,
    knowledgeContext,
    currentMessage,
    coderRole,
    true,
    knowledgeManager
  );

  let finalResponseText = "";
  const allProposedChanges: FileDiff[] = [];
  const allToolCalls: ToolCall[] = [];
  
  let conversationMessages: any[] = [];
  
  if (isGemini) {
    conversationMessages = [
      { text: systemInstruction },
      ...safeHistory.slice(-4).map(msg => ({ text: `${msg.role === 'user' ? 'USER' : 'ASSISTANT'}: ${msg.content}` })),
      { text: `USER: ${currentMessage}` }
    ];
  } else {
    conversationMessages = [
      { role: 'system', content: systemInstruction },
      ...safeHistory.slice(-4).map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content })),
      { role: 'user', content: currentMessage }
    ];
  }

  let turnCount = 0;
  let keepGoing = true;
  
  try {
    while (keepGoing && turnCount < MAX_AGENT_TURNS) {
      turnCount++;
      
      let currentResponseText = "";
      let currentToolCalls: any[] = [];

      // 1. CALL LLM
      if (isGemini) {
        const res = await callGemini(activeAgentModel, conversationMessages, apiKey, true, useInternet);
        currentResponseText = res.text || "";
        if (res.functionCalls) currentToolCalls = res.functionCalls;
      } else {
        const res = await callOpenAICompatible(
          baseUrl,
          apiKey,
          activeAgentModel,
          conversationMessages,
          true,
          (isLocal ? getLocalProviderConfig('custom', baseUrl).customHeaders : {})
        );
        const message = res.choices?.[0]?.message;
        currentResponseText = message?.content || "";
        if (message?.tool_calls) {
          currentToolCalls = message.tool_calls.map((tc: any) => ({
            name: tc.function.name,
            args: tc.function.arguments
          }));
        }
      }

      finalResponseText += currentResponseText;
      
      if (currentToolCalls.length === 0) {
        keepGoing = false;
        break;
      }

      if (isGemini) {
        conversationMessages.push({ text: `ASSISTANT: ${currentResponseText}` });
      } else {
        conversationMessages.push({ role: 'assistant', content: currentResponseText });
      }

      // 2. EXECUTE TOOLS (Refactored to use shared logic)
      for (const fc of currentToolCalls) {
        const args = typeof fc.args === 'string' ? safeJsonParse(fc.args) : (fc.args || {});
        const toolCall: ToolCall = {
          id: 'call_' + Math.random().toString(36).substr(2, 9),
          name: fc.name,
          args: args
        };
        allToolCalls.push(toolCall);

        let { output, change, multiChanges } = executeToolAction(fc.name, args, safeAllFiles, logger, knowledgeManager) as any;
        
        // ENHANCED: Detect and log tool execution errors (Phase 7)
        let detectedError: any = null;
        if (output.startsWith('Error:')) {
          const error = new Error(output);
          error.name = 'ToolExecutionError';
          detectedError = errorDetectionService.detectFromToolExecution(
            fc.name,
            error,
            undefined,
            1
          );
          console.warn('Tool execution error detected:', detectedError);
        }
        
        // ENHANCED: Intelligent retry logic for common tool errors
        if (output.startsWith('Error:')) {
          const retryResult = attemptToolParameterFix(fc.name, args, output, safeAllFiles);
          if (retryResult.shouldRetry) {
            console.log(`🔧 Retrying ${fc.name} with fixed parameters:`, retryResult.fixedArgs);
            const retryExecution = executeToolAction(fc.name, retryResult.fixedArgs, safeAllFiles, logger, knowledgeManager) as any;
            if (!retryExecution.output.startsWith('Error:')) {
              output = `✅ Auto-fixed parameters:\n${retryExecution.output}`;
              change = retryExecution.change;
              multiChanges = retryExecution.multiChanges;
              
              // Mark error as resolved (Phase 7)
              if (detectedError) {
                errorDetectionService.resolveError(
                  detectedError.id,
                  'auto_retry',
                  'Tool parameters were automatically fixed and retry succeeded'
                );
              }
            } else {
              output = `❌ Retry failed. ${output}\n\nSuggestion: ${retryResult.suggestion}`;
            }
          }
        }
        
        // Handle both single change and multi-changes
        if (change) allProposedChanges.push(change);
        if (multiChanges && Array.isArray(multiChanges)) {
          allProposedChanges.push(...multiChanges);
        }

        // Add Tool Result to History
        if (isGemini) {
          conversationMessages.push({ text: `TOOL_OUTPUT (${fc.name}): ${output}` });
        } else {
          conversationMessages.push({ role: 'user', content: `[System Tool Output for ${fc.name}]: ${output}` });
        }
      }
    }

    return {
      response: finalResponseText.trim(),
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      proposedChanges: allProposedChanges,
      contextSummarized: usedCompression
    };
  } catch (error: any) {
    logger.logToolCall('llm_service', false, error.message);
    return { response: "", error: `Service Error: ${error.message}` };
  }
};

// --- ENHANCED STREAMING ORCHESTRATOR WITH AGENT LOOP ---
export const streamFixCodeWithGemini = async (
  request: FixRequest,
  callbacks: StreamingCallbacks,
  signal?: AbortSignal
): Promise<void> => {
  const { llmConfig, history, currentMessage, allFiles, activeFile, mode, roles, knowledgeBase, useCompression, projectSummary } = request;
  const logger = ToolUsageLogger.getInstance();
  const knowledgeManager = KnowledgeManager.getInstance();
  
  if (knowledgeBase) knowledgeManager.loadKnowledge(knowledgeBase);
  
  if (!llmConfig || !currentMessage) {
    callbacks.onError("Configuration or message missing.");
    return;
  }

  const safeAllFiles = allFiles || [];
  const safeActiveFile = activeFile || safeAllFiles[0];
  
  const isGemini = llmConfig.provider === 'gemini';
  const isLocal = llmConfig.provider === 'local';
  
  let apiKey = llmConfig.apiKey || '';
  let baseUrl = llmConfig.baseUrl || '';
  
  // Note: Gemini streaming with tools may have limitations, but we'll attempt it
  if (isGemini) {
    console.warn('⚠️ Gemini streaming with tools may be limited. Consider non-streaming mode for complex tasks.');
  }
  
  if (isLocal) {
    const localConfig = getLocalProviderConfig('custom', baseUrl);
    baseUrl = localConfig.baseUrl || baseUrl;
  } else if (llmConfig.provider === 'openrouter') {
    baseUrl = 'https://openrouter.ai/api/v1';
  } else if (llmConfig.provider === 'openai') {
    baseUrl = baseUrl || 'https://api.openai.com/v1';
  }

  try {
    // 2. Context Building
    let fileContext = "";
    if (useCompression && projectSummary) {
      fileContext = `PROJECT CONTEXT:\n${projectSummary.summary}\n\nACTIVE FILE (${safeActiveFile.name}):\n\`\`\`${safeActiveFile.language}\n${safeActiveFile.content}\n\`\`\``;
    } else {
      fileContext = `ALL PROJECT FILES:\n${safeAllFiles.map(f => `File: ${f.name} (${f.language})\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n')}`;
    }

    const messageTokens = currentMessage.toLowerCase().split(/[\s,.]+/);
    const tagsInMessage: string[] = currentMessage.match(/#[\w-]+/g) || [];
    
    // Use enhanced knowledge manager for better retrieval
    const fileNames = safeAllFiles.map(f => f.name);
    const relevantKnowledge = knowledgeManager.getRelevantKnowledge(currentMessage, fileNames);
    
    const knowledgeContext = relevantKnowledge.length > 0 ? 
      `\nRELEVANT KNOWLEDGE:\n${relevantKnowledge.map(k => `- ${k.content}`).join('\n')}` : "";

    const coderRole = (roles || []).find(r => r.id === llmConfig.coderRoleId) || (roles || [])[1];
    let activeAgentModel = llmConfig.chatModelId || llmConfig.activeModelId;
    
    let turnCount = 0;
    let keepGoing = true;
    
    // Tracks what we actually sent to the user via callbacks to avoid glitches/duplication
    let accumulatedGlobalStream = "";

    // Conversation history container
    const messages = [
      { role: 'system', content: '' }, // Placeholder for dynamic system prompt
      ...(history || []).slice(-4).map(h => ({ 
        role: h.role === 'model' ? 'assistant' : 'user', 
        content: h.content 
      })),
      { role: 'user', content: currentMessage }
    ];

    // --- AGENT STREAMING LOOP ---
    while (keepGoing && turnCount < MAX_AGENT_TURNS) {
      turnCount++;
      
      // Update dynamic system prompt for this turn
      // If turnCount > 1, we want MAXIMUM SPEED (no explanations)
      messages[0].content = buildSystemPrompt(
        mode,
        fileContext,
        knowledgeContext,
        currentMessage,
        coderRole,
        true,
        knowledgeManager,
        turnCount > 1 // isFollowUpTurn
      );

      // Update status to show activity
      if (callbacks.onStatusUpdate) {
        callbacks.onStatusUpdate(turnCount === 1 ? "🧠 Analyzing..." : "⚡ Processing...");
      }

      let turnTextResponse = "";
      let accumulatedToolCalls: Record<number, { name: string, args: string, id: string }> = {};

      // 1. Call Stream for current turn
      await callOpenAICompatibleStream(
        baseUrl,
        apiKey,
        activeAgentModel,
        messages,
        true, // Tools enabled
        (isLocal ? getLocalProviderConfig('custom', baseUrl).customHeaders : {}),
        (content) => {
          turnTextResponse += content;
          accumulatedGlobalStream += content;
          callbacks.onContent(content); // Stream text to UI immediately
        },
        (toolCallChunks) => {
          // Accumulate tool fragments
          toolCallChunks.forEach((chunk) => {
            const index = chunk.index;
            if (!accumulatedToolCalls[index]) {
              accumulatedToolCalls[index] = { name: '', args: '', id: '' };
            }
            if (chunk.id) accumulatedToolCalls[index].id = chunk.id;
            if (chunk.function?.name) accumulatedToolCalls[index].name += chunk.function.name;
            if (chunk.function?.arguments) accumulatedToolCalls[index].args += chunk.function.arguments;
            
            if (chunk.function?.name && callbacks.onStatusUpdate) {
              // Update status immediately when a tool is detected
              const toolName = chunk.function.name;
              // Debounce/Check if name is somewhat complete to avoid flickering
              if (toolName.length > 3 && !accumulatedToolCalls[index].name.includes(toolName.slice(0, -1))) {
                callbacks.onStatusUpdate(`🛠️ Preparing ${toolName}...`);
              }
            }
          });
        },
        signal
      );

      // 2. Process Tools for this turn
      const toolCallsInThisTurn = Object.values(accumulatedToolCalls);
      
      if (toolCallsInThisTurn.length === 0) {
        keepGoing = false; // No tools called, Agent is done
        if (callbacks.onStatusUpdate) callbacks.onStatusUpdate("✅ Response Complete");
      } else {
        // Add Assistant's thoughts/calls to history so it remembers what it did
        messages.push({ role: 'assistant', content: turnTextResponse });

        // Execute Tools (parallel execution where safe)
        const toolPromises: Promise<void>[] = [];
        const toolResults: Array<{ toolName: string; output: string; change?: any; multiChanges?: any[] }> = [];
        
        for (const tc of toolCallsInThisTurn) {
          const executeToolPromise = (async () => {
            try {
              if (!tc.name) return;
              
              // Validate and sanitize args before parsing
              let argsStr = tc.args || '{}';
              argsStr = argsStr.trim();
              
              // Ensure args is a complete JSON object
              if (!argsStr.startsWith('{')) argsStr = '{' + argsStr;
              if (!argsStr.endsWith('}')) argsStr = argsStr + '}';
              
              const args = safeJsonParse(argsStr);
              
              // Emit parsed tool call for UI tracking
              if (callbacks.onToolCalls) {
                callbacks.onToolCalls([{ id: tc.id || generateUUID(), name: tc.name, args }]);
              }

              // Update status immediately for faster feedback
              if (callbacks.onStatusUpdate) {
                callbacks.onStatusUpdate(`⚡ Executing ${tc.name}...`);
              }

              // Execute logic with Status Update Callback
              const { output, change, multiChanges } = executeToolAction(
                tc.name,
                args,
                safeAllFiles,
                logger,
                knowledgeManager,
                callbacks.onStatusUpdate // Pass the callback down!
              ) as any;

              // Store result for sequential processing
              toolResults.push({ toolName: tc.name, output, change, multiChanges });
              
            } catch (e: any) {
              console.error(`Tool execution failed in stream [${tc.name}]:`, e);
              toolResults.push({ 
                toolName: tc.name || 'unknown', 
                output: `ERROR: ${e.message}` 
              });
            }
          })();
          
          // Determine if tool can run in parallel (read-only operations)
          const readOnlyTools = ['list_files', 'search_files', 'read_file', 'read_multiple_files', 'save_knowledge', 'ask_question'];
          if (readOnlyTools.includes(tc.name)) {
            toolPromises.push(executeToolPromise);
          } else {
            // Execute write operations immediately and wait
            await executeToolPromise;
          }
        }
        
        // Wait for all parallel read operations to complete
        if (toolPromises.length > 0) {
          await Promise.all(toolPromises);
        }
        
        // Process results sequentially for UI feedback and history
        for (const result of toolResults) {
          const { toolName, output, change, multiChanges } = result;
          
          // Emit changes if any
          if (change && callbacks.onProposedChanges) {
            callbacks.onProposedChanges([change]);
            const successMsg = `\n\n✅ [${toolName}] Executed successfully\n`;
            accumulatedGlobalStream += successMsg;
            callbacks.onContent(successMsg);
          } else if (multiChanges && Array.isArray(multiChanges) && callbacks.onProposedChanges) {
            callbacks.onProposedChanges(multiChanges);
            const successMsg = `\n\n✅ [${toolName}] Applied ${multiChanges.length} changes\n`;
            accumulatedGlobalStream += successMsg;
            callbacks.onContent(successMsg);
          } else if (!change && !multiChanges && !['list_files', 'search_files', 'read_file', 'read_multiple_files', 'save_knowledge'].includes(toolName)) {
            const feedbackMsg = `\n\n⚠️ [${toolName}] ${output.slice(0, 100)}...\n`;
            accumulatedGlobalStream += feedbackMsg;
            callbacks.onContent(feedbackMsg);
          }

          // Feed result back to LLM
          messages.push({ role: 'user', content: `[Tool Result for ${toolName}]: ${output}` });
        }
        // Loop continues to next turn to let LLM see the tool output and decide next steps
      }
    }

    // Critical: Send the ACCUMULATED stream text as the final complete text.
    callbacks.onComplete(accumulatedGlobalStream);
    
  } catch (error: any) {
    logger.logToolCall('stream_service', false, error.message);
    if (error.name !== 'AbortError') callbacks.onError(error.message);
  }
};

export { ToolUsageLogger };