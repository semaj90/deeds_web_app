# YorHa UI Governor CLI

A comprehensive command-line interface for automated UI governance, analysis, and fixing powered by the YorHa UI Governor system.

## 🏯 Overview

The YorHa CLI provides a complete toolkit for UI governance, combining automated scanning, intelligent analysis, patch generation, and comprehensive reporting. It integrates with the Phase72 MCP UI Governor for browser automation and the VS Code extension for real-time development support.

## 🚀 Installation

### Global Installation

```bash
npm install -g yorha-cli
```

### Local Installation

```bash
npm install yorha-cli --save-dev
```

### From Source

```bash
git clone https://github.com/yorha/ui-governor.git
cd yorha-governor/yorha-cli
npm install
npm link
```

## 📋 Commands

### `yorha scan`

Scan routes and capture screenshots for analysis.

```bash
# Basic scan
yorha scan

# Scan with custom routes
yorha scan --routes ./custom-routes.json

# Scan with specific browser and viewport
yorha scan --browser firefox --viewport 1920x1080

# Scan with concurrency control
yorha scan --concurrency 5 --timeout 10000
```

**Options:**
- `-r, --routes <file>`: Routes configuration file (default: ./routes.json)
- `-o, --output <dir>`: Output directory (default: ./yorha-screenshots)
- `-b, --browser <type>`: Browser type (chromium, firefox, webkit)
- `--headless`: Run in headless mode
- `--viewport <size>`: Viewport size (widthxheight)
- `--timeout <ms>`: Navigation timeout
- `--concurrency <num>`: Number of concurrent browsers
- `--base-url <url>`: Base URL for routes

### `yorha analyze`

Analyze UI compliance, accessibility, and semantic correctness.

```bash
# Basic analysis
yorha analyze

# Full analysis suite
yorha analyze --semantic --visual --accessibility --performance

# Analysis with custom output
yorha analyze --output ./custom-reports --format markdown

# Generate all report formats
yorha analyze --all-formats
```

**Options:**
- `-i, --input <dir>`: Input directory with screenshots
- `-o, --output <dir>`: Output directory for reports
- `-f, --format <type>`: Report format (html, markdown, json)
- `--all-formats`: Generate reports in all formats
- `--semantic`: Enable semantic analysis
- `--visual`: Enable visual similarity analysis
- `--accessibility`: Enable accessibility analysis
- `--performance`: Enable performance analysis
- `--yorha-rules`: Enable YorHa-specific compliance rules
- `--threshold <score>`: Minimum compliance score threshold

### `yorha patch`

Generate automated fixes for identified issues.

```bash
# Generate patches for all issues
yorha patch

# Generate patches for specific issue types
yorha patch --filter accessibility,semantic

# Dry run to preview patches
yorha patch --dry-run

# Interactive patch application
yorha patch --interactive
```

**Options:**
- `-i, --input <file>`: Analysis results file
- `-o, --output <dir>`: Output directory for patches
- `--format <type>`: Patch format (json, diff, unified)
- `--auto-apply`: Automatically apply patches (dangerous!)
- `--dry-run`: Show what would be patched
- `--interactive`: Prompt for confirmation
- `--filter <types>`: Issue types to patch
- `--min-score <score>`: Minimum compliance score

### `yorha autofix`

Apply automated fixes to UI issues with safety controls.

```bash
# Safe autofix with confirmation
yorha autofix

# Force apply all fixes
yorha autofix --force

# Autofix with backup
yorha autofix --backup --backup-dir ./backups

# Risk-controlled fixing
yorha autofix --risk-level low --max-fixes 10
```

**Options:**
- `-i, --input <file>`: Analysis results file
- `-p, --patches <dir>`: Patches directory
- `--backup`: Create backup before applying fixes
- `--backup-dir <dir>`: Backup directory
- `--dry-run`: Show what would be fixed
- `--force`: Apply fixes without confirmation
- `--filter <types>`: Issue types to fix
- `--max-fixes <num>`: Maximum number of fixes
- `--risk-level <level>`: Risk level (low, medium, high)

### `yorha report`

Generate comprehensive UI governance reports.

```bash
# Basic report
yorha report

# Full reporting suite
yorha report --executive-summary --route-details --trends --comparative

# Custom format and output
yorha report --format markdown --output ./monthly-reports

# Highlight issues below threshold
yorha report --threshold 70 --top-issues 20
```

**Options:**
- `-i, --input <file>`: Analysis results file
- `-o, --output <dir>`: Output directory
- `-f, --format <type>`: Report format
- `--all-formats`: Generate all formats
- `--executive-summary`: Generate executive summary
- `--route-details`: Generate individual route reports
- `--trends`: Include trend analysis
- `--comparative`: Generate comparative analysis
- `--threshold <score>`: Highlight routes below score
- `--top-issues <num>`: Show top N issues

