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
          description: 'Get all contexts for the configured project',
          inputSchema: {
            "type": "object",
            "properties": {},
            "additionalProperties": false
          }
        },
        {
          name: 'get_file',
          description: 'Get a specific file from the project context',
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
          description: 'Add a new file to the project context',
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
    try {
      const payload: any = { filename, content };
      if (file_type) payload.file_type = file_type;
      const response = await this.httpClient.post(`/api/mcp/contexts/${this.config.projectId}/files`, payload);
      const created = response.data?.result?.file || response.data?.file || response.data;
      const fileId = created?.id || 'unknown';
      return {
        content: [{ type: 'text', text: `File added successfully: ${filename} (${fileId})` }]
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error adding file: ${error.message}` }],
        isError: true
      } as any;
    }
  }



}

// Factory function for creating server instances
export function createMCPServer(config: Config, logger: Logger): MCPServer {
  return new MCPServer(config, logger);
}