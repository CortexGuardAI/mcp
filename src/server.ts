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
          description: 'Selection hint: Start here. Use to check availability and fetch all context files for the current project. If result is empty, proceed to generate_initial_context. Returns a JSON list of context files.',
          inputSchema: {
            "type": "object",
            "properties": {},
            "additionalProperties": false
          }
        },
        {
          name: 'get_file',
          description: 'Use to read the contents of a specific context file by its UUID. Call after get_contexts when you know which file aligns with your current task.',
          inputSchema: {
            "type": "object",
            "properties": {
              "file_id": {
                "type": "string",
                "description": "File UUID"
              }
            },
            "required": ["file_id"],
            "additionalProperties": false
          }
        },
        {
          name: 'add_file',
          description: 'Use to add a new context file when you already have prepared content. Prefer generate_initial_context for the first project file. Provide filename, content, and optional logical type.',
          inputSchema: {
            "type": "object",
            "properties": {
              "filename": {
                "type": "string",
                "description": "Name of the file to add"
              },
              "content": {
                "type": "string",
                "description": "Content of the file"
              },
              "file_type": {
                "type": "string",
                "description": "Logical file type (e.g., javascript, text, json)"
              }
            },
            "required": ["filename", "content"],
            "additionalProperties": false
          }
        },
        {
          name: 'generate_initial_context',
          description: 'Selection hint: Use when get_contexts returns no files. Gather a concise project overview (codebase structure, key modules, workflows) and create the first context file to anchor subsequent tasks. Provide content you generated; filename defaults to project-context.md.',
          inputSchema: {
            "type": "object",
            "properties": {
              "content": {
                "type": "string",
                "description": "Initial context content summarizing the codebase and task focus"
              },
              "filename": {
                "type": "string",
                "description": "Optional filename (defaults to project-context.md)"
              },
              "file_type": {
                "type": "string",
                "description": "Optional logical file type (e.g., markdown, text)"
              }
            },
            "required": ["content"],
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



}

// Factory function for creating server instances
export function createMCPServer(config: Config, logger: Logger): MCPServer {
  return new MCPServer(config, logger);
}