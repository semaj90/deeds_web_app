# YorHa UI Governor - VS Code Extension

AI-powered UI governance and code quality enforcement for Svelte applications.

## Features

- **Svelte Rune Analysis**: Automatically detect and fix Svelte 5 rune usage issues
- **UI Semantic Scanning**: Analyze component structure and accessibility compliance
- **Style Compliance**: Enforce consistent styling patterns and conventions
- **AST-based Analysis**: Deep code analysis using Abstract Syntax Trees
- **Real-time Diagnostics**: Live feedback as you code
- **Code Actions**: Quick fixes for common issues

## Installation

1. Clone the repository
2. Run `npm install` in the `vscode-extension` directory
3. Run `npm run package` to create a `.vsix` file
4. In VS Code: `Ctrl+Shift+P` → `Extensions: Install from VSIX`

## Usage

### Commands

- `YorHa: Fix Svelte Runes` - Automatically fix rune-related issues
- `YorHa: Inspect UI Compliance` - Run comprehensive UI analysis

### Context Menu

Right-click on any `.svelte` file to access YorHa commands.

## Architecture

```
src/
├── analyzer/
│   ├── svelteRuneFixer.js      # Rune analysis and fixing
│   ├── uiSemanticScanner.js    # UI structure analysis
│   ├── styleCompliance.js      # Style pattern enforcement
│   └── astUtils.js             # AST parsing utilities
├── features/
│   ├── codeActions.js          # VS Code code actions
│   ├── diagnostics.js          # Diagnostic reporting
│   └── commands.js             # Command handlers
└── util/
    └── fileOps.js              # File system operations
```

## Integration

This extension integrates with the broader YorHa UI Governance Suite:

- **Phase72 MCP UI Governor**: Automated UI testing and patching
- **YorHa CLI**: Command-line interface for batch operations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request