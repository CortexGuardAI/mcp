import { EventEmitter } from 'events';
import { MCPRequest, MCPResponse, FramedMessage } from './types.js';

const CONTENT_LENGTH_HEADER = 'Content-Length:';
const HEADER_SEPARATOR = '\r\n\r\n';
const LINE_SEPARATOR = '\r\n';

export class StdioTransport extends EventEmitter {
  private inputBuffer: string = '';
  private outputStream: NodeJS.WriteStream;
  private inputStream: NodeJS.ReadStream;
  private isShuttingDown: boolean = false;

  constructor() {
    super();
    this.inputStream = process.stdin;
    this.outputStream = process.stdout;
    this.setupInputHandling();
  }

  private setupInputHandling(): void {
    // Set stdin to raw mode for binary data handling
    this.inputStream.setEncoding('utf8');
    
    this.inputStream.on('data', (chunk: string) => {
      if (this.isShuttingDown) return;
      
      this.inputBuffer += chunk;
      this.processBuffer();
    });

    this.inputStream.on('end', () => {
      this.emit('disconnect');
    });

    this.inputStream.on('error', (error) => {
      this.emit('error', error);
    });
  }

  private processBuffer(): void {
    while (true) {
      const message = this.extractMessage();
      if (!message) break;
      
      try {
        const parsed = JSON.parse(message.content);
        this.emit('message', parsed);
      } catch (error) {
        this.emit('error', new Error(`Invalid JSON in message: ${error}`));
      }
    }
  }

  private extractMessage(): FramedMessage | null {
    // Look for Content-Length header
    const headerEndIndex = this.inputBuffer.indexOf(HEADER_SEPARATOR);
    if (headerEndIndex === -1) {
      return null; // No complete header yet
    }

    const headerSection = this.inputBuffer.substring(0, headerEndIndex);
    const contentStartIndex = headerEndIndex + HEADER_SEPARATOR.length;

    // Parse Content-Length
    const contentLengthMatch = headerSection.match(new RegExp(`${CONTENT_LENGTH_HEADER}\\s*(\\d+)`, 'i'));
    if (!contentLengthMatch) {
      // Invalid header format, skip this message
      this.inputBuffer = this.inputBuffer.substring(contentStartIndex);
      return null;
    }

    const contentLength = parseInt(contentLengthMatch[1], 10);
    if (isNaN(contentLength) || contentLength < 0) {
      // Invalid content length
      this.inputBuffer = this.inputBuffer.substring(contentStartIndex);
      return null;
    }

    // Check if we have the complete message
    if (this.inputBuffer.length < contentStartIndex + contentLength) {
      return null; // Incomplete message
    }

    // Extract the message content
    const content = this.inputBuffer.substring(contentStartIndex, contentStartIndex + contentLength);
    
    // Remove processed message from buffer
    this.inputBuffer = this.inputBuffer.substring(contentStartIndex + contentLength);

    return {
      contentLength,
      content
    };
  }

  public sendMessage(message: MCPResponse): void {
    if (this.isShuttingDown) return;

    try {
      const content = JSON.stringify(message);
      const contentLength = Buffer.byteLength(content, 'utf8');
      const frame = `${CONTENT_LENGTH_HEADER} ${contentLength}${HEADER_SEPARATOR}${content}`;
      
      this.outputStream.write(frame);
    } catch (error) {
      this.emit('error', new Error(`Failed to send message: ${error}`));
    }
  }

  public sendError(id: string | number, code: number, message: string, data?: any): void {
    const errorResponse: MCPResponse = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data
      }
    };
    
    this.sendMessage(errorResponse);
  }

  public sendResult(id: string | number, result: any): void {
    const response: MCPResponse = {
      jsonrpc: '2.0',
      id,
      result
    };
    
    this.sendMessage(response);
  }

  public sendNotification(method: string, params?: any): void {
    const notification = {
      jsonrpc: '2.0' as const,
      method,
      params
    };
    
    try {
      const content = JSON.stringify(notification);
      const contentLength = Buffer.byteLength(content, 'utf8');
      const frame = `${CONTENT_LENGTH_HEADER} ${contentLength}${HEADER_SEPARATOR}${content}`;
      
      this.outputStream.write(frame);
    } catch (error) {
      this.emit('error', new Error(`Failed to send notification: ${error}`));
    }
  }

  public isValidJsonRpcRequest(obj: any): obj is MCPRequest {
    return (
      obj &&
      typeof obj === 'object' &&
      obj.jsonrpc === '2.0' &&
      (typeof obj.id === 'string' || typeof obj.id === 'number') &&
      typeof obj.method === 'string'
    );
  }

  public start(): void {
    // Transport is already initialized in constructor
    // This method is required by the MCP server interface
    this.emit('ready');
  }

  public shutdown(): void {
    this.isShuttingDown = true;
    
    // Close streams gracefully
    if (this.inputStream && !this.inputStream.destroyed) {
      this.inputStream.destroy();
    }
    
    if (this.outputStream && !this.outputStream.destroyed) {
      this.outputStream.end();
    }
    
    this.emit('shutdown');
  }

  // Utility method for debugging
  public getBufferInfo(): { bufferLength: number; bufferPreview: string } {
    return {
      bufferLength: this.inputBuffer.length,
      bufferPreview: this.inputBuffer.substring(0, 100) + (this.inputBuffer.length > 100 ? '...' : '')
    };
  }

  // Alias methods for compatibility with rpc-handler
  public async send(message: MCPResponse): Promise<void> {
    this.sendMessage(message);
  }

  public async close(): Promise<void> {
    this.shutdown();
  }
}