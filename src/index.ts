#!/usr/bin/env node
import { createMCPServer } from './server.js';
import { parseConfig } from './config.js';
import { Logger, ErrorUtils } from './utils.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { pathToFileURL, fileURLToPath } from 'url';

const version = '1.0.0';
const logger = new Logger();

async function main() {
  try {
    logger.info('Starting mcp-adapter...');
    logger.info(`Arguments: ${process.argv.join(' ')}`);

    const config = parseConfig(process.argv);
    logger.info(`Parsed configuration: ${JSON.stringify(config, null, 2)}`);

    const server = createMCPServer(config, logger);

    logger.info('Starting MCP server...');
    await server.start();
    logger.info('MCP server started successfully.');
  } catch (error) {
    logger.error(`Failed to start mcp-adapter: ${error}`);
    // process.exit(1);
  }
}

main();

// Handle unhandled promise rejections at the top level
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason: ErrorUtils.getErrorMessage(reason) });
});

// Handle uncaught exceptions at the top level
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', ErrorUtils.getErrorMessage(error));
  if (logger.verbose) {
    logger.error('Full error details:', ErrorUtils.sanitizeError(error));
  }
});

// Start the application
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
    logger.error('Fatal error in main:', ErrorUtils.getErrorMessage(error));
    if (logger.verbose) {
      logger.error('Full error details:', ErrorUtils.sanitizeError(error));
    }
    process.exit(1);
  });
}

export { main };