#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import glob from 'glob'
import { remark } from 'remark'
import strip from 'strip-markdown'

// Patterns to scan
const PATTERNS = [
  'docs/**/*.md',
  '.opencode/**/*.md',
  'sveltekit-frontend/docs/**/*.md',
  'next_steps/**/*.md',
  'memory/**/*.md',
]

async function extract(filePath) {
  const text = await fs.promises.readFile(filePath, 'utf8')
  const lines = text.split(/\r?\n/)
  const titleLine = lines.find(l => /^#\s+/.test(l)) || path.basename(filePath)
  const title = (titleLine.match(/^#\s+(.*)/) || [null, titleLine])[1]
  const checkboxes = lines.filter(l => /^\s*[-*]\s+\[[ xX]\]/.test(l))
  const todos = lines.filter(l => /TODO[:]?/i.test(l))
  const commands = lines.filter(l => /^\$\s|^```bash|^```sh/.test(l))
  const filePaths = (text.match(/\b([\w\/\\\.\-]+\.(ts|js|md|txt|json))\b/g) || [])
  const sourceRefs = [filePath]
  const featureLabels = (text.match(/^\s*tags?:\s*(.*)$/im) || []).slice(1)
  // summary: first paragraph (non-heading)
  const para = lines.slice(0, 20).find(l => l.trim() && !/^#/.test(l)) || ''
  const summary = await remark().use(strip).process(para).then(r => String(r))

  return {
    id: filePath,
    title: title || path.basename(filePath),
    path: filePath,
    checkboxes,
    todos,
    commands,
    filePaths,
    sourceRefs,
    featureLabels,
    summary: summary.trim(),
    text: text.slice(0, 8000) // keep a trimmed copy for safe offline processing
  }
}

async function main() {
  const outDir = path.join(process.cwd(), 'scratch', 'atlas')
  await fs.promises.mkdir(outDir, { recursive: true })
  const outFile = path.join(outDir, 'ingest-markdown-cards.jsonl')
  const stream = fs.createWriteStream(outFile, { flags: 'w' })

  for (const pattern of PATTERNS) {
    const matches = glob.sync(pattern, { nodir: true })
    for (const m of matches) {
      try {
        const card = await extract(m)
        stream.write(JSON.stringify(card) + '\n')
      } catch (err) {
        console.warn('Failed to extract', m, err.message)
      }
    }
  }

  stream.end()
  console.log('Wrote markdown cards to', outFile)
  console.log('Next: wire embeddings -> Qdrant, write Postgres rows, and update Redis key ace:atlas:markdown:latest')
}

main().catch(err => { console.error(err); process.exit(1) })
