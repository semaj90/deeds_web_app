#!/usr/bin/env node
// Lightweight smoke script to import route modules and report import-time errors.
import path from 'path'

async function tryImport(relPath) {
  try {
    const mod = await import(relPath)
    console.log(`OK: imported ${relPath} -> exports: ${Object.keys(mod).join(', ')}`)
  } catch (err) {
    console.error(`ERROR importing ${relPath}:`, err && err.stack ? err.stack : err)
    process.exitCode = 2
  }
}

;(async () => {
  const base = path.resolve(process.cwd(), 'src', 'routes', 'api', 'auth')
  await tryImport(`file://${path.join(base, 'me', '+server.ts')}`)
  await tryImport(`file://${path.join(base, 'logout', '+server.ts')}`)
})()
