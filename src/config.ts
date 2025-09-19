import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { AdapterConfig } from './types.js';

export interface MCPConfig {
  serverUrl: string;
  authToken: string;
  projectId: string;
  timeout: number;
  verbose: boolean;
}

// URL validation function
function isValidURL(url: string): boolean {
  if (typeof url !== 'string' || url.length === 0) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Token validation - minimum length check
const MIN_TOKEN_LENGTH = 10;

export function parseConfig(argv: string[]): MCPConfig {
  const args: { [key: string]: any } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.substring(2);
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        args[key] = nextArg;
        i++; // Increment to skip the value
      } else {
        args[key] = true; // For flags like --verbose
      }
    }
  }

  const rawServerUrl = args['server'] || '';
  const cleanedServerUrl = rawServerUrl.trim().replace(/`/g, '');

  const config: MCPConfig = {
    serverUrl: cleanedServerUrl,
    authToken: args['token'],
    projectId: args['project-id'],
    timeout: parseInt(args['timeout'], 10) || 30000,
    verbose: args['verbose'] || false,
  };

  // Validate required fields
  if (!config.serverUrl || !config.authToken || !config.projectId) {
    throw new Error('Server URL, auth token, and project ID are required');
  }

  // Validate project ID format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(config.projectId)) {
    throw new Error('Project ID must be a valid UUID');
  }

  // Validate server URL format
  if (!isValidURL(config.serverUrl)) {
    throw new Error(
      `Invalid server URL format. Please ensure it is a valid HTTP/HTTPS URL. Received: "${rawServerUrl}"`
    );
  }

  // Validate token length
  if (config.authToken.length < MIN_TOKEN_LENGTH) {
    throw new Error(`Auth token must be at least ${MIN_TOKEN_LENGTH} characters long.`);
  }

  // Validate timeout (convert to seconds for validation)
  const timeoutSeconds = config.timeout / 1000;
  if (timeoutSeconds <= 0 || timeoutSeconds > 300) {
    throw new Error('Timeout must be between 1 and 300 seconds.');
  }

  return {
    serverUrl: config.serverUrl.replace(/\/$/, ''), // Remove trailing slash
    authToken: config.authToken,
    projectId: config.projectId,
    timeout: config.timeout,
    verbose: config.verbose
  };
}

export function validateConfig(config: AdapterConfig): void {
  if (!config.serverUrl || !config.authToken) {
    throw new Error('Invalid configuration: missing required fields');
  }

  if (!isValidURL(config.serverUrl)) {
    throw new Error('Invalid server URL format');
  }

  if (config.authToken.length < MIN_TOKEN_LENGTH) {
    throw new Error('Auth token too short');
  }

  if (config.timeout <= 0) {
    throw new Error('Invalid timeout value');
  }
}

// Utility function to redact sensitive information for logging
export function redactConfig(config: AdapterConfig): Partial<AdapterConfig> {
  return {
    serverUrl: config.serverUrl,
    authToken: config.authToken.substring(0, 8) + '***',
    timeout: config.timeout,
    verbose: config.verbose
  };
}