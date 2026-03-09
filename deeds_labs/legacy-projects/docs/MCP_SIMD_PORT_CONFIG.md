# MCP Server Configuration - SIMD Port Update

## Overview
This document explains how to configure the SIMD JSON Accelerator port for use with MCP servers (Context7 multi-core and FastMCP).

## Port Configuration

### Current Setup
- **SIMD JSON Accelerator Port:** 8096 (changed from 8095)
- **Service URL:** `http://localhost:8096`
- **Health Check:** `http://localhost:8096/health`
- **Parse Endpoint:** `http://localhost:8096/parse`

## MCP Server Integration

### Option 1: Context7 Multi-Core MCP Server
Update `mcp-multicore-config.json`:

```json
{
  "mcp": {
    "integration": {
      "endpoints": {
        "simd": "http://localhost:8096"
      }
    }
  }
}
```

### Option 2: FastMCP Legal AI Server
Update `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "legal-ai-tools": {
      "command": "uvx",
      "args": ["fastmcp", "run", "mcp/legal_ai_mcp_server.py"],
      "env": {
        "FASTMCP_LOG_LEVEL": "INFO",
        "SIMD_JSON_PORT": "8096",
        "SIMD_JSON_URL": "http://localhost:8096",
        "OLLAMA_HOST": "http://localhost:11434",
        "QDRANT_HOST": "http://localhost:6333",
        "NEO4J_URI": "bolt://localhost:7687"
      },
      "disabled": false,
      "autoApprove": [
        "search_legal_documents",
        "analyze_evidence",
        "get_case_status"
      ]
    }
  }
}
```

## Environment Variables

### For Windows (CMD)
```cmd
set SIMD_JSON_PORT=8096
set SIMD_JSON_URL=http://localhost:8096
```

### For Windows (PowerShell)
```powershell
$env:SIMD_JSON_PORT = "8096"
$env:SIMD_JSON_URL = "http://localhost:8096"
```

### For Linux/WSL
```bash
export SIMD_JSON_PORT=8096
export SIMD_JSON_URL=http://localhost:8096
```

## Starting the Service

### Via NPM Script (Recommended)
```bash
cd sveltekit-frontend
npm run simd:exe:start
```

### Via Batch File
```cmd
cd sveltekit-frontend
scripts\start-simd-service.bat
```

### With dev:quic
```bash
cd sveltekit-frontend
npm run dev:quic
```

## Verification

### Check Service Status
```bash
curl http://localhost:8096/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "simd-json-accelerator",
  "port": 8096,
  "optimized_parsing": true,
  "timestamp": 1701388597,
  "goroutines": 2,
  "go_version": "go1.21.0"
}
```

### Test Parse Endpoint
```bash
curl -X POST http://localhost:8096/parse \
  -H "Content-Type: application/json" \
  -d "{\"json\":\"{\\\"test\\\":true}\"}"
```

## Troubleshooting

### Port Already in Use
If port 8096 is also in use:

1. **Find the process:**
   ```cmd
   netstat -ano | findstr :8096
   ```

2. **Kill the process (if safe):**
   ```cmd
   taskkill /PID <process_id> /F
   ```

3. **Or change the port:**
   - Update `SIMD_JSON_PORT` in `.env.simd`
   - Update `scripts/start-simd-service.bat`
   - Update MCP configuration files

### Service Not Starting
1. Check if the executable exists:
   ```cmd
   dir go-services\simd-json-accelerator\simd-json-accelerator.exe
   ```

2. Check for errors in the console output

3. Verify environment variables are set:
   ```cmd
   echo %SIMD_JSON_PORT%
   ```

### MCP Server Not Connecting
1. Verify SIMD service is running:
   ```bash
   curl http://localhost:8096/health
   ```

2. Check MCP server logs for connection errors

3. Verify environment variables in MCP config

4. Restart MCP server after configuration changes

## Integration with Legal AI Tools

The SIMD JSON Accelerator is used by:
- **Legal AI MCP Server** - For fast JSON parsing of legal documents
- **Context7 Multi-Core** - For parallel document processing
- **FastMCP Server** - For optimized data serialization

## Performance Notes
- SIMD parsing provides ~3-5x faster JSON tokenization
- Optimized for large legal documents (100KB+)
- Uses Go's goroutines for concurrent processing
- Memory-efficient with minimal allocations

## Related Files
- `sveltekit-frontend/package.json` - NPM scripts
- `sveltekit-frontend/.env.simd` - Environment config
- `sveltekit-frontend/scripts/start-simd-service.bat` - Startup script
- `go-services/simd-json-accelerator/main.go` - Service implementation
- `.kiro/settings/mcp.json` - MCP server configuration
- `mcp-multicore-config.json` - Multi-core MCP config
