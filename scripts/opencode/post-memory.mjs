#!/usr/bin/env node
/*
Simple helper to POST an observation JSON to the local SvelteKit memory endpoint.
Usage:
  # from file
  node scripts/opencode/post-memory.mjs --file ./sample-observation.json

  # from stdin
  cat sample-observation.json | node scripts/opencode/post-memory.mjs

Environment:
  MEMORY_API_URL (default http://localhost:5173/api/memory/claude-mem)
*/
import fs from 'fs'
import fetch from 'node-fetch'

const argv = process.argv.slice(2)
let fileArg = null
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--file' && argv[i+1]) { fileArg = argv[i+1]; i++ }
  else if (!fileArg && !argv[i].startsWith('-')) { fileArg = argv[i] }
}

const apiUrl = process.env.MEMORY_API_URL || 'http://localhost:5173/api/memory/claude-mem'

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value]
}

function normalizeObservation(entry, root = {}) {
  const summary =
    entry?.summary ??
    entry?.observation_text ??
    entry?.observationText ??
    root?.summary ??
    root?.observation_text ??
    root?.observationText ??
    ''
  const projectPath = entry?.project_path ?? entry?.projectPath ?? root?.project_path ?? root?.projectPath ?? ''
  const sessionId = entry?.session_id ?? entry?.sessionId ?? root?.session_id ?? root?.sessionId ?? ''
  const observationId = entry?.observation_id ?? entry?.observationId ?? root?.observation_id ?? root?.observationId ?? ''
  const tags = asArray(entry?.tags ?? root?.tags)
  const sourceRefs = asArray(entry?.source_refs ?? entry?.sourceRefs ?? root?.source_refs ?? root?.sourceRefs)
  const toolCalls = asArray(entry?.tool_calls ?? entry?.toolCalls ?? root?.tool_calls ?? root?.toolCalls)
  const rawJson = entry?.raw_json ?? entry?.rawJson ?? root?.raw_json ?? root?.rawJson ?? entry ?? root

  return {
    source: entry?.source ?? root?.source ?? 'claude-mem',
    ide: entry?.ide ?? root?.ide ?? 'opencode',
    sessionId,
    observationId,
    projectPath,
    summary,
    tags,
    sourceRefs,
    toolCalls,
    rawJson,
  }
}

async function readInput() {
  if (fileArg) return fs.promises.readFile(fileArg, 'utf8')
  // read stdin
  const stdin = await new Promise((res) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => data += chunk)
    process.stdin.on('end', () => res(data))
  })
  return stdin
}

async function main() {
  try {
    const bodyText = (await readInput()).trim()
    if (!bodyText) {
      console.error('No input provided (file or stdin)')
      process.exit(2)
    }
    let payload
    try { payload = JSON.parse(bodyText) } catch (err) {
      console.error('Input is not valid JSON:', err.message)
      process.exit(2)
    }

    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.observations)
        ? payload.observations
        : [payload]
    let exitCode = 0
    for (const item of items) {
      const normalized = normalizeObservation(item, payload)
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized)
      })
      const text = await res.text()
      console.log('Status:', res.status)
      console.log(text)
      if (!res.ok) exitCode = 1
    }
    process.exit(exitCode)
  } catch (err) {
    console.error('Error posting memory:', err)
    process.exit(1)
  }
}

main()
