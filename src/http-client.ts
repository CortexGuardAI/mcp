import { HttpClientOptions, HttpResponse, ErrorMapping, JsonRpcErrorCode } from './types.js';

// HTTP to JSON-RPC error mapping table
const ERROR_MAPPINGS: ErrorMapping[] = [
  { httpStatus: 400, jsonRpcCode: JsonRpcErrorCode.INVALID_PARAMS, message: 'Invalid request parameters' },
  { httpStatus: 401, jsonRpcCode: JsonRpcErrorCode.UNAUTHORIZED, message: 'Unauthorized' },
  { httpStatus: 403, jsonRpcCode: JsonRpcErrorCode.FORBIDDEN, message: 'Forbidden' },
  { httpStatus: 404, jsonRpcCode: JsonRpcErrorCode.NOT_FOUND, message: 'Resource not found' },
  { httpStatus: 429, jsonRpcCode: JsonRpcErrorCode.RATE_LIMITED, message: 'Rate limit exceeded' },
  { httpStatus: 500, jsonRpcCode: JsonRpcErrorCode.INTERNAL_ERROR, message: 'Internal server error' },
  { httpStatus: 502, jsonRpcCode: JsonRpcErrorCode.SERVICE_UNAVAILABLE, message: 'Bad gateway' },
  { httpStatus: 503, jsonRpcCode: JsonRpcErrorCode.SERVICE_UNAVAILABLE, message: 'Service unavailable' },
  { httpStatus: 504, jsonRpcCode: JsonRpcErrorCode.SERVICE_UNAVAILABLE, message: 'Gateway timeout' }
];

export class HttpClient {
  private baseUrl: string;
  private authToken: string;
  private projectId: string;
  private timeout: number;
  private controller: AbortController;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl;
    this.authToken = options.authToken;
    this.projectId = options.projectId;
    this.timeout = options.timeout; // milliseconds provided by config
    this.controller = new AbortController();
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authToken}`,
      'User-Agent': 'cortex-mcp-adapter/1.0.0',
      'X-Project-Id': this.projectId
    };
  }

  private createTimeoutSignal(): AbortSignal {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeout);

    return controller.signal;
  }

  private mapHttpError(status: number, responseText: string): { code: number; message: string; data?: any } {
    const mapping = ERROR_MAPPINGS.find(m => m.httpStatus === status);
    
    if (mapping) {
      const errorData: any = {
        http_status: status
      };

      // Parse rate limit headers for 429 responses
      if (status === 429) {
        try {
          const response = JSON.parse(responseText);
          if (response.retryAfter) {
            errorData.retry_after = response.retryAfter;
          }
        } catch {
          // Ignore JSON parse errors for rate limit data
        }
      }

      // Add response details if available
      if (responseText) {
        try {
          const parsed = JSON.parse(responseText);
          if (parsed.message) {
            errorData.details = parsed.message;
          }
        } catch {
          errorData.details = responseText;
        }
      }

      return {
        code: mapping.jsonRpcCode,
        message: mapping.message,
        data: errorData
      };
    }

    // Default error for unmapped status codes
    return {
      code: JsonRpcErrorCode.INTERNAL_ERROR,
      message: `HTTP ${status}: ${responseText || 'Unknown error'}`,
      data: { http_status: status }
    };
  }

  async get<T = any>(path: string): Promise<HttpResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: this.createTimeoutSignal()
      });

      const responseText = await response.text();
      
      if (!response.ok) {
        const error = this.mapHttpError(response.status, responseText);
        throw error;
      }

      let data: T;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = responseText as any;
      }

      return {
        data,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: 'Request timeout',
          data: { timeout: this.timeout / 1000 }
        };
      }
      
      // Re-throw mapped errors
      if (error.code && error.message) {
        throw error;
      }
      
      // Handle network errors
      throw {
        code: JsonRpcErrorCode.INTERNAL_ERROR,
        message: `Network error: ${error.message}`,
        data: { original_error: error.message }
      };
    }
  }

  async post<T = any>(path: string, body: any): Promise<HttpResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: this.createTimeoutSignal()
      });

      const responseText = await response.text();
      
      if (!response.ok) {
        const error = this.mapHttpError(response.status, responseText);
        throw error;
      }

      let data: T;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = responseText as any;
      }

      return {
        data,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: 'Request timeout',
          data: { timeout: this.timeout / 1000 }
        };
      }
      
      // Re-throw mapped errors
      if (error.code && error.message) {
        throw error;
      }
      
      // Handle network errors
      throw {
        code: JsonRpcErrorCode.INTERNAL_ERROR,
        message: `Network error: ${error.message}`,
        data: { original_error: error.message }
      };
    }
  }

  // Cleanup method for graceful shutdown
  destroy(): void {
    // Abort any in-flight requests
  }
}