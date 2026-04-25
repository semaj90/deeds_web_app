# Vite Error Logger & VS Code Integration

A comprehensive error logging system that integrates Vite build errors directly into VS Code for enhanced development workflow.

## 🎯 Overview

The Vite Error Logger system provides:

- **Real-time error capture** during Vite development and build processes
- **VS Code integration** with Problems panel and task automation
- **Intelligent error suggestions** based on error patterns
- **File navigation** with automatic line/column positioning
- **Error analytics** and pattern recognition
- **JSON schema validation** for error logs

## 📁 File Structure

```
src/lib/vite/
├── vscode-error-logger.ts    # Main Vite plugin for error logging
├── vscode-extension.ts       # VS Code integration utilities
└── README.md                 # This documentation

.vscode/
├── settings.json            # VS Code settings with error logger config
├── tasks.json              # VS Code tasks for error management
├── vite-errors.json        # Generated error log file
└── vite-diagnostics.json   # Generated diagnostics data
```

## 🚀 Quick Start

### 1. Vite Configuration

The error logger is already integrated in `vite.config.ts`:

```typescript
import { vscodeErrorLogger } from './src/lib/vite/vscode-error-logger';

export default defineConfig(({ mode }) => ({
  plugins: [
    UnoCSS(),
    vscodeErrorLogger({
      enabled: mode === 'development',
      logFile: resolve('.vscode/vite-errors.json'),
      maxEntries: 500,
      includeWarnings: true,
      includeSourceMaps: true,
      autoOpenProblems: false,
      notificationLevel: 'errors-only',
      integrateTasks: true,
      generateDiagnostics: true
    }),
    sveltekit()
  ]
}));
```

### 2. VS Code Tasks

Access error management tasks via `Ctrl+Shift+P` → "Tasks: Run Task":

- **View Vite Errors** - Open error log in VS Code editor
- **Clear Vite Error Log** - Clear all logged errors
- **Restart Vite with Clean Logs** - Fresh development server start
- **Analyze Error Patterns** - Generate error statistics
- **Generate Error Report** - Create comprehensive error report

### 3. Development Workflow

1. Start development server: `npm run dev`
2. Errors are automatically logged to `.vscode/vite-errors.json`
3. VS Code Problems panel shows real-time errors
4. Use tasks to navigate, analyze, and manage errors
5. Get intelligent suggestions for common error patterns

## 🔧 Features

### Error Capture

- **Build Errors**: Compilation and bundling errors
- **Transform Errors**: File processing errors
- **Load Errors**: Module resolution errors
- **HMR Errors**: Hot module replacement issues
- **Custom Errors**: Manual error logging support

### VS Code Integration

- **Problems Panel**: Automatic error reporting
- **File Navigation**: Click-to-navigate error locations
- **Task Automation**: Predefined tasks for error management
- **JSON Schema**: IntelliSense for error log files
- **Problem Matchers**: Pattern matching for error extraction

### Intelligent Suggestions

The system provides context-aware suggestions based on error patterns:

```typescript
// Module resolution errors
"Check if the import path is correct and the module is installed. Run `npm install` if needed."

// Syntax errors
"Check for syntax errors, missing brackets, or incorrect TypeScript/JavaScript syntax."

// Svelte compilation errors
"Check Svelte component syntax. Ensure you're using Svelte 5 patterns like $props() and $state()."

// TypeScript errors
"Check TypeScript types and imports. Run `npm run check` for detailed type checking."
```

## 📊 Error Log Format

The error log uses a structured JSON format:

```json
{
  "metadata": {
    "lastUpdated": "2024-01-15T10:30:00.000Z",
    "totalEntries": 42,
    "viteVersion": "5.0.0",
    "projectRoot": "/path/to/project"
  },
  "errors": [
    {
      "timestamp": "2024-01-15T10:29:45.123Z",
      "level": "error",
      "message": "Cannot resolve module '@/components/NonExistent'",
      "file": "src/routes/demo/+page.svelte",
      "line": 15,
      "column": 24,
      "stack": "Error stack trace...",
      "buildPhase": "transform",
      "suggestion": "Check if the import path is correct..."
    }
  ],
  "diagnostics": [
    {
      "uri": "file:///path/to/file.ts",
      "range": {
        "start": { "line": 14, "character": 23 },
        "end": { "line": 14, "character": 33 }
      },
      "severity": 1,
      "message": "Cannot resolve module",
      "source": "vite",
      "code": "transform"
    }
  ]
}
```

## 🎮 Demo Interface

Access the interactive demo at: `http://localhost:5173/dev/vite-error-demo`

The demo provides:
- **Error Generation**: Create sample errors for testing
- **Real-time Monitoring**: Watch error log changes
- **Statistics Display**: Visual error analytics
- **VS Code Integration Info**: Complete integration guide

## 🔧 API Reference

### VSCodeErrorConfig

