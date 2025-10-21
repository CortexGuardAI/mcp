import { Config } from './types.js';

/**
 * Logging utilities with configurable verbosity
 */
export class Logger {
  public verbose: boolean;
  private silent: boolean;

  constructor(verbose: boolean = false, silent: boolean = false) {
    this.verbose = verbose;
    this.silent = silent;
  }

  info(message: string, ...args: any[]): void {
    if (!this.silent) {
      console.error(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (!this.silent) {
      console.error(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (!this.silent) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.verbose && !this.silent) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  setSilent(silent: boolean): void {
    this.silent = silent;
  }
}

/**
 * Validation utilities
 */
export class Validator {
  private static readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  private static readonly URL_REGEX = /^https?:\/\/.+/;

  static isValidUUID(uuid: string): boolean {
    return typeof uuid === 'string' && this.UUID_REGEX.test(uuid);
  }

  static isValidURL(url: string): boolean {
    if (typeof url !== 'string') return false;
    
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  static isValidTimeout(timeout: number): boolean {
    return typeof timeout === 'number' && timeout > 0 && timeout <= 300000; // Max 5 minutes
  }

  static isValidToken(token: string): boolean {
    return typeof token === 'string' && token.length > 0 && token.length <= 1000;
  }

  static validateConfig(config: Config): string[] {
    const errors: string[] = [];

    if (!this.isValidURL(config.serverUrl)) {
      errors.push('Invalid server URL format');
    }

    if (!this.isValidToken(config.authToken)) {
      errors.push('Invalid auth token');
    }

    if (!this.isValidTimeout(config.timeout)) {
      errors.push('Invalid timeout value (must be 1-300000ms)');
    }

    return errors;
  }
}

/**
 * Content-Length framing utilities
 */
export class FramingUtils {
  private static readonly HEADER_SEPARATOR = '\r\n\r\n';
  private static readonly LINE_SEPARATOR = '\r\n';

  static frameMessage(content: string): string {
    const contentBytes = Buffer.byteLength(content, 'utf8');
    return `Content-Length: ${contentBytes}${this.HEADER_SEPARATOR}${content}`;
  }

  static parseFramedMessage(buffer: Buffer): { message: string; remaining: Buffer } | null {
    const bufferStr = buffer.toString('utf8');
    const headerEndIndex = bufferStr.indexOf(this.HEADER_SEPARATOR);
    
    if (headerEndIndex === -1) {
      // No complete header yet
      return null;
    }

    const headerSection = bufferStr.substring(0, headerEndIndex);
    const contentLengthMatch = headerSection.match(/^Content-Length: (\d+)$/m);
    
    if (!contentLengthMatch) {
      throw new Error('Invalid Content-Length header');
    }

    const contentLength = parseInt(contentLengthMatch[1], 10);
    const messageStart = headerEndIndex + this.HEADER_SEPARATOR.length;
    const messageEnd = messageStart + contentLength;

    if (buffer.length < messageEnd) {
      // Incomplete message
      return null;
    }

    const messageBytes = buffer.subarray(messageStart, messageEnd);
    const message = messageBytes.toString('utf8');
    const remaining = buffer.subarray(messageEnd);

    return { message, remaining };
  }
}

/**
 * JSON utilities with error handling
 */
export class JsonUtils {
  static safeStringify(obj: any): string {
    try {
      return JSON.stringify(obj);
    } catch (error) {
      throw new Error(`JSON stringify error: ${error}`);
    }
  }

  static safeParse(json: string): any {
    try {
      return JSON.parse(json);
    } catch (error) {
      throw new Error(`JSON parse error: ${error}`);
    }
  }
}

/**
 * Error handling utilities
 */
export class ErrorUtils {
  static isNetworkError(error: any): boolean {
    return (
      error &&
      (error.code === 'ECONNREFUSED' ||
       error.code === 'ENOTFOUND' ||
       error.code === 'ETIMEDOUT' ||
       error.code === 'ECONNRESET')
    );
  }

  static isTimeoutError(error: any): boolean {
    return (
      error &&
      (error.code === 'ETIMEDOUT' ||
       error.message?.includes('timeout'))
    );
  }

  static getErrorMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error && error.message) {
      return error.message;
    }
    
    return 'Unknown error';
  }

  static sanitizeError(error: any): any {
    // Remove sensitive information from errors
    const sanitized = { ...error };
    
    // Remove auth tokens from error messages
    if (sanitized.message) {
      sanitized.message = sanitized.message.replace(/Bearer [A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
    }
    
    if (sanitized.config?.headers?.Authorization) {
      sanitized.config.headers.Authorization = '[REDACTED]';
    }
    
    return sanitized;
  }
}

/**
 * Performance monitoring utilities
 */
export class PerfUtils {
  private static timers = new Map<string, number>();

  static startTimer(name: string): void {
    this.timers.set(name, Date.now());
  }

  static endTimer(name: string): number {
    const start = this.timers.get(name);
    if (!start) {
      throw new Error(`Timer '${name}' not found`);
    }
    
    const duration = Date.now() - start;
    this.timers.delete(name);
    return duration;
  }

  static measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.startTimer(name);
    return fn().finally(() => {
      const duration = this.endTimer(name);
      console.error(`[PERF] ${name}: ${duration}ms`);
    });
  }
}

/**
 * Retry utilities for network operations
 */
export class RetryUtils {
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        // Only retry on network errors
        if (!ErrorUtils.isNetworkError(error)) {
          throw error;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }
}