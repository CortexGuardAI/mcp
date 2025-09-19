// MCP Adapter Type Definitions

// Import existing project types for consistency
// Note: Using relative import to avoid rootDir issues
export interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface ContextFile {
  id: string;
  name: string;
  content: string;
  mime_type: string;
  size: number;
  created_at: string;
}

// JSON-RPC Base Types
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

// MCP Protocol Types
export interface InitializeParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface ClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: {};
}

export interface ServerCapabilities {
  logging?: {};
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

// Tool-specific Types
export interface ListProjectsParams {
  // No parameters required
}

export interface ListProjectsResult {
  projects: Array<{
    id: string;
    name: string;
    description?: string;
    created_at: string;
  }>;
}

export interface GetContextsParams {
  project_id: string; // UUID format
}

export interface GetContextsResult {
  contexts: Array<{
    id: string;
    name: string;
    file_count: number;
    created_at: string;
  }>;
}

export interface GetFileParams {
  project_id: string; // UUID format
  file_id: string;    // UUID format
}

export interface GetFileResult {
  id: string;
  name: string;
  content: string;
  mime_type: string;
  size: number;
  created_at: string;
}

export interface AddFileParams {
  project_id: string; // UUID format
  filename: string;
  content: string;
  file_type?: string;
}

export interface AddFileResult {
  id: string;
  name: string;
  created_at: string;
}

// Configuration Types
export interface AdapterConfig {
  serverUrl: string;
  authToken: string;
  projectId: string;
  timeout: number;
  verbose: boolean;
}

// HTTP Client Types
export interface HttpClientOptions {
  baseUrl: string;
  authToken: string;
  timeout: number;
  projectId: string;
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

// Error Mapping Types
export interface ErrorMapping {
  httpStatus: number;
  jsonRpcCode: number;
  message: string;
}

// Message Framing Types
export interface FramedMessage {
  contentLength: number;
  content: string;
}

// Tool Call Types
export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  content: Array<{
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// JSON-RPC Error Codes
export enum JsonRpcErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  SERVER_ERROR = -32000,
  // Custom error codes for HTTP mapping
  UNAUTHORIZED = -32001,
  FORBIDDEN = -32002,
  NOT_FOUND = -32003,
  RATE_LIMITED = -32004,
  SERVICE_UNAVAILABLE = -32005
}

// Export Config as alias for AdapterConfig for backward compatibility
export type Config = AdapterConfig;