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
const SERVER_URL = 'https://cortex-context-mcp.vercel.app';

export function parseConfig(argv: string[]): MCPConfig {
  const yargsResult = yargs(hideBin(argv))
    .option('token', {
      alias: 't',
      type: 'string',
      description: 'Authentication token',
    })
    .option('project-id', {
      alias: 'p',
      type: 'string',
      description: 'Project ID (UUID)',
    })
    .option('timeout', {
      type: 'number',
      default: 30000,
      description: 'Request timeout in milliseconds',
    })
    .option('verbose', {
      type: 'boolean',
      default: false,
      description: 'Enable verbose logging',
    })
    .demandOption(['token', 'project-id'])
    .help()
    .alias('help', 'h')
    .parseSync();

  const config: MCPConfig = {
    serverUrl: SERVER_URL,
    authToken: yargsResult.token,
    projectId: yargsResult['project-id'],
    timeout: yargsResult.timeout,
    verbose: yargsResult.verbose,
  };

  // Validate project ID format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(config.projectId)) {
    throw new Error('Project ID must be a valid UUID');
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
    serverUrl: config.serverUrl,
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