@echo off
set MCP_PORT=3002
set CONTEXT7_GPU_ENABLED=true
set CONTEXT7_MULTICORE=true
set NODE_OPTIONS=--max-old-space-size=4096
npm.cmd run mcp:stdio
