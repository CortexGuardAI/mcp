import fs from 'fs';
import path from 'path';
import os from 'os';
import { MCPConfigFile, MCPProfile } from './types.js';

/**
 * Configuration file utilities for MCP adapter
 */
export class ConfigFileManager {
  private static readonly CONFIG_FILENAME = '.mcp.json';
  private static readonly GLOBAL_CONFIG_DIR = '.mcp';

  /**
   * Get the path to the global config file
   */
  static getGlobalConfigPath(): string {
    return path.join(os.homedir(), this.GLOBAL_CONFIG_DIR, this.CONFIG_FILENAME);
  }

  /**
   * Get the path to the project config file
   */
  static getProjectConfigPath(projectDir?: string): string {
    const baseDir = projectDir || process.cwd();
    return path.join(baseDir, this.CONFIG_FILENAME);
  }

  /**
   * Find project config file by searching up directory tree from multiple starting points
   */
  static findProjectConfig(startDir?: string): string | null {
    // Try multiple starting points to handle npx scenarios and IDE execution
    const searchDirs = [
      startDir,
      process.env.PWD,           // Original working directory (often set by shells)
      process.env.INIT_CWD,      // npm's initial working directory
      process.cwd()              // Current working directory (fallback)
    ].filter(Boolean) as string[];

    // Remove duplicates while preserving order
    const uniqueDirs = [...new Set(searchDirs)];

    for (const baseDir of uniqueDirs) {
      const result = this.searchUpFromDirectory(baseDir);
      if (result) {
        return result;
      }
    }
    
    // If all else fails, try to infer from the executable path
    // This handles cases where the server is run with absolute path
    if (process.argv[1]) {
      const executableDir = path.dirname(process.argv[1]);
      // If the executable is in a dist/ or build/ directory, go up one level
      const parentDir = executableDir.endsWith('/dist') || executableDir.endsWith('/build') 
        ? path.dirname(executableDir) 
        : executableDir;
      
      const result = this.searchUpFromDirectory(parentDir);
      if (result) {
        return result;
      }
    }
    
    return null;
  }

  /**
   * Search up directory tree from a specific starting directory
   */
  private static searchUpFromDirectory(startDir: string): string | null {
    let currentDir = startDir;
    
    // Search up the directory tree from this base
    while (currentDir !== path.dirname(currentDir)) {
      const configPath = path.join(currentDir, this.CONFIG_FILENAME);
      if (this.configExists(configPath)) {
        return configPath;
      }
      currentDir = path.dirname(currentDir);
    }
    
    // Check root directory
    const rootConfigPath = path.join(currentDir, this.CONFIG_FILENAME);
    if (this.configExists(rootConfigPath)) {
      return rootConfigPath;
    }
    
    return null;
  }

  /**
   * Check if a config file exists
   */
  static configExists(configPath: string): boolean {
    try {
      return fs.existsSync(configPath) && fs.statSync(configPath).isFile();
    } catch {
      return false;
    }
  }

  /**
   * Read and parse a config file
   */
  static readConfig(configPath: string): MCPConfigFile | null {
    try {
      if (!this.configExists(configPath)) {
        return null;
      }

      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content) as MCPConfigFile;
      
      // Validate basic structure
      if (typeof config !== 'object' || config === null) {
        throw new Error('Invalid config file format');
      }

      return config;
    } catch (error) {
      console.warn(`Warning: Failed to read config file ${configPath}: ${error}`);
      return null;
    }
  }

  /**
   * Write config to file
   */
  static writeConfig(configPath: string, config: MCPConfigFile): boolean {
    try {
      // Ensure directory exists
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write config with pretty formatting
      const content = JSON.stringify(config, null, 2);
      fs.writeFileSync(configPath, content, 'utf-8');
      
      return true;
    } catch (error) {
      console.error(`Failed to write config file ${configPath}: ${error}`);
      return false;
    }
  }

  /**
   * Get the effective profile from config
   */
  static getProfile(config: MCPConfigFile, profileName?: string): MCPProfile | null {
    if (!config) return null;

    // If specific profile requested
    if (profileName) {
      return config.profiles?.[profileName] || null;
    }

    // Use default profile if specified
    if (config.defaultProfile && config.profiles?.[config.defaultProfile]) {
      return config.profiles[config.defaultProfile];
    }

    // Return root-level config as profile
    if (config.authToken && config.projectId) {
      return {
        serverUrl: config.serverUrl,
        authToken: config.authToken,
        projectId: config.projectId,
        timeout: config.timeout,
        verbose: config.verbose
      };
    }

    return null;
  }

  /**
   * Create a sample config file
   */
  static createSampleConfig(): MCPConfigFile {
    return {
      serverUrl: 'https://cortex-context-mcp.vercel.app',
      timeout: 30000,
      verbose: false,
      profiles: {
        default: {
          authToken: 'your-auth-token-here',
          projectId: 'your-project-uuid-here',
          timeout: 30000,
          verbose: false
        }
      },
      defaultProfile: 'default'
    };
  }

  /**
   * Initialize config file interactively
   */
  static initializeConfig(configPath: string, profile: MCPProfile, profileName = 'default'): boolean {
    const config: MCPConfigFile = {
      serverUrl: profile.serverUrl || 'https://cortex-context-mcp.vercel.app',
      timeout: profile.timeout || 30000,
      verbose: profile.verbose || false,
      profiles: {
        [profileName]: profile
      },
      defaultProfile: profileName
    };

    return this.writeConfig(configPath, config);
  }
}

/**
 * Environment variable utilities
 */
export class EnvironmentManager {
  private static readonly ENV_PREFIX = 'MCP_';

  /**
   * Get configuration from environment variables
   */
  static getConfigFromEnv(): Partial<MCPProfile> {
    return {
      serverUrl: process.env[`${this.ENV_PREFIX}SERVER_URL`],
      authToken: process.env[`${this.ENV_PREFIX}TOKEN`],
      projectId: process.env[`${this.ENV_PREFIX}PROJECT_ID`],
      timeout: process.env[`${this.ENV_PREFIX}TIMEOUT`] ? 
        parseInt(process.env[`${this.ENV_PREFIX}TIMEOUT`]!, 10) : undefined,
      verbose: process.env[`${this.ENV_PREFIX}VERBOSE`] === 'true'
    };
  }

  /**
   * Check if required environment variables are set
   */
  static hasRequiredEnvVars(): boolean {
    return !!(process.env[`${this.ENV_PREFIX}TOKEN`] && 
              process.env[`${this.ENV_PREFIX}PROJECT_ID`]);
  }

  /**
   * Get list of available MCP environment variables
   */
  static getAvailableEnvVars(): Record<string, string | undefined> {
    const envVars: Record<string, string | undefined> = {};
    
    Object.keys(process.env).forEach(key => {
      if (key.startsWith(this.ENV_PREFIX)) {
        envVars[key] = process.env[key];
      }
    });

    return envVars;
  }
}