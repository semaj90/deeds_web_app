# 🏯 YorHa UI Governance Suite

> "In the name of governance, we will create a perfect UI." - YorHa UI Governor

A comprehensive, AI-powered UI governance platform that combines automated analysis, intelligent fixing, and real-time development support. Built for modern web applications with Svelte, React, Vue, and beyond.

## 🎯 Overview

YorHa UI Governance Suite provides end-to-end UI quality assurance through:

- **Real-time Development Support**: VS Code extension for instant feedback
- **Automated UI Analysis**: Browser-based scanning and compliance checking
- **Intelligent Patch Generation**: AI-assisted fix generation and application
- **Comprehensive Reporting**: Executive dashboards and trend analysis
- **CLI Integration**: Command-line tools for CI/CD and development workflows

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   VS Code       │    │  Phase72 MCP     │    │   YorHa CLI     │
│   Extension     │◄──►│  UI Governor     │◄──►│   Toolchain     │
│                 │    │                  │    │                 │
│ • Real-time     │    │ • Browser Auto   │    │ • Scan Routes   │
│   Diagnostics   │    │ • DOM Analysis   │    │ • Analyze UI    │
│ • Code Actions  │    │ • Visual Regress │    │ • Generate      │
│ • Quick Fixes   │    │ • Compliance     │    │   Patches       │
└─────────────────┘    │   Checking       │    │ • Apply Fixes   │
                       └──────────────────┘    │ • Reports       │
                                                └─────────────────┘
```

## 🚀 Quick Start

### 1. Install the Suite

```bash
# Install YorHa CLI globally
npm install -g yorha-cli

# Or install locally
npm install yorha-cli --save-dev
```

### 2. Initialize Your Project

```bash
# Create configuration
yorha init

# This creates:
# - yorha.config.json
# - routes.json
# - playwright.config.js
```

### 3. Run Your First Governance Check

```bash
# Start your development server
npm run dev

# Scan and analyze your UI
yorha scan
yorha analyze --accessibility --semantic
yorha report --format html
```

## 📦 Components

### 🏗️ VS Code Extension (`vscode-extension/`)

Real-time UI governance during development.

**Features:**
- Svelte rune analysis and fixing
- UI semantic scanning
- Style compliance checking
- Real-time diagnostics
- Code actions and quick fixes
- Accessibility linting

**Installation:**
```bash
code --install-extension yorha-ui-governor
```

### 🌐 Phase72 MCP UI Governor (`phase72-mcp-ui-governor/`)

Automated UI testing and patching system.

**Features:**
- Playwright-powered route crawling
- DOM extraction and analysis
- Screenshot analysis
- Visual regression detection
- Semantic ranking and embeddings
- Compliance rule engine
- AI-assisted patch generation

**Usage:**
```javascript
const { CrawlRoutes } = require('./phase72-mcp-ui-governor/scripts/crawlRoutes');
const crawler = new CrawlRoutes({ browser: 'chromium' });
await crawler.crawlRoutes(['/'], './screenshots');
```

### 🖥️ YorHa CLI (`yorha-cli/`)

Command-line interface for batch operations.

**Commands:**
- `yorha scan` - Capture screenshots
- `yorha analyze` - Run compliance analysis
- `yorha patch` - Generate fixes
- `yorha autofix` - Apply fixes safely
- `yorha report` - Generate reports

## 🎨 Analysis Types

### Accessibility Analysis
- WCAG 2.1 AA compliance
- Screen reader compatibility
- Keyboard navigation
- Color contrast ratios
- Focus management

### Semantic Analysis
- HTML5 semantic structure
- ARIA landmark roles
- Heading hierarchy
- List and table semantics
- Content relationships

### Visual Analysis
- Layout consistency
- Visual regression detection
- Color scheme compliance
- Typography standards
- Spacing and alignment

### Performance Analysis
- Core Web Vitals
- Bundle size impact
- Runtime performance
- Memory usage
- Network efficiency

## 🔧 Configuration

### Global Configuration (`yorha.config.json`)

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
  }
}
```

### Routes Configuration (`routes.json`)

