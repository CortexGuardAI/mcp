# MCP Configuration System

The MCP tool now supports flexible configuration through multiple methods while maintaining full backward compatibility with existing flag-based usage.

## Configuration Methods (in order of precedence)

1. **Command Line Flags** (highest priority)
2. **Environment Variables**
3. **Project Configuration File** (`.mcp.json` in current directory)
4. **Global Configuration File** (`~/.mcp.json`)
5. **Interactive Prompts** (fallback for missing required values)

## Quick Start

### Traditional Usage (Backward Compatible)
```bash
# Still works exactly as before
mcp --token YOUR_TOKEN --project-id YOUR_PROJECT_ID
```

### Environment Variables
```bash
export MCP_TOKEN="your-auth-token"
export MCP_PROJECT_ID="12345678-1234-5678-9abc-123456789012"
export MCP_SERVER_URL="https://your-server.com"
mcp
```

### Interactive Setup
```bash
# Initialize configuration interactively
mcp --init
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MCP_TOKEN` | Authentication token | `your-auth-token-here` |
| `MCP_PROJECT_ID` | Project UUID | `12345678-1234-5678-9abc-123456789012` |
| `MCP_SERVER_URL` | Server URL | `https://cortex-context-mcp.vercel.app` |
| `MCP_TIMEOUT` | Request timeout (ms) | `30000` |
| `MCP_VERBOSE` | Enable verbose logging | `true` or `false` |

## Configuration Files

### File Locations
- **Global**: `~/.mcp.json` (user-wide settings)
- **Project**: `./.mcp.json` (project-specific settings)
- **Custom**: Use `--config path/to/config.json`

### File Format
```json
{
  "profiles": {
    "default": {
      "authToken": "your-auth-token",
      "projectId": "12345678-1234-5678-9abc-123456789012",
      "serverUrl": "https://cortex-context-mcp.vercel.app",
      "timeout": 30000,
      "verbose": false
    },
    "production": {
      "authToken": "prod-token",
      "projectId": "prod-project-id",
      "serverUrl": "https://prod-server.com"
    },
    "development": {
      "authToken": "dev-token",
      "projectId": "dev-project-id",
      "serverUrl": "https://dev-server.com"
    }
  }
}
```

## Command Line Options

```bash
Options:
  -t, --token       Authentication token
  -p, --project-id  Project ID (UUID)
  -s, --server-url  Server URL
      --profile     Configuration profile to use
  -c, --config      Path to configuration file
      --timeout     Request timeout in milliseconds (default: 30000)
      --verbose     Enable verbose logging (default: false)
      --init        Initialize configuration interactively
  -h, --help        Show help
```

## Usage Examples

### Using Profiles
```bash
# Use a specific profile
mcp --profile production

# Use profile with environment override
MCP_TOKEN=override-token mcp --profile development
```

### Mixed Configuration
```bash
# Use config file but override project ID
mcp --config ./my-config.json --project-id different-project-id
```

### Debugging Configuration
```bash
# See where each setting comes from
mcp --verbose
```

Output shows configuration sources:
```
🔧 Configuration loaded successfully
Configuration sources:
  Server URL: env
  Auth Token: flag
  Project ID: project-config
  Timeout: default
  Verbose: flag
```

## Configuration Precedence Examples

Given this setup:
- Global config: `authToken: "global-token"`
- Environment: `MCP_TOKEN="env-token"`
- Command line: `--token flag-token`

The final token will be `"flag-token"` (command line wins).

## Interactive Setup

Run `mcp --init` to set up configuration interactively:

```bash
$ mcp --init
🚀 MCP Configuration Setup
==========================

Enter your authentication token: your-token-here
Enter your project ID (UUID): 12345678-1234-5678-9abc-123456789012
Enter server URL (default: https://cortex-context-mcp.vercel.app): 
Profile name (default: default): 
Save as (g)lobal or (p)roject config? [g/p]: g

✅ Configuration saved to: /Users/username/.mcp.json
Profile: default
```

## Migration from Flag-Only Usage

No changes required! Your existing scripts will continue to work:

```bash
# This still works exactly as before
mcp --token YOUR_TOKEN --project-id YOUR_PROJECT_ID
```

To migrate to the new system:

1. **Environment Variables** (recommended for CI/CD):
   ```bash
   export MCP_TOKEN="your-token"
   export MCP_PROJECT_ID="your-project-id"
   ```

2. **Configuration File** (recommended for development):
   ```bash
   mcp --init  # Set up once
   mcp         # Use forever
   ```

## Security Best Practices

1. **Never commit tokens to version control**
2. **Use environment variables in CI/CD**
3. **Use project configs for non-sensitive settings**
4. **Use global configs for personal development**

### .gitignore Recommendations
```gitignore
# MCP configuration files (may contain sensitive tokens)
.mcp.json
```

## IDE Integration

The MCP server includes enhanced compatibility for IDE environments where the working directory context may differ from the project directory.

### IDE Configuration Discovery

When running as an MCP server in IDEs (like Claude Desktop, Cursor, etc.), the server uses multiple strategies to locate configuration files:

1. **Environment Variables**: `PWD`, `INIT_CWD` (npm's initial working directory)
2. **Current Working Directory**: `process.cwd()`
3. **Executable Path Inference**: If the server is run from a `dist/` or `build/` directory, it searches the parent directory
4. **Directory Tree Traversal**: Searches up the directory tree from each starting point

### Example IDE Configuration

For Claude Desktop or similar IDEs, use this configuration:

```json
{
  "mcpServers": {
    "cortex-context": {
      "command": "node",
      "args": ["/absolute/path/to/your/mcp/dist/index.js"],
      "env": {
        "MCP_SERVER_MODE": "1"
      }
    }
  }
}
```

The server will automatically locate your `.mcp.json` file even when:
- The IDE runs the server from a different working directory
- The `PWD` environment variable is not set
- The server executable is in a `dist/` subdirectory

### IDE Troubleshooting

If the server can't find your configuration in an IDE:

1. **Verify config file location**: Ensure `.mcp.json` exists in your project root
2. **Use absolute paths**: Use the full path to the server executable in IDE config
3. **Enable verbose logging**: Add `--verbose` to the args array to see configuration search paths
4. **Check environment**: The server automatically detects IDE mode via `MCP_SERVER_MODE=1` or TTY detection

## Troubleshooting

### Missing Configuration
If required values are missing, MCP will prompt interactively:
```bash
Missing required configuration. Please provide the following:
Enter your authentication token: 
```

### Invalid Configuration
Common validation errors:
- `Project ID must be a valid UUID`
- `Auth token must be at least 10 characters long`
- `Invalid server URL format`

### Debug Configuration Loading
Use `--verbose` to see exactly where each setting comes from:
```bash
mcp --verbose
```

This shows the source of each configuration value (flag, env, config file, etc.).