# Demo Route HTML Export Structure

This directory contains organized HTML export folders for all demo, test, and showcase routes found in the SvelteKit application.

## Directory Structure

### Main Demos (`/main-demos/`)
Primary demonstration routes showing key application features:
- `agent-demo/` - AI agent demonstration interface
- `ai-test/` - AI functionality testing interface
- `demo-enhanced-bits-showcase/` - Enhanced bits-ui component showcase
- `mcp-demo/` - MCP (Model Context Protocol) demonstration

### Development Demos (`/dev-demos/`)
Development and experimental feature demonstrations:
- `cache-demo/` - Caching system demonstration
- `context7-test/` - Context7 integration testing
- `dynamic-routing-test/` - Dynamic routing features
- `pgvector-test/` - PostgreSQL vector database testing
- `self-prompting-demo/` - Self-prompting AI demonstration
- `tensor-demo/` - Tensor operations demonstration
- `vector-search-demo/` - Vector search functionality
- `vite-error-demo/` - Vite error handling demonstration
- `webgl-fallback-test/` - WebGL fallback testing

### Test Routes (`/test-routes/`)
Testing and validation interfaces:
- `simple-test/` - Basic functionality testing
- `simple-upload-test/` - File upload testing
- `test-grey-balance/` - UI color balance testing
- `upload-test/` - Advanced upload testing
- `webgpu-test/` - WebGPU functionality testing
- `authenticated-crud-test/` - Authentication and CRUD testing

### Showcase Routes (`/showcase-routes/`)
UI and design showcases:
- `nier-showcase/` - NieR-themed UI showcase
- `showcase/` - General application showcase

## Export Instructions

Each folder is prepared to receive static HTML exports of the corresponding SvelteKit routes. To export:

1. Build the SvelteKit application:
   ```bash
   npm run build
   ```

2. Use SvelteKit's static adapter or export functionality:
   ```bash
   npm run preview
   # Or use static export if configured
   ```

3. Copy generated HTML/assets to the appropriate demo folder

## Component Dependencies

Many demo routes use components that are being consolidated:
- **Svelte 4 components** (33 total) - See COMPONENT_USAGE_RANKING_REPORT.md
- **UI components** - Button, Card, Dialog variations
- **AI components** - Various chat and processing interfaces
- **Form components** - Upload and data entry forms

## Integration with Consolidation Plan

These demo routes will be updated as part of the component consolidation:
- **Phase 1**: Archive unused components
- **Phase 2**: Modernize essential Svelte 4 components to Svelte 5
- **Phase 3**: Update import paths in demo routes
- **Phase 4**: Test and validate demo functionality

## Status

- ✅ HTML export folders created
- ⏳ Component consolidation in progress
- ⏳ Static exports pending
- ⏳ Documentation updates pending

Created as part of the comprehensive component consolidation plan to organize and preserve demonstration functionality while modernizing the codebase.