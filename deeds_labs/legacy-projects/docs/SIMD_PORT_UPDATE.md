# SIMD JSON Accelerator Port Update

## Summary
Changed SIMD JSON Accelerator service port from **8095** to **8096** to avoid port conflicts.

## Changes Made

### 1. Port Configuration
- **Old Port:** 8095
- **New Port:** 8096
- **Environment Variable:** `SIMD_JSON_PORT=8096`

### 2. Updated Files
- `sveltekit-frontend/package.json` - Updated npm scripts
- `sveltekit-frontend/.env.simd` - New environment config file
- `sveltekit-frontend/scripts/start-simd-service.bat` - New startup script

### 3. NPM Scripts Updated
```json
{
  "simd:exe:start": "cmd /c scripts\\start-simd-service.bat",
  "dev:quic": "npm run simd:exe:start && concurrently ..."
}
```

### 4. Service Endpoints
- **Health Check:** `http://localhost:8096/health`
- **Parse Endpoint:** `http://localhost:8096/parse`

## Usage

### Start SIMD Service Manually
```bash
cd sveltekit-frontend
npm run simd:exe:start
```

### Start with dev:quic
```bash
cd sveltekit-frontend
npm run dev:quic
```

### Environment Variable
The service reads the port from `SIMD_JSON_PORT` environment variable:
```bash
set SIMD_JSON_PORT=8096
```

## Port Conflict Resolution
If port 8096 is also in use, you can change it by:
1. Update `SIMD_JSON_PORT` in `.env.simd`
2. Update the port in `scripts/start-simd-service.bat`
3. Restart the service

## Testing
```bash
# Check if service is running
curl http://localhost:8096/health

# Test parse endpoint
curl -X POST http://localhost:8096/parse -H "Content-Type: application/json" -d "{\"json\":\"{\\\"test\\\":true}\"}"
```

## Notes
- Port 8095 was already in use by another process (PID 13792)
- The Go service supports dynamic port configuration via environment variable
- All references to port 8095 in the codebase should be updated to 8096 or use the environment variable

## Next Steps
If you need to update other services that reference port 8095:
1. Search for `8095` in the codebase
2. Update to use `process.env.SIMD_JSON_PORT || 8096`
3. Update any hardcoded URLs to use the new port
