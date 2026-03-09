# 📚 SIMD JSON Accelerator Documentation Index

## Quick Access

### 🚀 Getting Started
- [Quick Start Guide](./QUICK_START_SIMD.md) - Start in 30 seconds

### 🔧 Configuration
- [Port Update Details](./SIMD_PORT_UPDATE.md) - Port change from 8095 to 8096
- [MCP Integration Guide](./MCP_SIMD_PORT_CONFIG.md) - Context7 & FastMCP setup

### 📖 Complete Documentation
- [Fix Complete](./SIMD_PORT_FIX_COMPLETE.md) - Full implementation details
- [Final Report](./SIMD_PORT_FIX_FINAL.md) - Comprehensive final report

### 📊 Summary
- [Fix Summary](../SIMD_PORT_FIX_SUMMARY.md) - Overview of all changes

### 🧪 Testing
- [Test Script](../test-simd-port-config.bat) - Verify configuration

## Key Information

**Port:** 8096
**Service:** SIMD JSON Accelerator
**Health:** http://localhost:8096/health
**Parse:** http://localhost:8096/parse

## Quick Commands

```bash
# Start service
npm run simd:exe:start

# Start with dev:quic
npm run dev:quic

# Check health
curl http://localhost:8096/health
```