## ⚙️ Configuration

Create a `yorha.config.json` file in your project root:

```json
{
  "version": "1.0.0",
  "mcpEndpoint": "http://localhost:3003",
  "playwrightConfig": "./playwright.config.js",
  "routesFile": "./routes.json",
  "outputDir": "./yorha-reports",
  "baselineDir": "./yorha-baselines",
  "thresholds": {
    "compliance": 80,
    "accessibility": 90,
    "performance": 75
  },
  "browsers": {
    "default": "chromium",
    "fallback": ["firefox", "webkit"]
  },
  "analysis": {
    "semantic": true,
    "visual": true,
    "accessibility": true,
    "performance": false,
    "yorhaRules": true
  }
}
```

## 📊 Routes Configuration

Create a `routes.json` file to define which routes to scan:

```json
{
  "baseUrl": "http://localhost:3000",
  "routes": [
    "/",
    "/about",
    "/contact",
    "/products",
    "/dashboard",
    "/admin/users"
  ],
  "auth": {
    "loginRoute": "/login",
    "credentials": {
      "username": "admin",
      "password": "password"
    }
  },
  "viewport": {
    "width": 1920,
    "height": 1080
  },
  "waitFor": {
    "selector": ".app-loaded",
    "timeout": 5000
  }
}
```

## 🔄 Workflows

### Complete UI Governance Pipeline

```bash
# 1. Scan all routes
yorha scan --routes ./routes.json --output ./screenshots

# 2. Analyze compliance
yorha analyze --input ./screenshots --output ./reports --all-formats

# 3. Generate patches
yorha patch --input ./reports/analysis-results.json --output ./patches

# 4. Apply fixes safely
yorha autofix --backup --interactive

# 5. Generate final report
yorha report --executive-summary --trends --comparative
```

### Continuous Integration

```bash
#!/bin/bash
set -e

echo "🧪 Running YorHa UI Governance..."

# Scan and analyze
yorha scan --headless --concurrency 3
yorha analyze --accessibility --semantic --threshold 85

# Fail CI if score too low
if [ $? -ne 0 ]; then
  echo "❌ UI governance check failed"
  exit 1
fi

# Generate reports
yorha report --format html --executive-summary

echo "✅ UI governance check passed"
```

### Development Workflow

```bash
# Quick checks during development
yorha scan --routes ./dev-routes.json
yorha analyze --accessibility --yorha-rules
yorha report --format markdown
```

## 🎯 Integration

### VS Code Extension

The CLI integrates seamlessly with the YorHa VS Code extension:

```json
// .vscode/settings.json
{
  "yorha.cli.enabled": true,
  "yorha.cli.autoScan": true,
  "yorha.cli.onSave": ["accessibility", "semantic"]
}
```

### CI/CD Integration

```yaml
# .github/workflows/ui-governance.yml
name: UI Governance
on: [push, pull_request]

jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install YorHa CLI
        run: npm install -g yorha-cli

      - name: Start application
        run: npm run dev &
        env:
          PORT: 3000

      - name: Wait for app
        run: npx wait-on http://localhost:3000

      - name: Run UI governance
        run: yorha scan && yorha analyze --threshold 80

      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: ui-reports
          path: ./yorha-reports/
```

### MCP Integration

The CLI works with the Phase72 MCP UI Governor:

```javascript
// mcp-integration.js
const { MCPClient } = require('yorha-cli');

const client = new MCPClient({
  endpoint: 'http://localhost:3003'
});

// Automated patching via MCP
await client.patchRoute('/dashboard', {
  fixes: ['accessibility', 'semantic'],
  riskLevel: 'medium'
});
```

## 📈 Metrics and Monitoring

### Prometheus Metrics

```bash
# Export metrics for monitoring
yorha report --format json | jq '.metrics'
```

### Dashboard Integration

```javascript
// dashboard-integration.js
const { YorHaDashboard } = require('yorha-cli');

const dashboard = new YorHaDashboard({
  port: 8080,
  reportsDir: './yorha-reports'
});

dashboard.start();
```

## 🛠️ Development

### Building from Source

```bash
git clone https://github.com/yorha/ui-governor.git
cd yorha-governor/yorha-cli
npm install
npm run build
```

### Testing

```bash
npm test
npm run test:integration
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Support

- 📖 [Documentation](https://yorha-ui-governor.dev)
- 🐛 [Issue Tracker](https://github.com/yorha/ui-governor/issues)
- 💬 [Discussions](https://github.com/yorha/ui-governor/discussions)
- 📧 [Email Support](mailto:support@yorha-ui-governor.dev)

---

*Built with ❤️ by the YorHa UI Governance Team*