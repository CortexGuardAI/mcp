import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import { Config } from './types';
import { Logger } from './utils';

export class MCPServer {
  private server: Server;
  private transport: StdioServerTransport | null = null;
  private httpClient: AxiosInstance;
  private config: Config;
  private logger: Logger;
  private static globalFileCreationLocks: Map<string, Promise<any>> = new Map();

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.httpClient = axios.create({
      baseURL: config.serverUrl,
      headers: {
        'Authorization': `Bearer ${config.authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    this.server = new Server({
      name: 'cortex-context-mcp',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {},
        resources: {}
      }
    });

    // Setup process handlers
    // process.on('SIGINT', () => this.stop());
    // process.on('SIGTERM', () => this.stop());
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {
      // Setup request handlers
      this.setupHandlers();

      // Create transport and connect
      this.transport = new StdioServerTransport();
      await this.server.connect(this.transport);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
      }
    } catch (error) {
      throw error;
    }
  }

  private registerResources(): void {
    if (!this.server) return;
    // Resources are now handled in setupHandlers()
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers() {
    // Handle tools/list requests
     this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [
        {
          name: 'get_contexts',
          description: `Selection hint: Start here. Use to check availability and fetch all context files for the current project. This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.

## When to Use This Tool
Use this tool proactively in these scenarios:
  1. Complex multi-step tasks - When a task requires 3 or more distinct steps or actions
  2. Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
  3. User explicitly requests todo list - When the user directly asks you to use the todo list
  4. User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
  5. After receiving new instructions - Immediately capture user requirements as todos
  6. When you start working on a task - Mark it as in_progress BEFORE beginning work. Ideally you should only have one todo as in_progress at a time
  7. After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation

## When NOT to Use This Tool
Skip using this tool when:
  1. There is only a single, straightforward task
  2. The task is trivial and tracking it provides no organizational benefit
  3. The task can be completed in less than 3 trivial steps
  4. The task is purely conversational or informational

If result is empty, proceed to generate_initial_context. Returns a JSON list of context files.`,
          inputSchema: {
            "type": "object",
            "properties": {},
            "additionalProperties": false
          }
        },
        {
          name: 'get_file',
          description: `Use to read the contents of a specific context file by its UUID. Call after get_contexts when you know which file aligns with your current task.

## Workflow Guidelines
1. Always call get_contexts first to see available files
2. Select the most relevant file based on:
   - File name relevance to your current task
   - File type alignment with your needs
   - Creation/modification timestamps for recent context
3. Use the returned content to inform your development decisions
4. If the file content is insufficient, consider calling other context files or updating existing ones

## Best Practices
- Read context files before making significant code changes
- Use context to maintain consistency with existing patterns
- Reference context when explaining decisions to users`,
          inputSchema: {
            "type": "object",
            "properties": {
              "file_id": {
                "type": "string",
                "description": "File UUID obtained from get_contexts response. This uniquely identifies the context file you want to read."
              }
            },
            "required": ["file_id"],
            "additionalProperties": false
          }
        },
        {
          name: 'add_file',
          description: `Use to add a new context file when you already have prepared content. Prefer generate_initial_context for the first project file.

## When to Use This Tool
- Adding specific documentation for a feature or module
- Creating task-specific context files during development
- Storing important decisions, patterns, or conventions
- Adding reference materials for complex implementations

## Content Guidelines
- Provide clear, structured content that will be useful for future reference
- Include relevant code snippets, patterns, or examples
- Document decisions, rationale, and important considerations
- Use markdown formatting for better readability

## File Naming Best Practices
- Use descriptive names that indicate the content purpose
- Include relevant technology or feature names
- Use consistent naming conventions (kebab-case recommended)
- Add appropriate file extensions (.md, .txt, .json, etc.)`,
          inputSchema: {
            "type": "object",
            "properties": {
              "filename": {
                "type": "string",
                "description": "Descriptive name for the context file. Use clear, specific names that indicate the content purpose (e.g., 'react-component-patterns.md', 'api-authentication-flow.md')."
              },
              "content": {
                "type": "string",
                "description": "Complete content of the context file. Should be well-structured, informative, and useful for future reference. Include relevant code examples, decisions, and explanations."
              },
              "file_type": {
                "type": "string",
                "description": "Logical file type that helps categorize the content (e.g., 'markdown' for documentation, 'javascript' for code snippets, 'json' for configuration examples, 'text' for general notes)."
              }
            },
            "required": ["filename", "content"],
            "additionalProperties": false
          }
        },
        {
          name: 'generate_initial_context',
          description: `Selection hint: Use when get_contexts returns no files. Gather a concise project overview (codebase structure, key modules, workflows) and create the first context file to anchor subsequent tasks.

## Purpose
This tool creates the foundational context file that serves as the starting point for all subsequent development work. It should provide a comprehensive overview that helps maintain consistency and understanding throughout the project lifecycle.

## Content Requirements
Your generated content should include:
1. **Project Overview** - Brief description of the project's purpose and goals
2. **Technology Stack** - Key frameworks, libraries, and tools used
3. **Architecture Overview** - High-level structure and key components
4. **Development Patterns** - Coding conventions and architectural patterns
5. **Key Workflows** - Important processes and development flows
6. **Current Focus** - Specific areas or features being worked on

## Best Practices
- Keep content concise but comprehensive
- Focus on information that will be useful for future development decisions
- Include relevant file paths, component names, and key concepts
- Update this context as the project evolves`,
          inputSchema: {
            "type": "object",
            "properties": {
              "content": {
                "type": "string",
                "description": "Comprehensive initial context content that summarizes the codebase structure, technology stack, key modules, development patterns, and current task focus. This should serve as the foundation for all subsequent development work."
              },
              "filename": {
                "type": "string",
                "description": "Optional filename for the initial context file. If not provided, defaults to 'project-context.md'. Use descriptive names that reflect the project or focus area."
              },
              "file_type": {
                "type": "string",
                "description": "Optional logical file type that categorizes the content format. Defaults to 'markdown' for structured documentation. Other options include 'text' for plain notes or 'json' for structured data."
              }
            },
            "required": ["content"],
            "additionalProperties": false
          }
        },
        {
          name: 'update_file',
          description: `Use to update an existing context file by its UUID. Modify the filename and/or content of a context file. Requires the file ID, new filename, and new content.

## When to Use This Tool
- Updating context files with new information or changes
- Refining documentation based on recent development work
- Correcting or expanding existing context content
- Renaming files to better reflect their current purpose

## Update Guidelines
1. **Preserve Important Information** - Don't lose valuable existing context
2. **Expand Rather Than Replace** - Add new information while keeping relevant old content
3. **Maintain Structure** - Keep consistent formatting and organization
4. **Document Changes** - Consider noting what was updated and why

## Best Practices
- Review the existing content before updating to understand current state
- Ensure the new content maintains consistency with project patterns
- Update related context files if changes affect multiple areas
- Use clear, descriptive filenames that reflect the updated content`,
          inputSchema: {
            "type": "object",
            "properties": {
              "file_id": {
                "type": "string",
                "description": "UUID of the existing context file to update. Obtain this from get_contexts response to ensure you're updating the correct file."
              },
              "filename": {
                "type": "string",
                "description": "New filename for the context file. Should be descriptive and reflect the updated content purpose. Use consistent naming conventions with appropriate file extensions."
              },
              "content": {
                "type": "string",
                "description": "Complete new content for the context file. This will replace the existing content entirely, so ensure all important information is included. Should be well-structured and comprehensive."
              }
            },
            "required": ["file_id", "filename", "content"],
            "additionalProperties": false
          }
        },
        {
          name: 'delete_file',
          description: `Use to delete a context file by its UUID. Permanently removes the file from the project context. This action cannot be undone.

## ⚠️ Important Warnings
- **PERMANENT ACTION**: Deleted files cannot be recovered
- **VERIFY FIRST**: Always confirm you have the correct file_id before deletion
- **CONSIDER ALTERNATIVES**: Often updating content is better than deletion

## When to Use This Tool
- Removing outdated or incorrect context files
- Cleaning up duplicate or redundant documentation
- Removing context files that are no longer relevant to the project
- Consolidating multiple files into a single, more comprehensive file

## Before Deletion Checklist
1. **Verify File ID** - Double-check you have the correct UUID from get_contexts
2. **Review Content** - Use get_file to confirm the file content before deletion
3. **Check Dependencies** - Ensure no other context files reference this content
4. **Consider Archiving** - Sometimes updating with "ARCHIVED" prefix is safer than deletion

## Safety Recommendations
- Use get_contexts and get_file to verify the target file before deletion
- Consider updating the file to mark it as deprecated instead of immediate deletion
- Document the reason for deletion in remaining context files if relevant`,
          inputSchema: {
            "type": "object",
            "properties": {
              "file_id": {
                "type": "string",
                "description": "UUID of the context file to permanently delete. CRITICAL: Verify this is the correct file using get_contexts and get_file before deletion, as this action cannot be undone."
              }
            },
            "required": ["file_id"],
            "additionalProperties": false
          }
        }
      ];

      return { tools };
    });

    // Handle tools/call requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'get_contexts':
          return await this.handleGetContexts(args as {});
        case 'get_file':
          return await this.handleGetFile(args as { file_id: string });
        case 'add_file':
          return await this.handleAddFile(args as { filename: string; content: string; file_type?: string });
        case 'generate_initial_context':
          return await this.handleGenerateInitialContext(args as { content: string; filename?: string; file_type?: string });
        case 'update_file':
          return await this.handleUpdateFile(args as { file_id: string; filename: string; content: string });
        case 'delete_file':
          return await this.handleDeleteFile(args as { file_id: string });
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    // Handle resources/list requests
     this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = [{
        uri: `cortex://project/${this.config.projectId}`,
        name: 'Project Context',
        description: 'Access to project context files and information',
        mimeType: 'application/json'
      }];
      return { resources };
    });

    // Handle resources/read requests
     this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const { uri } = request.params;
      const projectUri = `cortex://project/${this.config.projectId}`;
      
      if (uri !== projectUri) {
        throw new Error(`Resource '${uri}' not found`);
      }

      try {
        const response = await this.httpClient.get(`/api/mcp/contexts/${this.config.projectId}`);
        const contexts = response.data?.result?.contexts || response.data?.contexts || response.data;
        return {
          contents: [{
            uri: uri,
            text: JSON.stringify(contexts, null, 2)
          }]
        };
      } catch (error: any) {
        throw new Error(`Failed to read resource: ${error?.message || 'unknown error'}`);
      }
    });
  }

  private registerTools(): void {
    // This method is kept for compatibility but tools are now handled in setupHandlers
  }

  private async handleGetContexts(args: {}): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    try {
      const response = await this.httpClient.get(`/api/mcp/contexts/${this.config.projectId}`);
      const contexts = response.data?.result?.contexts || [];
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(contexts, null, 2)
        }]
      };
    } catch (error) {
      this.logger.error('Error getting contexts:', error);
      return {
        content: [{
          type: 'text',
          text: `Error getting contexts: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true
      };
    }
  }

  private async handleGetFile({ file_id }: { file_id: string }): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    try {
      const response = await this.httpClient.get(`/api/mcp/contexts/${this.config.projectId}/files/${file_id}`);
      const file = response.data?.result?.file || response.data?.file || response.data;
      const text = typeof file?.content === 'string' ? file.content : JSON.stringify(file, null, 2);
      return {
        content: [{ type: 'text', text }]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error getting file: ${error.message}` }],
        isError: true
      } as any;
    }
  }

  private async handleAddFile(
    { filename, content, file_type }: { filename: string; content: string; file_type?: string }
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    // Use the centralized file creation method which has proper locking
    return await this.performFileCreation(filename, content, file_type);
  }

  private async performFileCreation(
    filename: string, 
    content: string, 
    file_type?: string
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    const lockKey = `${this.config.projectId}:${filename}`;
    
    // Check if there's already a creation in progress for this file
    if (MCPServer.globalFileCreationLocks.has(lockKey)) {
      this.logger.info(`File creation already in progress for ${filename}, waiting...`);
      try {
        await MCPServer.globalFileCreationLocks.get(lockKey);
        // After waiting, check if file now exists
        const listResp = await this.httpClient.get(`/api/mcp/contexts/${this.config.projectId}`);
        const contexts = listResp.data?.result?.contexts || listResp.data?.contexts || listResp.data || [];
        const existing = Array.isArray(contexts) ? contexts.find((c: any) => c?.name === filename) : null;
        if (existing) {
          return {
            content: [{ type: 'text', text: `File already exists: ${filename} (${existing.id || 'unknown'})` }]
          };
        }
      } catch (e) {
        this.logger.warn(`Error waiting for file creation lock: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    // Create a promise for this file creation and store it
    const creationPromise = this.performActualFileCreation(filename, content, file_type);
    MCPServer.globalFileCreationLocks.set(lockKey, creationPromise);
    
    try {
      const result = await creationPromise;
      return result;
    } finally {
      // Clean up the lock
      MCPServer.globalFileCreationLocks.delete(lockKey);
    }
  }

  private async performActualFileCreation(
    filename: string, 
    content: string, 
    file_type?: string
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    try {
      const payload: any = { filename, content };
      if (file_type) payload.file_type = file_type;
      
      // Final check right before HTTP request - this is the last line of defense
      try {
        const preCheckResp = await this.httpClient.get(`/api/mcp/contexts/${this.config.projectId}`);
        const preCheckContexts = preCheckResp.data?.result?.contexts || preCheckResp.data?.contexts || preCheckResp.data || [];
        const preCheckExisting = Array.isArray(preCheckContexts) ? preCheckContexts.find((c: any) => c?.name === filename) : null;
        if (preCheckExisting) {
          this.logger.info(`Final pre-check: File ${filename} already exists, skipping creation`);
          return {
            content: [{ type: 'text', text: `File already exists: ${filename} (${preCheckExisting.id || 'unknown'})` }]
          };
        }
      } catch (preCheckError) {
        this.logger.warn(`Final pre-check failed, proceeding with creation: ${preCheckError instanceof Error ? preCheckError.message : 'unknown'}`);
      }
      
      try {
        const response = await this.httpClient.post(`/api/mcp/contexts/${this.config.projectId}/files`, payload);
        const created = response.data?.result?.file || response.data?.file || response.data;
        const fileId = created?.id || 'unknown';
        this.logger.info(`File created successfully: ${filename} (${fileId})`);
        return {
          content: [{ type: 'text', text: `File added successfully: ${filename} (${fileId})` }]
        };
      } catch (httpError: any) {
        // Check if this is a duplicate file error (409 Conflict or similar)
        if (httpError.response?.status === 409 || 
            (httpError.response?.data && 
             (httpError.response.data.message?.includes('already exists') || 
              httpError.response.data.error?.includes('already exists') ||
              httpError.response.data.detail?.includes('already exists')))) {
          
          this.logger.info(`HTTP duplicate detected for ${filename}, handling gracefully`);
          
          // File was created by another concurrent request, fetch the existing one
          try {
            const listResp = await this.httpClient.get(`/api/mcp/contexts/${this.config.projectId}`);
            const contexts = listResp.data?.result?.contexts || listResp.data?.contexts || listResp.data || [];
            const existing = Array.isArray(contexts) ? contexts.find((c: any) => c?.name === filename) : null;
            if (existing) {
              return {
                content: [{ type: 'text', text: `File already exists: ${filename} (${existing.id || 'unknown'})` }]
              };
            }
          } catch (listError) {
            this.logger.warn(`Failed to fetch existing file after duplicate error: ${listError instanceof Error ? listError.message : 'unknown'}`);
          }
          
          return {
            content: [{ type: 'text', text: `File creation conflict resolved: ${filename}` }]
          };
        }
        
        // Re-throw other HTTP errors
        throw httpError;
      }
    } catch (error: any) {
      this.logger.error(`File creation failed for ${filename}: ${error.message || 'unknown error'}`);
      return {
        content: [{ type: 'text', text: `Error adding file: ${error.message}` }],
        isError: true
      } as any;
    }
  }

  private async handleGenerateInitialContext(
    { content, filename, file_type }: { content: string; filename?: string; file_type?: string }
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    const finalFilename = filename && filename.trim().length > 0 ? filename : 'project-context.md';
    const lockKey = `${this.config.projectId}:${finalFilename}`;
    
    // Check if there's already a creation in progress for this file
    if (MCPServer.globalFileCreationLocks.has(lockKey)) {
      this.logger.info(`Initial context creation already in progress for ${finalFilename}, waiting...`);
      try {
        await MCPServer.globalFileCreationLocks.get(lockKey);
        // After waiting, check if file now exists
        const listResp = await this.httpClient.get(`/api/mcp/contexts/${this.config.projectId}`);
        const contexts = listResp.data?.result?.contexts || listResp.data?.contexts || listResp.data || [];
        const existing = Array.isArray(contexts) ? contexts.find((c: any) => c?.name === finalFilename) : null;
        if (existing) {
          return {
            content: [{ type: 'text', text: `Initial context already exists: ${finalFilename} (${existing.id || 'unknown'})` }]
          };
        }
      } catch (e) {
        this.logger.warn(`Error waiting for initial context creation lock: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    // Create a promise for this initial context creation and store it
    const creationPromise = this.performInitialContextCreation(finalFilename, content, file_type);
    MCPServer.globalFileCreationLocks.set(lockKey, creationPromise);
    
    try {
      const result = await creationPromise;
      return result;
    } finally {
      // Clean up the lock
      MCPServer.globalFileCreationLocks.delete(lockKey);
    }
  }

  private async performInitialContextCreation(
    filename: string, 
    content: string, 
    file_type?: string
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    try {
      // Check existing contexts to avoid duplicates
      const response = await this.httpClient.get(`/api/mcp/contexts/${this.config.projectId}`);
      const contexts = response.data?.result?.contexts || response.data?.contexts || response.data || [];
      const existing = Array.isArray(contexts) ? contexts.find((c: any) => c?.name === filename) : null;

      if (Array.isArray(contexts) && contexts.length > 0) {
        if (existing) {
          return {
            content: [{ type: 'text', text: `Initial context already exists: ${filename} (${existing.id || 'unknown'})` }]
          };
        }
        return {
          content: [{ type: 'text', text: `Project already has context files; skipped generating initial context. Use add_file to create additional files.` }]
        };
      }

      // No contexts present; create the initial one using direct file creation
      return await this.performActualFileCreation(filename, content, file_type);
    } catch (error: any) {
      // If listing contexts fails, attempt creating the file once
      this.logger.warn(`generate_initial_context: contexts listing failed, attempting creation. Error: ${error?.message || 'unknown'}`);
      return await this.performActualFileCreation(filename, content, file_type);
    }
  }

  private async handleUpdateFile(
    { file_id, filename, content }: { file_id: string; filename: string; content: string }
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    try {
      if (!file_id || !filename || !content) {
        return {
          content: [{
            type: 'text',
            text: 'Error: file_id, filename, and content are required'
          }],
          isError: true
        };
      }

      const response = await this.httpClient.put(`/api/files/${file_id}`, {
        filename,
        content
      });

      if (response.data?.success && response.data?.data) {
        return {
          content: [{
            type: 'text',
            text: `File updated successfully: ${response.data.data.name} (${response.data.data.id})`
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: `Update failed: ${response.data?.error || 'Unknown error'}`
          }],
          isError: true
        };
      }
    } catch (error: any) {
      this.logger.error('Error updating file:', error);
      
      // Handle specific error codes
      if (error.response?.status === 413) {
        const limits = error.response?.data?.details?.limits;
        const limitInfo = limits ? JSON.stringify(limits) : 'Storage limit exceeded';
        return {
          content: [{
            type: 'text',
            text: `Storage limit exceeded: ${limitInfo}`
          }],
          isError: true
        };
      }
      
      return {
        content: [{
          type: 'text',
          text: `Error updating file: ${error.response?.data?.error || error.message || 'Unknown error'}`
        }],
        isError: true
      };
    }
  }

  private async handleDeleteFile(
    { file_id }: { file_id: string }
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
    try {
      if (!file_id) {
        return {
          content: [{
            type: 'text',
            text: 'Error: file_id is required'
          }],
          isError: true
        };
      }

      const response = await this.httpClient.delete(`/api/files/${file_id}`);

      if (response.data?.success) {
        return {
          content: [{
            type: 'text',
            text: response.data.message || 'File deleted successfully'
          }]
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: `Delete failed: ${response.data?.error || 'Unknown error'}`
          }],
          isError: true
        };
      }
    } catch (error: any) {
      this.logger.error('Error deleting file:', error);
      return {
        content: [{
          type: 'text',
          text: `Error deleting file: ${error.response?.data?.error || error.message || 'Unknown error'}`
        }],
        isError: true
      };
    }
  }


}

// Factory function for creating server instances
export function createMCPServer(config: Config, logger: Logger): MCPServer {
  return new MCPServer(config, logger);
}