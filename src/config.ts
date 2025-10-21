import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { AdapterConfig, MCPConfigFile, MCPProfile, ConfigSource } from './types.js';
import { ConfigFileManager, EnvironmentManager } from './config-utils.js';
import readline from 'readline';

export interface MCPConfig {
  serverUrl: string;
  authToken: string;
  projectId: string;
  timeout: number;
  verbose: boolean;
}

export interface ConfigResult {
  config: MCPConfig;
  sources: ConfigSource;
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
const DEFAULT_SERVER_URL = 'https://cortex-context-mcp.vercel.app';
const DEFAULT_TIMEOUT = 30000;

/**
 * Interactive prompt for missing configuration
 */
async function promptForConfig(missing: string[]): Promise<Partial<MCPProfile>> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  };

  const config: Partial<MCPProfile> = {};

  try {
    if (missing.includes('authToken')) {
      config.authToken = await prompt('Enter your authentication token: ');
    }

    if (missing.includes('projectId')) {
      config.projectId = await prompt('Enter your project ID (UUID): ');
    }

    if (missing.includes('serverUrl')) {
      const url = await prompt(`Enter server URL (default: ${DEFAULT_SERVER_URL}): `);
      config.serverUrl = url.trim() || DEFAULT_SERVER_URL;
    }
  } finally {
    rl.close();
  }

  return config;
}

/**
 * Parse configuration with flexible precedence hierarchy
 */
export async function parseConfig(argv: string[]): Promise<ConfigResult> {
  // Initialize sources tracking
  const sources: ConfigSource = {
    serverUrl: 'default',
    authToken: 'interactive',
    projectId: 'interactive',
    timeout: 'default',
    verbose: 'default'
  };

  // Parse command line arguments (but don't require them)
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
    .option('server-url', {
      alias: 's',
      type: 'string',
      description: 'Server URL',
    })
    .option('profile', {
      type: 'string',
      description: 'Configuration profile to use',
    })
    .option('config', {
      alias: 'c',
      type: 'string',
      description: 'Path to configuration file',
    })
    .option('timeout', {
      type: 'number',
      default: DEFAULT_TIMEOUT,
      description: 'Request timeout in milliseconds',
    })
    .option('verbose', {
      type: 'boolean',
      default: false,
      description: 'Enable verbose logging',
    })
    .option('init', {
      type: 'boolean',
      default: false,
      description: 'Initialize configuration interactively',
    })
    .help()
    .alias('help', 'h')
    .parseSync();

  // Handle initialization mode
  if (yargsResult.init) {
    await initializeConfiguration();
    process.exit(0);
  }

  // Start with defaults
  let config: Partial<MCPProfile> = {
    serverUrl: DEFAULT_SERVER_URL,
    timeout: DEFAULT_TIMEOUT,
    verbose: false
  };

  // 1. Load global config file
  const globalConfigPath = ConfigFileManager.getGlobalConfigPath();
  const globalConfig = ConfigFileManager.readConfig(globalConfigPath);
  if (globalConfig) {
    const profile = ConfigFileManager.getProfile(globalConfig, yargsResult.profile);
    if (profile) {
      if (profile.serverUrl) { config.serverUrl = profile.serverUrl; sources.serverUrl = 'global-config'; }
      if (profile.authToken) { config.authToken = profile.authToken; sources.authToken = 'global-config'; }
      if (profile.projectId) { config.projectId = profile.projectId; sources.projectId = 'global-config'; }
      if (profile.timeout !== undefined) { config.timeout = profile.timeout; sources.timeout = 'global-config'; }
      if (profile.verbose !== undefined) { config.verbose = profile.verbose; sources.verbose = 'global-config'; }
    }
  }

  // 2. Load project config file (search up directory tree if not explicitly specified)
  let projectConfigPath: string | null = null;
  
  if (yargsResult.config) {
    // Use explicitly specified config file
    projectConfigPath = yargsResult.config;
  } else {
    // Search for .mcp.json up the directory tree
    projectConfigPath = ConfigFileManager.findProjectConfig();
    if (!projectConfigPath) {
      // Fallback to current directory
      projectConfigPath = ConfigFileManager.getProjectConfigPath();
    }
  }
  
  const projectConfig = ConfigFileManager.readConfig(projectConfigPath);
  if (projectConfig) {
    const profile = ConfigFileManager.getProfile(projectConfig, yargsResult.profile);
    if (profile) {
      if (profile.serverUrl) { config.serverUrl = profile.serverUrl; sources.serverUrl = 'project-config'; }
      if (profile.authToken) { config.authToken = profile.authToken; sources.authToken = 'project-config'; }
      if (profile.projectId) { config.projectId = profile.projectId; sources.projectId = 'project-config'; }
      if (profile.timeout !== undefined) { config.timeout = profile.timeout; sources.timeout = 'project-config'; }
      if (profile.verbose !== undefined) { config.verbose = profile.verbose; sources.verbose = 'project-config'; }
    }
  }

  // 3. Apply environment variables
  const envConfig = EnvironmentManager.getConfigFromEnv();
  if (envConfig.serverUrl) { config.serverUrl = envConfig.serverUrl; sources.serverUrl = 'env'; }
  if (envConfig.authToken) { config.authToken = envConfig.authToken; sources.authToken = 'env'; }
  if (envConfig.projectId) { config.projectId = envConfig.projectId; sources.projectId = 'env'; }
  if (envConfig.timeout !== undefined) { config.timeout = envConfig.timeout; sources.timeout = 'env'; }
  if (envConfig.verbose !== undefined) { config.verbose = envConfig.verbose; sources.verbose = 'env'; }

  // 4. Apply command line flags (highest priority)
  if (yargsResult['server-url']) { config.serverUrl = yargsResult['server-url']; sources.serverUrl = 'flag'; }
  if (yargsResult.token) { config.authToken = yargsResult.token; sources.authToken = 'flag'; }
  if (yargsResult['project-id']) { config.projectId = yargsResult['project-id']; sources.projectId = 'flag'; }
  if (yargsResult.timeout !== DEFAULT_TIMEOUT) { config.timeout = yargsResult.timeout; sources.timeout = 'flag'; }
  if (yargsResult.verbose !== false) { config.verbose = yargsResult.verbose; sources.verbose = 'flag'; }

  // 5. Interactive prompts for missing required fields (only if running interactively)
  const missing: string[] = [];
  if (!config.authToken) missing.push('authToken');
  if (!config.projectId) missing.push('projectId');

  // Detect if we're running as an MCP server:
  // 1. Explicit MCP_SERVER_MODE environment variable
  // 2. stdin is not a TTY (typical for MCP servers)
  // 3. No command line arguments (MCP servers typically don't use CLI args)
  const isMCPServer = process.env.MCP_SERVER_MODE === '1' || 
                      !process.stdin.isTTY || 
                      (process.argv.length <= 2 && !process.argv.includes('--verbose'));
  
  if (missing.length > 0 && !isMCPServer) {
    console.log('Missing required configuration. Please provide the following:');
    const interactiveConfig = await promptForConfig(missing);
    
    if (interactiveConfig.authToken) { config.authToken = interactiveConfig.authToken; sources.authToken = 'interactive'; }
    if (interactiveConfig.projectId) { config.projectId = interactiveConfig.projectId; sources.projectId = 'interactive'; }
    if (interactiveConfig.serverUrl) { config.serverUrl = interactiveConfig.serverUrl; sources.serverUrl = 'interactive'; }
  } else if (missing.length > 0) {
    // If running as MCP server and missing config, throw an error instead of prompting
    throw new Error(`Missing required configuration: ${missing.join(', ')}. Please ensure your .mcp.json file contains all required fields.`);
  }

  // Final validation
  const finalConfig: MCPConfig = {
    serverUrl: config.serverUrl!,
    authToken: config.authToken!,
    projectId: config.projectId!,
    timeout: config.timeout!,
    verbose: config.verbose!
  };

  validateConfig(finalConfig);

  return { config: finalConfig, sources };
}

