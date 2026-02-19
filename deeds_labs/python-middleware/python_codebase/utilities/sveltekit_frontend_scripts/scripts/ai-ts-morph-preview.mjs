#!/usr/bin/env node
import { Project, SyntaxKind } from 'ts-morph'
import fs from 'fs'
import path from 'path'
let diffLines
try {
  diffLines = (await import('diff')).diffLines
} catch (e) {
  diffLines = null
}
import { fileURLToPath } from 'url'

// Prettier will be imported lazily per-file to avoid loading plugins for the whole repo
let prettier = null

const LOG_DIR = 'logs'
const PREVIEW_DIR = `${LOG_DIR}/ai-previews`
fs.mkdirSync(PREVIEW_DIR, { recursive: true })

// --- helper: summarize current tsc log ---
function readErrorSummary() {
  const file = `${LOG_DIR}/tsc-full.log`
  if (!fs.existsSync(file)) return 'No tsc-full.log found'
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const summary = {}
  for (const l of lines) {
    const m = l.match(/(TS\d+):\s*(.*)/)
    if (m) summary[m[1]] = (summary[m[1]] ?? 0) + 1
  }
  // write JSON summary for tooling
  try {
    fs.writeFileSync(`${LOG_DIR}/tsc-summary.json`, JSON.stringify(summary, null, 2))
  } catch (e) {
    // ignore
  }
  return Object.entries(summary)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 10)
    .map(([code, count]) => `${code}: ${count}`)
    .join('\n')
}

// --- helper: ask Ollama how to fix patterns ---
async function queryOllama(prompt, opts = {}) {
  const OLLAMA_URL = process.env.OLLAMA_URL || opts.ollamaUrl || 'http://localhost:11434'
  try {
    // prefer global fetch, otherwise dynamically import node-fetch
    const fetchFn =
      typeof globalThis.fetch === 'function'
        ? globalThis.fetch
        : (await import('node-fetch')).default
    const body = { model: process.env.AI_PLAN_MODEL || 'gemma3-legal:latest', prompt, stream: false }
    const res = await fetchFn(`${OLLAMA_URL.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // small timeout note: user environment should handle network timeouts externally
    })
    const data = await res.json()
    return data?.response ?? data?.choices?.[0]?.content ?? JSON.stringify(data)
  } catch (err) {
    return `Ollama query failed: ${err?.message ?? String(err)}`
  }
}

// --- main fixer preview ---
async function aiPreviewFix(rootDir = 'src', options = {}) {
  const project = new Project({ tsConfigFilePath: 'tsconfig.json' })
  // include node ESM extensions and modern typescript module suffixes
  const extPattern = '{ts,tsx,js,jsx,mjs,mts,cjs}'
  const files = project.getSourceFiles(`${rootDir}/**/*.${extPattern}`)
  const summary = readErrorSummary()
  console.log('🔍 Top error summary:\n', summary)

  const aiPlan = await queryOllama(
    `You are a TypeScript AST repair agent.\nGiven this compiler error summary:\n${summary}\nSuggest short, safe structural fixes (e.g. missing commas, missing commas in arrays/objects, unclosed braces). Output a minimal action list (JSON array of objects: {pattern: string, fix: string}).`,
    { ollamaUrl: process.env.OLLAMA_URL }
  )
  try { fs.writeFileSync(`${LOG_DIR}/ai-plan.txt`, String(aiPlan)) } catch {}
  console.log('🧠 Ollama plan saved → logs/ai-plan.txt')

  const previewSummary = []

  for (const source of files) {
    let modified = false
    // Use a getter so we always read the current text after any replacements
    const getSrcText = () => source.getFullText()

    source.forEachDescendant(node => {
  // Fix missing commas between object literal properties
      if (node.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const props = node.getProperties()
        for (let i = 0; i < props.length - 1; i++) {
          const a = props[i],
            b = props[i + 1]
          const between = getSrcText().slice(a.getEnd(), b.getPos())
          if (!between.includes(',')) {
            a.replaceWithText(a.getText() + ',')
            modified = true
          }
        }
      }
  // Fix missing commas in arrays
      if (node.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const elems = node.getElements()
        for (let i = 0; i < elems.length - 1; i++) {
          const a = elems[i],
            b = elems[i + 1]
          const between = getSrcText().slice(a.getEnd(), b.getPos())
          if (!between.includes(',')) {
            a.replaceWithText(a.getText() + ',')
            modified = true
          }
        }
      }
    })

  if (modified) {
      // choose parser by file extension
      const ext = path.extname(source.getFilePath()).toLowerCase()
      const parser =
        ext === '.ts' || ext === '.tsx' || ext === '.mts' ? 'typescript' : /* .js/.jsx/.mjs/.cjs */ 'babel'
      let formatted = source.getFullText()
      try {
        if (!prettier) {
          try {
            prettier = await import('prettier').then(m => m.default ?? m)
          } catch (impErr) {
            console.warn('Prettier import failed; continuing without formatting:', impErr?.message ?? impErr)
            prettier = null
          }
        }
        if (prettier) {
          formatted = await prettier.format(source.getFullText(), {
            filepath: source.getFilePath(),
            parser,
          })
        } else {
          // Prettier not available; keep AST text
          console.warn('Prettier not available, skipping format for', source.getFilePath())
        }
      } catch (pfErr) {
        console.warn('Prettier format failed for', source.getFilePath(), pfErr?.message ?? pfErr)
        // fall back to raw AST text if prettier fails
      }

      const orig = fs.readFileSync(source.getFilePath(), 'utf8')
      let diff = ''
      if (diffLines) {
        diff = diffLines(orig, formatted)
          .map(p => (p.added ? '+ ' : p.removed ? '- ' : '  ') + p.value)
          .join('')
      } else {
        // simple fallback: show original and formatted side-by-side markers
        const origLines = orig.split(/\r?\n/)
        const fmtLines = formatted.split(/\r?\n/)
        const max = Math.max(origLines.length, fmtLines.length)
        const parts = []
        for (let i = 0; i < max; i++) {
          const o = origLines[i] ?? ''
          const f = fmtLines[i] ?? ''
          if (o === f) parts.push('  ' + o + '\n')
          else {
            if (o) parts.push('- ' + o + '\n')
            if (f) parts.push('+ ' + f + '\n')
          }
        }
        diff = parts.join('')
      }
      const outFile = `${PREVIEW_DIR}/${path.relative('.', source.getFilePath()).replace(/[\\/]/g, '_')}.diff`
      fs.writeFileSync(outFile, diff)
      previewSummary.push({ file: source.getFilePath(), outFile })
    }
  }

  fs.writeFileSync(`${LOG_DIR}/ai-preview-summary.json`, JSON.stringify(previewSummary, null, 2))
  console.log(`✅ ${previewSummary.length} preview diffs written → ${PREVIEW_DIR}`)

  // TODO: Consider adding --apply flag to optionally apply safe diffs automatically.
  // TODO: Add integration tests for ai-preview to avoid regressions.
}

// robust main check (works on Windows & POSIX)
const scriptPath = fileURLToPath(import.meta.url)
if (path.resolve(scriptPath) === path.resolve(process.argv[1]) || process.argv[1]?.endsWith('ai-ts-morph-preview.mjs')) {
  aiPreviewFix(process.argv[2] || 'src').catch(err => {
    console.error('Preview fixer failed:', err)
    process.exitCode = 1
  })
}
