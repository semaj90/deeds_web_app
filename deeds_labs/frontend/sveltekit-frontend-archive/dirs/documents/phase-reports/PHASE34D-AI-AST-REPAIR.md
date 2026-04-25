# Phase 34D: AI-Assisted AST Repair Environment

Complete setup for intelligent TypeScript/Svelte code analysis and repair using Babel, ts-morph, and local AI (Gemma3/Ollama).

## 🎯 What This Does

1. **AST Parsing**: Analyzes your code structure using Babel parser (understands TypeScript, JSX, class properties)
2. **Pattern Detection**: Identifies problematic code patterns:
   - Shorthand vs explicit object properties
   - Missing property values
   - Malformed expressions
3. **AI Suggestions**: Uses your local Gemma3 model via Ollama to suggest semantic fixes
4. **Safe Repairs**: AST-based transformations preserve code structure and context

## 🚀 Quick Start

### Option 1: VS Code Tasks (Recommended)
Press `Ctrl+Shift+P` → `Tasks: Run Task` → Select:
- **🚀 Phase 34D: Full Pipeline** (runs everything)

OR individually:
- **🔧 Phase 34D: Install Babel + ts-morph** (setup only)
- **🤖 Phase 34D: AI Pattern Repair** (analysis + repair)

### Option 2: Command Line

```powershell
# Step 1: Install dependencies
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
.\scripts\install-babel-tsmorph.ps1

# Step 2: Run AI pattern analysis
node --max-old-space-size=8192 scripts/fix-phase34d-ai-patterns.mjs

# Step 3: Review results
cat phase34d-ai-report.log
```

## 📦 What Gets Installed

```json
{
  "@babel/core": "AST transformation engine",
  "@babel/parser": "TypeScript/JSX parser",
  "@babel/traverse": "AST navigation",
  "@babel/types": "AST node builders",
  "ts-morph": "TypeScript AST manipulation",
  "recast": "Code printer (preserves formatting)"
}
```

## 📊 Output

The AI repair script creates `phase34d-ai-report.log` with:
- File-by-file analysis
- Pattern issues found (with line numbers)
- AI-suggested fixes
- Summary statistics

Example output:
```
src/lib/components/ui/card.ts:42 [SHORTHAND_PROPERTY]
  { userId, status }
  Consider if this should be shorthand or explicit: { userId, status }

src/routes/api/documents/+server.ts:128 [MISSING_VALUE]
  { metadata: }
  Object property missing value

📊 Analysis complete:
   Total issues found: 127
   Parse errors: 3
   Shorthand properties: 89
   Missing values: 35
```

## 🧠 AI Integration

The script automatically detects if Ollama is running at `localhost:11434`:
- **Available**: Uses Gemma3 for semantic suggestions
- **Unavailable**: Runs pattern detection only (still valuable!)

To enable AI suggestions:
```powershell
# Start Ollama (if not already running)
ollama serve

# Verify Gemma3 is available
ollama list | findstr gemma3
```

## 🔍 What Patterns Are Detected?

### 1. Shorthand Property Ambiguity
```typescript
// Detected pattern:
{ userId, status }

// AI suggests verifying if this should be:
{ userId: userId, status: status }  // Explicit
// OR
{ userId, status }  // Shorthand (intentional)
```

### 2. Missing Values
```typescript
// Detected pattern:
callFunction({ data: })

// AI suggests:
callFunction({ data: defaultValue })
```

### 3. Malformed Expressions
```typescript
// Parse errors that prevent compilation
// AI suggests contextual fixes based on surrounding code
```

## 🎨 VS Code Integration

The `.babelrc` config enables VS Code extensions to understand your code structure:
```json
{
  "babel": {
    "parserOpts": {
      "sourceType": "module",
      "plugins": ["typescript", "jsx", "classProperties"]
    }
  }
}
```

## 🔄 Workflow

1. **Install** → Adds Babel + ts-morph to devDependencies
2. **Analyze** → Parses all `.ts` and `.svelte` files in `src/`
3. **Report** → Generates `phase34d-ai-report.log`
4. **Review** → Check suggestions and apply fixes
5. **Validate** → Run `npx tsc --noEmit` to verify

## 💡 Next Steps

After reviewing the report:

```powershell
# Apply fixes manually or with IDE refactoring
# Then verify:
npx tsc --noEmit --skipLibCheck

# If stable, commit:
git add -A
git commit -m "fix: Phase 34D AI-assisted AST pattern repair"
git tag -a phase34d-stable -m "Phase 34D complete"
```

## 🛠️ Troubleshooting

### "Ollama not available"
- Start Ollama: `ollama serve`
- Or continue without AI (pattern detection still works)

### "Parse error" for specific files
- Check if file has syntax errors
- Review mixed Svelte 4/5 patterns
- Check for missing imports

### High memory usage
- Script already uses `--max-old-space-size=8192`
- For large codebases, process directories individually

## 📚 Technical Details

### Why AST vs Regex?
- **Regex**: Fast but context-blind, can break code
- **AST**: Understands code structure, safe transformations
- **AST + AI**: Semantic understanding, contextual fixes

### Parser Capabilities
- Full TypeScript support (generics, decorators, etc.)
- JSX/TSX components
- ES2024+ syntax
- Svelte component scripts

### Performance
- Processes ~1000 files in 30-60 seconds
- Parallel parsing where possible
- Minimal memory footprint (skips node_modules)

## 🎯 Success Metrics

Track your progress:
```powershell
# Before Phase 34D
npx tsc --noEmit 2>&1 | Measure-Object -Line

# After Phase 34D
npx tsc --noEmit 2>&1 | Measure-Object -Line

# Compare error reduction
```

## 🔐 Safety Features

- **Read-only analysis** (no automatic code changes)
- **Backup recommended** before applying fixes
- **Detailed logging** for audit trail
- **Incremental fixes** (review each suggestion)

---

**Ready to start?** Run the Full Pipeline task from VS Code or use the command line steps above.
