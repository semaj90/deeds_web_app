# Streamlined Evidence Board Application

A focused SvelteKit application for legal evidence management with Fabric.js canvas integration and AI-powered case analysis.

## 🎯 Features

- **📋 Evidence Board**: Interactive Fabric.js canvas for visual evidence organization
- **📁 File Management**: Drag-and-drop evidence uploads with real-time preview
- **🎮 Gaming UI**: NES.css retro aesthetic for engaging user experience
- **🤖 AI Integration**: Local LLM support for case analysis and smart search
- **📊 Timeline View**: Chronological case activity tracking
- **📝 Report Generation**: Dynamic report creation and export
- **💬 AI Chat**: Natural language case analysis interface

## 🏗️ Architecture

```
sveltekit-evidence/
├── src/
│   ├── lib/
│   │   ├── components/          # Svelte components
│   │   │   ├── EvidenceBoard.svelte
│   │   │   ├── EvidenceSidebar.svelte
│   │   │   └── ReportEditor.svelte
│   │   ├── stores/              # Reactive state management
│   │   │   ├── caseStore.ts
│   │   │   └── boardStore.ts
│   │   ├── types/               # TypeScript definitions
│   │   │   └── types.ts
│   │   └── utils/               # Utility functions
│   │       ├── gemmaEmbed.ts
│   │       └── rag.ts
│   ├── routes/
│   │   ├── api/                 # API endpoints
│   │   │   ├── evidence/
│   │   │   ├── reports/
│   │   │   └── case-chat/
│   │   └── cases/[caseId]/      # Dynamic case routes
│   └── app.html                 # HTML template
├── package.json
├── svelte.config.js
├── tsconfig.json
└── vite.config.ts
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Local LLM (Ollama recommended)
- Redis (for session management)

### Installation

1. **Install dependencies**:

   ```bash
   cd sveltekit-evidence
   npm install
   ```

2. **Start development server**:

   ```bash
   npm run dev
   ```

3. **Open application**:
   Navigate to `http://localhost:5173`

### Production Build

```bash
npm run build
npm run preview
```

## 🎮 Usage

1. **Create a Case**: Navigate to `/cases/[caseId]` to load the evidence board
2. **Upload Evidence**: Use the sidebar to drag-and-drop files onto the canvas
3. **Organize Visually**: Position evidence items on the Fabric.js canvas
4. **Generate Reports**: Create structured reports from analyzed evidence
5. **AI Analysis**: Use natural language queries to analyze case patterns

## 🔧 Configuration

### AI Integration

Configure local LLM endpoints in `src/lib/utils/rag.ts`:

```typescript
const LLM_BASE_URL = "http://localhost:11434"; // Ollama default
const EMBEDDING_URL = "http://localhost:8080"; // Your embedding service
```

### Canvas Settings

Adjust Fabric.js canvas options in `src/lib/components/EvidenceBoard.svelte`:

```typescript
const canvas = new fabric.Canvas("evidence-canvas", {
  width: 1200,
  height: 800,
  backgroundColor: "#000",
});
```

## 📚 API Endpoints

- `POST /api/evidence/ingest` - Upload and process evidence files
- `GET /api/reports` - List case reports
- `POST /api/reports` - Create new report
- `POST /api/case-chat` - AI chat interface

## 🎨 Styling

The application uses NES.css for a retro gaming aesthetic:

- Dark theme with `#0a0a0a` background
- Gaming-inspired buttons and containers
- Pixelated fonts and UI elements
- Custom canvas styling for evidence board

## 🔮 Future Enhancements

- [ ] Real-time collaboration support
- [ ] Advanced OCR for document analysis
- [ ] Integration with legal databases
- [ ] Enhanced AI reasoning capabilities
- [ ] Export to legal document formats
- [ ] Timeline visualization improvements

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

For questions or support, please open an issue on GitHub.