```json
{
  "baseUrl": "http://localhost:3000",
  "routes": [
    "/",
    "/about",
    "/products",
    "/dashboard"
  ],
  "auth": {
    "required": false
  },
  "viewport": {
    "width": 1920,
    "height": 1080
  }
}
```

## 📊 Reporting

### Report Types

- **HTML Reports**: Interactive dashboards with charts
- **Markdown Reports**: Documentation-friendly format
- **JSON Reports**: Machine-readable data
- **Executive Summaries**: High-level overviews
- **Trend Analysis**: Historical comparisons
- **Comparative Reports**: Before/after analysis

### Sample Report Output

```
📊 YorHa UI Governance Report
================================

Routes Analyzed: 12
Overall Score: 87/100
Total Issues: 23

Top Issues:
1. Missing alt text (8 routes)
2. Low contrast ratio (5 routes)
3. Non-semantic div usage (4 routes)

Recommendations:
🔴 Fix critical accessibility issues
🟡 Implement semantic HTML standards
🟢 Establish UI governance workflow
```

## 🔄 Workflows

### Development Workflow

```bash
# During development
npm run dev
yorha scan --incremental
yorha analyze --accessibility
yorha report --format markdown
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

      - name: Start Application
        run: npm run dev &

      - name: Run Governance Checks
        run: |
          yorha scan --headless
          yorha analyze --threshold 85
          yorha report --executive-summary

      - name: Upload Reports
        uses: actions/upload-artifact@v3
        with:
          name: ui-governance-reports
          path: ./yorha-reports/
```

### Automated Fixing

```bash
# Safe automated fixing
yorha patch --dry-run
yorha autofix --backup --interactive --risk-level medium
yorha report --comparative
```

## 🧠 AI Integration

### MCP Context7 Integration

The suite integrates with MCP (Model Context Protocol) for AI-assisted analysis:

```javascript
const { MCPClient } = require('yorha-cli');

const client = new MCPClient({
  endpoint: 'http://localhost:3003'
});

// AI-assisted patch generation
const patches = await client.generatePatches(routeAnalysis, {
  model: 'gemma3-legal',
  riskLevel: 'medium'
});
```

### Supported AI Models

- **Gemma 3 Legal**: Specialized legal document analysis
- **Embedding Models**: For semantic similarity
- **Vision Models**: For visual regression analysis
- **Code Models**: For automated fix generation

## 📈 Metrics and Monitoring

### Key Metrics

- **Compliance Score**: Overall UI quality (0-100)
- **Accessibility Score**: WCAG compliance level
- **Performance Score**: Core Web Vitals
- **Issue Density**: Issues per route
- **Fix Success Rate**: Percentage of auto-applied fixes

### Monitoring Dashboard

```bash
# Start metrics dashboard
yorha dashboard --port 8080

# Export Prometheus metrics
yorha metrics --format prometheus
```

## 🛠️ Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/yorha/ui-governor.git
cd yorha-governor

# Install dependencies
npm install

# Build all components
npm run build

# Run tests
npm test
```

### Project Structure

```
yorha-governor/
├── vscode-extension/           # VS Code extension
│   ├── package.json
│   ├── extension.js
│   └── src/
├── phase72-mcp-ui-governor/    # MCP system
│   ├── package.json
│   ├── scripts/
│   └── analysis/
├── yorha-cli/                  # CLI tools
│   ├── index.js
│   ├── commands/
│   └── README.md
├── shared/                     # Shared analyzers
├── docs/                       # Documentation
└── tests/                      # Integration tests
```

### Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Add tests
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Support

- 📖 [Documentation](https://yorha-ui-governor.dev/docs)
- 🐛 [GitHub Issues](https://github.com/yorha/ui-governor/issues)
- 💬 [GitHub Discussions](https://github.com/yorha/ui-governor/discussions)
- 📧 [Email Support](mailto:support@yorha-ui-governor.dev)

## 🙏 Acknowledgments

- Built with [Playwright](https://playwright.dev/) for browser automation
- Powered by [Natural](https://naturalnode.github.io/natural/) for NLP
- Visual analysis by [Sharp](https://sharp.pixelplumbing.com/)
- AST parsing with [Acorn](https://github.com/acornjs/acorn)

---

*"Through governance, we achieve perfection."*