# 🚀 Quick Start: SIMD JSON Accelerator

## TL;DR
Port changed from **8095** → **8096** to fix conflicts.

## Start the Service

```bash
cd sveltekit-frontend
npm run simd:exe:start
```

## Start with dev:quic

```bash
cd sveltekit-frontend
npm run dev:quic
```

## Check Health

```bash
curl http://localhost:8096/health
```

## Configuration

### Environment Variables
```bash
SIMD_JSON_PORT=8096
SIMD_JSON_URL=http://localhost:8096
```

### Files
- `.env.simd` - Environment config
- `scripts/start-simd-service.bat` - Startup script
- `.kiro/settings/mcp.json` - MCP config
- `mcp-multicore-config.json` - Multi-core config

## Endpoints
- Health: `http://localhost:8096/health`
- Parse: `http://localhost:8096/parse`

## Troubleshooting

### Port in use?
```cmd
netstat -ano | findstr :8096
taskkill /PID <pid> /F
```

### Service not starting?
1. Check if exe exists: `dir go-services\simd-json-accelerator\simd-json-accelerator.exe`
2. Check environment: `echo %SIMD_JSON_PORT%`
3. Run manually: `scripts\start-simd-service.bat`

## Done! ✅
Your SIMD service is now configured on port 8096 and ready to use with both Context7 and FastMCP servers.
