# Cortex Context MCP Adapter

MCP (Model Context Protocol) adapter for Cortex Context integration.

## Getting Started

To use this adapter, you need to be a registered user. Please visit our landing page to sign up and get your credentials:

[https://mcp.cortexguardai.com/](https://mcp.cortexguardai.com/)

## Installation

```bash
pnpm install @cortexguardai/mcp
```

## Important: How MCP Adapters Work

**The MCP adapter communicates via stdin/stdout using the MCP protocol.** When you run it directly from the command line, it will appear to "hang" - this is **normal behavior**. The adapter is waiting for MCP protocol messages from a compatible client.

## Usage

### With Claude Desktop (Recommended)

1. Configure your `mcp.json` file:
```json
{
  "mcpServers": {
    "cortex-context": {
      "command": "pnpm",
      "args": [
        "dlx",
        "@cortexguardai/mcp@latest",
        "--token", "your-auth-token",
        "--project-id", "your-project-id"
      ]
    }
  }
}
```

2. Restart Claude Desktop
3. The adapter will be available as a context source

### Direct Command Line (for testing only)

```bash
pnpm dlx @cortexguardai/mcp --token <auth-token> --project-id <project-id>
```

**Note:** When run directly, the adapter will start and then wait for MCP messages. This is expected behavior, not an error.

### Testing the Adapter

To verify the adapter is working correctly, you can use the test client:

```bash
# From the project root
node test-mcp-client.js
```

This will spawn the adapter, send an MCP initialize request, and confirm it responds correctly.

## Configuration Options

- `--token, -t`: Authentication token (required) 
- `--project-id, -p`: Project ID to scope the adapter to (required)
- `--timeout`: Request timeout in milliseconds (default: 30000)
- `--verbose, -v`: Enable verbose logging (default: false)

## Troubleshooting

### "The adapter appears to hang"

This is normal! The MCP adapter uses stdin/stdout communication and waits for MCP protocol messages. It only responds when a compatible MCP client (like Claude Desktop) sends requests.

### Schema Validation Errors

If you encounter `invalid_literal` errors expecting "object" in tool inputSchema:
- This was fixed in version 1.0.5+ by using explicit string literals in JSON Schema definitions
- Ensure you're using the latest version: `pnpm add -g @cortexguardai/mcp@latest`
- Rebuild the adapter if developing locally: `pnpm run build`

### Testing connectivity

You can test if your server is accessible:

```bash
curl -I "https://cortex-context-mcp.vercel.app/api/mcp"
```

Should return a 401 (authentication required) response, confirming the endpoint exists.

## Development

```bash
# Build the adapter
pnpm run build

# Run in development mode
pnpm run dev
```