```typescript
interface VSCodeErrorConfig {
  enabled?: boolean;              // Enable/disable the plugin
  logFile?: string;              // Path to error log file
  maxEntries?: number;           // Maximum errors to keep
  includeWarnings?: boolean;     // Include warning-level messages
  includeSourceMaps?: boolean;   // Include source map information
  autoOpenProblems?: boolean;    // Auto-open VS Code Problems panel
  notificationLevel?: 'all' | 'errors-only' | 'none';
  integrateTasks?: boolean;      // Generate VS Code tasks
  generateDiagnostics?: boolean; // Generate diagnostics data
}
```

### ErrorLogEntry

```typescript
interface ErrorLogEntry {
  timestamp: string;      // ISO timestamp
  level: 'error' | 'warn' | 'info';
  message: string;        // Error message
  stack?: string;         // Stack trace
  file?: string;          // File path
  line?: number;          // Line number
  column?: number;        // Column number
  source?: string;        // Source code context
  frame?: string;         // Code frame
  buildTarget?: string;   // Build target
  buildPhase?: string;    // Build phase
  suggestion?: string;    // Intelligent suggestion
}
```

### Manual Error Logging

```typescript
import { logCustomError } from '$lib/vite/vscode-error-logger';

// Log custom errors manually
logCustomError(
  'Custom error message',
  'src/lib/utils/helper.ts',
  42,
  'error'
);
```

### VS Code Integration

```typescript
import { vscodeIntegration, errorNavigator } from '$lib/vite/vscode-extension';

// Start watching for error changes
vscodeIntegration.startWatching();

// Navigate through errors
errorNavigator.nextError();
errorNavigator.previousError();

// Get error summary
const summary = errorNavigator.getErrorSummary();
```

## 🎯 Use Cases

### Development Workflow

1. **Error Detection**: Automatically catch build and runtime errors
2. **Quick Navigation**: Jump directly to problematic code locations
3. **Pattern Recognition**: Identify recurring error patterns
4. **Batch Resolution**: Address multiple similar errors efficiently

### Team Collaboration

1. **Error Sharing**: Share error logs with team members
2. **Debugging Support**: Provide context for error reproduction
3. **Knowledge Base**: Build repository of common errors and solutions

### CI/CD Integration

1. **Build Validation**: Ensure clean builds before deployment
2. **Error Tracking**: Monitor error trends across builds
3. **Quality Gates**: Block deployments with critical errors

## 🛠️ Advanced Configuration

### Custom Problem Matchers

Add custom pattern matching in `.vscode/tasks.json`:

```json
{
  "owner": "custom-matcher",
  "fileLocation": ["relative", "${workspaceFolder}"],
  "pattern": {
    "regexp": "^ERROR\\s+(.+):(\\d+):(\\d+)\\s+(.+)$",
    "file": 1,
    "line": 2,
    "column": 3,
    "message": 4,
    "severity": "error"
  }
}
```

### Custom Error Suggestions

Extend the suggestion system with custom patterns:

```typescript
function generateCustomSuggestion(message: string): string {
  if (message.includes('custom-pattern')) {
    return 'Custom suggestion for this specific error pattern.';
  }
  return 'Default suggestion';
}
```

## 🔍 Troubleshooting

### Common Issues

1. **Plugin Not Loading**
   - Ensure TypeScript compilation is successful
   - Check Vite configuration syntax
   - Verify file paths are correct

2. **VS Code Tasks Not Working**
   - Reload VS Code window
   - Check `.vscode/tasks.json` syntax
   - Verify task dependencies

3. **Error Log Not Updating**
   - Check file permissions
   - Verify log file path exists
   - Ensure development mode is enabled

### Debug Mode

Enable debug logging in VS Code settings:

```json
{
  "vite.errorLogger.debug": true,
  "vite.errorLogger.verbose": true
}
```

## 📈 Performance Considerations

- **Log Rotation**: Automatically limits entries to prevent large files
- **Efficient Parsing**: Uses streaming JSON parsing for large logs
- **Background Processing**: Error analysis runs in background threads
- **Memory Management**: Automatic cleanup of old entries

## 🚀 Future Enhancements

Planned improvements:

- [ ] **AI-Powered Suggestions**: Machine learning for error resolution
- [ ] **Integration with External Tools**: ESLint, Prettier, TypeScript Language Server
- [ ] **Error Clustering**: Group related errors for batch resolution
- [ ] **Performance Metrics**: Error resolution time tracking
- [ ] **Team Analytics**: Shared error insights across development teams

## 📝 Contributing

To contribute to the error logging system:

1. Follow TypeScript strict mode requirements
2. Add comprehensive JSDoc comments
3. Include unit tests for new features
4. Update this documentation for API changes
5. Test VS Code integration thoroughly

## 📄 License

This error logging system is part of the Legal AI project and follows the same licensing terms.