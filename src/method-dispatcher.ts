import { HttpClient } from './http-client.js';
import {
  MCPRequest,
  InitializeParams,
  InitializeResult,
  ListProjectsParams,
  ListProjectsResult,
  GetContextsParams,
  GetContextsResult,
  GetFileParams,
  GetFileResult,
  AddFileParams,
  AddFileResult,
  ToolCall,
  ToolResult,
  JsonRpcErrorCode
} from './types.js';

// UUID validation regex (reuse server-side pattern)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MethodDispatcher {
  private httpClient: HttpClient;
  private serverInfo = {
    name: 'cortex-mcp-adapter',
    version: '1.0.0'
  };
  private isInitialized: boolean = false;
  private initializationTimeout: NodeJS.Timeout | null = null;
  private initializationStartTime?: number;

  constructor(
    httpClient: HttpClient,
    private projectId: string,
    private logger: any = console
  ) {
    this.httpClient = httpClient;
    
    // Log debug status to backend
    this.logProtocolMessage('outgoing', 'debug', {
      event: 'adapter_constructor',
      projectId: this.projectId,
      timestamp: new Date().toISOString()
    });
    
    // Record initialization start time for better logging
    this.initializationStartTime = Date.now();
    
    // Set up fallback initialization timeout
    // Some IDEs may not send 'initialized' notification properly
    this.initializationTimeout = setTimeout(() => {
      if (!this.isInitialized) {
        const elapsed = Date.now() - (this.initializationStartTime || 0);
        this.logger.warn(`[MCP-ADAPTER] No initialized notification received within ${elapsed}ms, assuming ready`);
        this.logProtocolMessage('internal', 'timeout', {
          event: 'initialization_timeout',
          forced_initialization: true,
          elapsed_ms: elapsed,
          reason: 'IDE did not send initialized notification within timeout period',
          timestamp: new Date().toISOString()
        });
        this.isInitialized = true;
      }
    }, 15000);
  }

  public cleanup(): void {
    if (this.initializationTimeout) {
      clearTimeout(this.initializationTimeout);
      this.initializationTimeout = null;
    }
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Log protocol messages to backend for debugging
   */
  private async logProtocolMessage(direction: string, method: string, message: any): Promise<void> {
    try {
      await this.httpClient.post('/api/mcp/debug/log-message', {
        direction,
        method,
        message,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      // Don't let debug logging failures affect the main functionality
      this.logger.debug('Failed to log protocol message:', error);
    }
  }

  async handleRequest(request: any): Promise<any> {
    const { method, params, id } = request;
    const timestamp = new Date().toISOString();
    
    this.logger.info(`[MCP-ADAPTER] ${timestamp} - Handling request:`, {
      method,
      id,
      params,
      initialized: this.isInitialized
    });
    
    // Allow initialization methods and be resilient for other methods
    const initializationMethods = ['initialize', 'initialized'];
    const isInitMethod = initializationMethods.includes(method);
    
    if (!isInitMethod && !this.isInitialized) {
      this.logger.warn(`[MCP-ADAPTER] Received ${method} before initialization complete, proceeding anyway`);
    }

    try {
      let result;
      switch (method) {
        case 'initialize':
          return await this.handleInitialize(params, id);
        case 'initialized':
          return await this.handleInitialized(id);
        case 'resources/list':
          result = await this.handleResourcesList(id);
          break;
        case 'resources/read':
          result = await this.handleResourcesRead(params, id);
          break;
        case 'tools/list':
          result = await this.handleToolsList(id);
          break;
        case 'tools/call':
          result = await this.handleToolsCall(params, id);
          break;
        default:
          throw new Error(`Unknown method: ${method}`);
      }
      
      this.logger.info(`[MCP-ADAPTER] ${timestamp} - Request completed:`, {
        method,
        id,
        success: true
      });
      
      return result;
    } catch (error) {
      this.logger.error(`[MCP-ADAPTER] ${timestamp} - Request failed:`, {
        method,
        id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async handleInitialize(params: any, id: string): Promise<any> {
    this.logger.info(`[MCP-ADAPTER] Initialize request received`, { id, params });
    
    // Log initialization request
    await this.logProtocolMessage('incoming', 'initialize', {
      id,
      params,
      event: 'initialize_request'
    });
    
    // Support multiple protocol versions with fallback (prefer latest stable)
    const supportedVersions = ['2024-11-05', '2024-10-07', '1.0.0'];
    const clientVersion = params?.protocolVersion;
    const protocolVersion = supportedVersions.includes(clientVersion) ? clientVersion : supportedVersions[0];
    
    if (clientVersion && clientVersion !== protocolVersion) {
      this.logger.info(`[MCP-ADAPTER] Client requested version ${clientVersion}, using ${protocolVersion}`);
    }
    
    const result = {
      protocolVersion,
      capabilities: {
        resources: {
          subscribe: false,
          listChanged: false
        },
        tools: {
          listChanged: false
        },
        logging: {},
        prompts: {
          listChanged: false
        }
      },
      serverInfo: {
        name: 'cortex-context-mcp',
        version: '1.0.0'
      },
      instructions: 'MCP server for Cortex Context - provides access to project context files and tools for AI coding assistance.'
    };
    
    this.logger.info(`[MCP-ADAPTER] Initialize response prepared`, { id, protocolVersion, capabilities: Object.keys(result.capabilities) });
    
    // Log initialization response
    await this.logProtocolMessage('outgoing', 'initialize', {
      id,
      response: result,
      event: 'initialize_response'
    });
    
    // Return only the result payload; RpcHandler will wrap in JSON-RPC envelope
    return result;
  }

  private async handleInitialized(id: string): Promise<null> {
    const elapsed = Date.now() - (this.initializationStartTime || 0);
    this.logger.info(`[MCP-ADAPTER] Client initialization complete after ${elapsed}ms`, { id });
    
    // Log initialized notification
    await this.logProtocolMessage('incoming', 'initialized', {
      id,
      event: 'initialized_notification',
      elapsed_ms: elapsed,
      method: 'initialized_notification',
      timestamp: new Date().toISOString()
    });
    
    // Mark as initialized and clear timeout
    this.isInitialized = true;
    if (this.initializationTimeout) {
      clearTimeout(this.initializationTimeout);
      this.initializationTimeout = null;
    }
    
    // No response needed for notifications
    return null;
  }

  private handleResourcesList(id: string): any {
    this.logger.info('[MCP-ADAPTER] Handling resources/list request', { id });
    
    const result = {
      resources: [
        {
          uri: `cortex://project/${this.projectId}`,
          name: 'Project Context',
          description: 'Access to project context files and information',
          mimeType: 'application/json'
        }
      ]
    };
    
    this.logger.info('[MCP-ADAPTER] Resources list response:', result);
    return result;
  }

  private async handleResourcesRead(params: any, id: string): Promise<any> {
    this.logger.info('[MCP-ADAPTER] Handling resources/read request', { id, params });

    try {
      // Expecting a URI like cortex://project/{projectId}
      const match = typeof params?.uri === 'string' && params.uri.match(/^cortex:\/\/project\/([0-9a-f\-]{36})$/i);
      const projectId = match ? match[1] : this.projectId;
      
      const response = await this.httpClient.get(`/api/mcp/contexts/${projectId}`);
      const contexts = response.data?.result?.contexts || response.data?.contexts || response.data;
      
      const result = {
        contents: [{
          type: 'text',
          text: JSON.stringify(contexts, null, 2)
        }]
      };
      
      this.logger.info('[MCP-ADAPTER] Resources read response:', result);
      return result;
    } catch (error: any) {
      // Throw to let RpcHandler produce a proper JSON-RPC error envelope
      this.logger.error('[MCP-ADAPTER] Resources read failed:', { id, error: error?.message });
      throw {
        code: JsonRpcErrorCode.INTERNAL_ERROR,
        message: 'Failed to read resource',
        data: { uri: params?.uri, error: error?.message }
      };
    }
  }

  private async handleToolsList(id: string): Promise<any> {
    this.logger.info(`[MCP-ADAPTER] Tools list request`, { id, timestamp: new Date().toISOString() });
    
    // Log tools list request
    await this.logProtocolMessage('incoming', 'tools/list', {
      id,
      event: 'tools_list_request'
    });
    
    const tools = [
      {
        name: 'get_contexts',
        title: 'Get Contexts',
        description: 'Get all contexts for a specific project',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'Project UUID'
            }
          },
          required: ['project_id'],
          additionalProperties: false
        }
      },
      {
        name: 'get_file',
        title: 'Get File',
        description: 'Get a specific file from a project context',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Project UUID' },
            file_id: { type: 'string', description: 'File UUID' }
          },
          required: ['project_id', 'file_id'],
          additionalProperties: false
        }
      },
      {
        name: 'add_file',
        title: 'Add File',
        description: 'Add a new file to the project context',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Project UUID' },
            filename: {
              type: 'string',
              description: 'Name of the file to add'
            },
            content: {
              type: 'string', 
              description: 'Content of the file'
            },
            file_type: {
              type: 'string',
              description: 'Logical file type (e.g., javascript, text, json)'
            }
          },
          required: ['project_id', 'filename', 'content'],
          additionalProperties: false
        }
      }
    ];
    
    const response = {
      tools
    };
    
    // Log tools list response
    await this.logProtocolMessage('outgoing', 'tools/list', {
      id,
      response,
      event: 'tools_list_response',
      toolCount: tools.length
    });
    
    this.logger.info(`[MCP-ADAPTER] Tools list response`, { id, toolCount: tools.length, timestamp: new Date().toISOString() });
    return response;
  }

  private async handleToolsCall(params: any, id: string): Promise<any> {
    this.logger.info('[MCP-ADAPTER] Handling tools/call request', { id, params });
    
    // Log tool call request
    await this.logProtocolMessage('incoming', 'tools/call', {
      id,
      tool: params.name,
      arguments: params.arguments,
      event: 'tool_call_request'
    });
    
    try {
      if (!params.name || typeof params.name !== 'string') {
        throw {
          code: JsonRpcErrorCode.INVALID_PARAMS,
          message: 'Missing or invalid tool name',
          data: { received: params }
        };
      }

      const toolName = params.name;
      const args = params.arguments || {};

      let result;
      switch (toolName) {
        case 'get_contexts':
          result = await this.callGetContexts(args);
          break;
        
        case 'get_file':
          result = await this.callGetFile(args);
          break;
        
        case 'add_file':
          result = await this.callAddFile(args);
          break;
        
        default:
          throw {
            code: JsonRpcErrorCode.METHOD_NOT_FOUND,
            message: `Unknown tool: ${toolName}`,
            data: { tool_name: toolName }
          };
      }
      
      // Log tool call response
      await this.logProtocolMessage('outgoing', 'tools/call', {
        id,
        tool: params.name,
        response: result,
        event: 'tool_call_response'
      });
      
      this.logger.info('[MCP-ADAPTER] Tools call response (result payload):', result);
      // Return only the ToolResult payload; RpcHandler will wrap it
      return result;
    } catch (error: any) {
      const mappedError = {
        code: error?.code ?? JsonRpcErrorCode.INTERNAL_ERROR,
        message: error?.message ?? 'Internal tool error',
        data: error?.data
      };
      
      // Log tool call error
      await this.logProtocolMessage('outgoing', 'tools/call', {
        id,
        tool: params?.name,
        error: mappedError,
        event: 'tool_call_error'
      });
      
      this.logger.error('[MCP-ADAPTER] Tools call error:', { id, error: mappedError.message });
      // Rethrow to let RpcHandler produce JSON-RPC error envelope
      throw mappedError;
    }
  }

  private async callGetContexts(args: GetContextsParams): Promise<ToolResult> {
    if (!args.project_id || !UUID_REGEX.test(args.project_id)) {
      throw {
        code: JsonRpcErrorCode.INVALID_PARAMS,
        message: 'Invalid or missing project_id',
        data: { project_id: args.project_id }
      };
    }

    try {
      const response = await this.httpClient.get(`/api/mcp/contexts/${args.project_id}`);
      const contexts = response.data?.result?.contexts || [];
      
      return {
        content: [{
          type: 'text',
          text: `Found ${contexts.length} context file(s):\n\n${contexts.map((c: any) => `• ${c.name} (${c.id}) - ${c.mimeType || c.metadata?.file_type || 'unknown'}`).join('\n')}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error getting contexts: ${error.message}`
        }],
        isError: true
      };
    }
  }

  private async callGetFile(args: GetFileParams): Promise<ToolResult> {
    if (!args.project_id || !UUID_REGEX.test(args.project_id)) {
      throw {
        code: JsonRpcErrorCode.INVALID_PARAMS,
        message: 'Invalid or missing project_id',
        data: { project_id: args.project_id }
      };
    }

    if (!args.file_id || !UUID_REGEX.test(args.file_id)) {
      throw {
        code: JsonRpcErrorCode.INVALID_PARAMS,
        message: 'Invalid or missing file_id',
        data: { file_id: args.file_id }
      };
    }

    try {
      const response = await this.httpClient.get(`/api/mcp/contexts/${args.project_id}/files/${args.file_id}`);
      const file = response.data?.result?.context || response.data;
      
      return {
        content: [{
          type: 'text',
          text: `File: ${file.name}\nSize: ${file.size} bytes\nType: ${file.mimeType || file.metadata?.file_type || 'unknown'}\n\nContent:\n${file.content}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error getting file: ${error.message}`
        }],
        isError: true
      };
    }
  }

  private async callAddFile(args: AddFileParams): Promise<ToolResult> {
    if (!args.project_id || !UUID_REGEX.test(args.project_id)) {
      throw {
        code: JsonRpcErrorCode.INVALID_PARAMS,
        message: 'Invalid or missing project_id',
        data: { project_id: args.project_id }
      };
    }

    if (!args.filename || typeof args.filename !== 'string') {
      throw {
        code: JsonRpcErrorCode.INVALID_PARAMS,
        message: 'Invalid or missing filename',
        data: { filename: args.filename }
      };
    }

    if (!args.content || typeof args.content !== 'string') {
      throw {
        code: JsonRpcErrorCode.INVALID_PARAMS,
        message: 'Invalid or missing file content',
        data: { content: typeof args.content }
      };
    }

    try {
      const response = await this.httpClient.post(`/api/mcp/contexts/${args.project_id}/files`, {
        filename: args.filename,
        content: args.content,
        file_type: args.file_type || 'text'
      });
      
      const file = response.data?.result?.context || response.data;
      
      return {
        content: [{
          type: 'text',
          text: `File added successfully:\n• Name: ${file.name}\n• ID: ${file.id}\n• Size: ${file.size} bytes\n• Type: ${file.mimeType || file.metadata?.file_type || 'unknown'}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error adding file: ${error.message}`
        }],
        isError: true
      };
    }
  }
}