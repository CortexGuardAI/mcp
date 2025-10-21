#!/usr/bin/env node
import { createMCPServer } from './server.js';
import { parseConfig, displayConfigSources } from './config.js';
import { Logger, ErrorUtils } from './utils.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { pathToFileURL, fileURLToPath } from 'url';

const version = '1.0.0';

async function main() {
  try {
    const { config, sources } = await parseConfig(process.argv);
    
    // Create logger with silent mode when running as MCP server
    const logger = new Logger(config.verbose, true);
    
    // Only show configuration info if explicitly verbose and not running as MCP server
    if (config.verbose && process.argv.includes('--verbose')) {
      console.log('🔧 Configuration loaded successfully');
      displayConfigSources(sources);
      console.log('');
    }

    const server = createMCPServer(config, logger);

    await server.start();
  } catch (error) {
    console.error('❌ Failed to start MCP server:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

// Handle unhandled promise rejections at the top level
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions at the top level
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Check if this file is being run directly
const isDirectRun = (() => {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return false;
    const thisUrl = new URL(import.meta.url);
    const argvUrl = pathToFileURL(argv1);
    // Compare normalized hrefs and also fallback to path comparison
    return thisUrl.href === argvUrl.href || fileURLToPath(thisUrl) === argv1;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().catch((error) => {
    const errorLogger = new Logger(false, false);
    errorLogger.error('Fatal error in main:', ErrorUtils.getErrorMessage(error));
    errorLogger.error('Full error details:', ErrorUtils.sanitizeError(error));
    process.exit(1);
  });
}

export { main };