import { StdioTransport } from './stdio-transport.js';
import { MethodDispatcher } from './method-dispatcher.js';
import {
  MCPRequest,
  MCPResponse,
  MCPError,
  JsonRpcErrorCode
} from './types.js';

// Type aliases for compatibility
type JsonRpcMessage = MCPRequest | MCPResponse;
type JsonRpcRequest = MCPRequest;
type JsonRpcResponse = MCPResponse;
type JsonRpcError = MCPError;

export class RpcHandler {
  private transport: StdioTransport;
  private dispatcher: MethodDispatcher;
  private pendingRequests = new Map<string | number, NodeJS.Timeout>();
  private isShuttingDown = false;

  constructor(transport: StdioTransport, dispatcher: MethodDispatcher) {
    this.transport = transport;
    this.dispatcher = dispatcher;
    
    // Handle incoming messages
    this.transport.on('message', this.handleMessage.bind(this));
    this.transport.on('error', this.handleTransportError.bind(this));
    
    // Handle graceful shutdown
    process.on('SIGINT', this.shutdown.bind(this));
    process.on('SIGTERM', this.shutdown.bind(this));
  }

  async start(): Promise<void> {
    await this.transport.start();
  }

  private async handleMessage(message: JsonRpcMessage): Promise<void> {
    if (this.isShuttingDown) {
      // Reject new requests during shutdown
      if (this.isRequest(message)) {
        const errorResponse: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: JsonRpcErrorCode.SERVER_ERROR,
            message: 'Server is shutting down',
            data: { shutting_down: true }
          }
        };
        await this.transport.send(errorResponse);
      }
      return;
    }

    try {
      if (this.isRequest(message)) {
        await this.handleRequest(message);
      } else if (this.isNotification(message)) {
        await this.handleNotification(message);
      } else {
        // Invalid message format
        const errorResponse: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: 'unknown',
          error: {
            code: JsonRpcErrorCode.INVALID_REQUEST,
            message: 'Invalid JSON-RPC message format',
            data: { received: message }
          }
        };
        await this.transport.send(errorResponse);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      
      // Send error response if we can identify the request
      if (this.isRequest(message)) {
        const errorResponse: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: JsonRpcErrorCode.INTERNAL_ERROR,
            message: 'Internal server error',
            data: { error: String(error) }
          }
        };
        await this.transport.send(errorResponse);
      }
    }
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    const requestId = request.id;
    
    // Set timeout for request processing
    const timeout = setTimeout(() => {
      this.pendingRequests.delete(requestId);
      const timeoutResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: JsonRpcErrorCode.SERVER_ERROR,
          message: 'Request timeout',
          data: { method: request.method, timeout_ms: 30000 }
        }
      };
      this.transport.send(timeoutResponse).catch(console.error);
    }, 30000); // 30 second timeout

    this.pendingRequests.set(requestId, timeout);

    try {
      // Validate request format
      if (!request.method || typeof request.method !== 'string') {
        throw {
          code: JsonRpcErrorCode.INVALID_REQUEST,
          message: 'Missing or invalid method',
          data: { received: request }
        };
      }

      // Dispatch to method handler
      const result = await this.dispatcher.handleRequest({
        jsonrpc: '2.0',
        id: request.id,
        method: request.method,
        params: request.params || {}
      });

      // Clear timeout and send success response
      clearTimeout(timeout);
      this.pendingRequests.delete(requestId);

      const response: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: requestId,
        result
      };

      await this.transport.send(response);
    } catch (error: any) {
      // Clear timeout
      clearTimeout(timeout);
      this.pendingRequests.delete(requestId);

      // Map error to JSON-RPC error format
      const jsonRpcError = this.mapToJsonRpcError(error);
      
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: requestId,
        error: jsonRpcError
      };

      await this.transport.send(errorResponse);
    }
  }

  private async handleNotification(notification: JsonRpcRequest): Promise<void> {
    try {
      // Notifications don't expect a response
      await this.dispatcher.handleRequest({
        jsonrpc: '2.0',
        id: 'notification',
        method: notification.method,
        params: notification.params || {}
      });
    } catch (error) {
      // Log notification errors but don't send response
      console.error(`Error handling notification ${notification.method}:`, error);
    }
  }

  private handleTransportError(error: Error): void {
    console.error('Transport error:', error);
    
    // Attempt graceful shutdown on transport errors
    this.shutdown().catch(console.error);
  }

  private async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    console.error('Shutting down MCP adapter...');
    this.isShuttingDown = true;

    // Send error responses for pending requests
    const shutdownError: JsonRpcError = {
      code: JsonRpcErrorCode.SERVER_ERROR,
      message: 'Server shutting down',
      data: { shutting_down: true }
    };

    for (const [requestId, timeout] of this.pendingRequests) {
      clearTimeout(timeout);
      
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: requestId,
        error: shutdownError
      };
      
      try {
        await this.transport.send(errorResponse);
      } catch (error) {
        console.error('Error sending shutdown response:', error);
      }
    }

    this.pendingRequests.clear();

    // Close transport
    await this.transport.close();

    // Exit process
    process.exit(0);
  }

  private isRequest(message: any): message is JsonRpcRequest {
    return (
      message &&
      message.jsonrpc === '2.0' &&
      typeof message.method === 'string' &&
      (message.id !== undefined)
    );
  }

  private isNotification(message: any): message is JsonRpcRequest {
    return (
      message &&
      message.jsonrpc === '2.0' &&
      typeof message.method === 'string' &&
      message.id === undefined
    );
  }

  private mapToJsonRpcError(error: any): JsonRpcError {
    // If already a JSON-RPC error, return as-is
    if (error && typeof error.code === 'number' && error.message) {
      return {
        code: error.code,
        message: error.message,
        data: error.data
      };
    }

    // Map common error types
    if (error instanceof TypeError) {
      return {
        code: JsonRpcErrorCode.INVALID_PARAMS,
        message: 'Invalid parameters',
        data: { error: error.message }
      };
    }

    if (error instanceof SyntaxError) {
      return {
        code: JsonRpcErrorCode.PARSE_ERROR,
        message: 'Parse error',
        data: { error: error.message }
      };
    }

    // Default to internal error
    return {
      code: JsonRpcErrorCode.INTERNAL_ERROR,
      message: 'Internal error',
      data: { error: String(error) }
    };
  }
}