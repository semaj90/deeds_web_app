# MCP Playwright Auditor

A Model Context Protocol (MCP) server that uses Playwright to audit SvelteKit applications for performance, accessibility, and dead links.

## Features

- **Route Discovery**: Automatically crawls and discovers all routes in your SvelteKit application
- **Performance Auditing**: Measures page load times and identifies slow routes
- **Accessibility Checks**: Basic accessibility auditing (alt text, headings, lang attributes)
- **Dead Link Detection**: Identifies broken links on pages
- **Real-time Monitoring**: WebSocket server for live audit updates
- **MCP Integration**: Exposes auditing capabilities through the Model Context Protocol

## Installation

```bash
npm install
```

## Usage

### As an MCP Server

```bash
npm run mcp
```

### As a Standalone Server

```bash
npm run server
```

### API Endpoints

- `GET /health` - Health check
- `GET /latest-audit` - Get the most recent audit results
- `POST /audit` - Run a full audit
- `WebSocket ws://localhost:8081` - Real-time audit updates

### MCP Tools

The server exposes the following MCP tools:

#### `audit_sveltekit_routes`
Runs a comprehensive audit of all discovered routes.

**Parameters:**
- `baseUrl` (optional): Base URL of the SvelteKit application (default: http://localhost:5173)

#### `crawl_routes`
Discovers all routes in the application.

**Parameters:**
- `baseUrl` (optional): Base URL of the SvelteKit application (default: http://localhost:5173)

#### `check_route_health`
Audits a specific route.

**Parameters:**
- `route` (required): Route path to check
- `baseUrl` (optional): Base URL of the SvelteKit application (default: http://localhost:5173)

## Configuration

The auditor is configured to work with SvelteKit applications running on `http://localhost:5173` by default. You can modify the base URL in the source code or through the MCP tool parameters.

## Audit Results

Audit results include:

- **Route Information**: Path, title, HTTP status, load time
- **Error Detection**: JavaScript console errors
- **Accessibility Issues**: Missing alt text, heading hierarchy problems, missing lang attributes
- **Dead Links**: Broken links found on pages
- **Summary Statistics**: Average load time, total errors, accessibility score

## Integration with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "playwright-auditor": {
      "command": "node",
      "args": ["path/to/mcp-playwright-auditor/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Development

```bash
# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Format code
npm run format
```

## Dependencies

- **@modelcontextprotocol/sdk**: MCP server implementation
- **playwright**: Browser automation for auditing
- **express**: HTTP server for API endpoints
- **ws**: WebSocket server for real-time updates
- **axios**: HTTP client for link checking
- **cheerio**: HTML parsing utilities

## Browser Configuration

The auditor runs in headless Chromium with the following configuration:
- Viewport: 1280x720
- User Agent: MCP-Playwright-Auditor/1.0
- Sandbox disabled for container compatibility

## Error Handling

The auditor includes comprehensive error handling:
- Network timeouts (30s for page loads, 5s for link checks)
- Invalid URLs are skipped
- Browser crashes are handled gracefully
- Partial results are returned even if some routes fail

## Performance Considerations

- Routes are audited sequentially to avoid overwhelming the application
- Link checking is limited to the first 10 links per page
- Browser contexts are reused across audits
- Automatic cleanup of browser instances on shutdown