/**
 * Initialize configuration interactively
 */
async function initializeConfiguration(): Promise<void> {
  console.log('🚀 MCP Configuration Setup');
  console.log('==========================\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  };

  try {
    const authToken = await prompt('Enter your authentication token: ');
    const projectId = await prompt('Enter your project ID (UUID): ');
    const serverUrl = await prompt(`Enter server URL (default: ${DEFAULT_SERVER_URL}): `);
    const profileName = await prompt('Profile name (default: default): ');
    const configType = await prompt('Save as (g)lobal or (p)roject config? [g/p]: ');

    const profile: MCPProfile = {
      authToken: authToken.trim(),
      projectId: projectId.trim(),
      serverUrl: serverUrl.trim() || DEFAULT_SERVER_URL,
      timeout: DEFAULT_TIMEOUT,
      verbose: false
    };

    const name = profileName.trim() || 'default';
    const isGlobal = configType.toLowerCase().startsWith('g');
    const configPath = isGlobal ? 
      ConfigFileManager.getGlobalConfigPath() : 
      ConfigFileManager.getProjectConfigPath();

    const success = ConfigFileManager.initializeConfig(configPath, profile, name);
    
    if (success) {
      console.log(`\n✅ Configuration saved to: ${configPath}`);
      console.log(`Profile: ${name}`);
    } else {
      console.log('\n❌ Failed to save configuration');
    }
  } finally {
    rl.close();
  }
}

/**
 * Validate configuration
 */
export function validateConfig(config: AdapterConfig): void {
  if (!config.serverUrl || !config.authToken || !config.projectId) {
    throw new Error('Invalid configuration: missing required fields (serverUrl, authToken, projectId)');
  }

  if (!isValidURL(config.serverUrl)) {
    throw new Error('Invalid server URL format');
  }

  if (config.authToken.length < MIN_TOKEN_LENGTH) {
    throw new Error(`Auth token must be at least ${MIN_TOKEN_LENGTH} characters long`);
  }

  // Validate project ID format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(config.projectId)) {
    throw new Error('Project ID must be a valid UUID');
  }

  if (config.timeout <= 0 || config.timeout > 300000) {
    throw new Error('Timeout must be between 1 and 300000 milliseconds');
  }
}

/**
 * Utility function to redact sensitive information for logging
 */
export function redactConfig(config: AdapterConfig): Partial<AdapterConfig> {
  return {
    serverUrl: config.serverUrl,
    authToken: config.authToken.substring(0, 8) + '***',
    projectId: config.projectId.substring(0, 8) + '***',
    timeout: config.timeout,
    verbose: config.verbose
  };
}

/**
 * Display configuration sources for debugging
 */
export function displayConfigSources(sources: ConfigSource): void {
  console.log('Configuration sources:');
  console.log(`  Server URL: ${sources.serverUrl}`);
  console.log(`  Auth Token: ${sources.authToken}`);
  console.log(`  Project ID: ${sources.projectId}`);
  console.log(`  Timeout: ${sources.timeout}`);
  console.log(`  Verbose: ${sources.verbose}`);
}