# Cortex Context MCP Adapter

MCP (Model Context Protocol) adapter for Cortex Context integration.

## Getting Started

To use this adapter, you need to be a registered user. Please visit our landing page to sign up and get your credentials:

[https://mcp.cortexguardai.com/](https://mcp.cortexguardai.com/)

## Installation

You can use either `pnpm` or `npm`.

**pnpm:**
```bash
pnpm install @cortexguardai/mcp
```

**npm:**
```bash
npm install @cortexguardai/mcp
```

## Important: How MCP Adapters Work

**The MCP adapter communicates via stdin/stdout using the MCP protocol.** When you run it directly from the command line, it will appear to "hang" - this is **normal behavior**. The adapter is waiting for MCP protocol messages from a compatible client.

## Usage

### With Claude Desktop (Recommended)

1. Configure your `mcp.json` file.

**For pnpm users:**
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

**For npm/npx users:**
```json
{
  "mcpServers": {
    "cortex-context": {
      "command": "npx",
      "args": [
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

**pnpm:**
```bash
pnpm dlx @cortexguardai/mcp --token <auth-token> --project-id <project-id>
```

**npx:**
```bash
npx @cortexguardai/mcp --token <auth-token> --project-id <project-id>
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
- Ensure you're using the latest version:
  - `pnpm add -g @cortexguardai/mcp@latest`
  - `npm install -g @cortexguardai/mcp@latest`
- Rebuild the adapter if developing locally:
  - `pnpm run build`
  - `npm run build`

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
# or
npm run build

# Run in development mode
pnpm run dev
# or
npm run dev
```

## Context-First Workflow and Tool Selection

To improve tool selection and make decisions more direct, this adapter exposes tools with prompt-like descriptions that guide models toward a consistent workflow:

- get_contexts
  - Selection hint: Start here.
  - Purpose: Check availability and fetch all context files for the current project.
  - Behavior: Returns a JSON list of context files. If empty, proceed to `generate_initial_context`.

- get_file
  - Purpose: Read the contents of a specific context file by its UUID.
  - Usage: Call after `get_contexts` when you know which file aligns with the current task.

- add_file
  - Purpose: Add a new context file when you already have prepared content.
  - Hint: Prefer `generate_initial_context` for the first project file. Provide filename, content, and optional logical type.

- generate_initial_context
  - Selection hint: Use when `get_contexts` returns no files.
  - Purpose: Create the first context file with a concise project overview (codebase structure, key modules, workflows).
  - Inputs: `content` (required), optional `filename` (defaults to `project-context.md`), optional `file_type`.

### Recommended Decision Flow

- Check contexts: call `get_contexts` first.
- If contexts exist: pick the relevant file and call `get_file`.
- If no contexts exist: synthesize a brief overview from the codebase and call `generate_initial_context`.
- When adding additional files: call `add_file` with the prepared content.

These descriptions act like lightweight prompts to help models prioritize and focus the use of MCP tools appropriately.