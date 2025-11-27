import { Type } from "@google/genai";

// Gemini-compatible tool definitions
export const GEMINI_TOOL_DEFINITIONS = [
  {
    name: 'create_file',
    description: 'Create a new file in the project workspace.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'The name of the file (e.g., utils.js, styles.css)' },
        content: { type: Type.STRING, description: 'The content of the file' },
        language: { type: Type.STRING, description: 'The programming language of the file' }
      },
      required: ['name', 'content']
    }
  },
  {
    name: 'update_file',
    description: 'Update the content of an existing file. Use this to apply fixes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'The name of the file to update' },
        content: { type: Type.STRING, description: 'The new full content of the file' }
      },
      required: ['name', 'content']
    }
  },
  {
    name: 'save_knowledge',
    description: 'Save a learned concept, pattern, or preference.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Tags to retrieve this info later' },
        content: { type: Type.STRING, description: 'The knowledge or pattern to save.' }
      },
      required: ['tags', 'content']
    }
  },
  {
    name: 'manage_tasks',
    description: 'Manage the project To-Do list.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['add', 'update', 'complete', 'delete'], description: 'The action to perform' },
        task: { type: Type.STRING, description: 'The task description' },
        phase: { type: Type.STRING, description: 'The phase' },
        taskId: { type: Type.STRING, description: 'The ID of the task' },
        status: { type: Type.STRING, enum: ['pending', 'in_progress', 'completed'], description: 'Status' }
      },
      required: ['action']
    }
  },
  {
    name: 'search_files',
    description: 'Search for a string or pattern across all files in the project. Returns file names and lines.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'The string or simple regex to search for.' }
      },
      required: ['query']
    }
  },
  {
    name: 'read_file',
    description: 'Read the full content of a specific file. Use this when you only have the file name.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fileName: { type: Type.STRING, description: 'The name of the file to read.' }
      },
      required: ['fileName']
    }
  }
];

// OpenAI-compatible tool definitions
export const OPENAI_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'create_file',
      description: 'Create a new file in the project workspace.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the file (e.g., utils.js, styles.css)' },
          content: { type: 'string', description: 'The content of the file' },
          language: { type: 'string', description: 'The programming language of the file' }
        },
        required: ['name', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_file',
      description: 'Update the content of an existing file. Use this to apply fixes.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the file to update' },
          content: { type: 'string', description: 'The new full content of the file' }
        },
        required: ['name', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_knowledge',
      description: 'Save a learned concept, pattern, or preference.',
      parameters: {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags to retrieve this info later' },
          content: { type: 'string', description: 'The knowledge or pattern to save.' }
        },
        required: ['tags', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'manage_tasks',
      description: 'Manage the project To-Do list.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'update', 'complete', 'delete'], description: 'The action to perform' },
          task: { type: 'string', description: 'The task description' },
          phase: { type: 'string', description: 'The phase' },
          taskId: { type: 'string', description: 'The ID of the task' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Status' }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_files',
      description: 'Search for a string or pattern across all files in the project. Returns file names and lines.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The string or simple regex to search for.' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the full content of a specific file. Use this when you only have the file name.',
      parameters: {
        type: 'object',
        properties: {
          fileName: { type: 'string', description: 'The name of the file to read.' }
        },
        required: ['fileName']
      }
    }
  }
];