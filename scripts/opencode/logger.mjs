import fs from 'fs'
import path from 'path'

function timestamp() {
  return new Date().toISOString()
}

export function createLogger({ file } = {}) {
  if (file) {
    const dir = path.dirname(file)
    try { fs.mkdirSync(dir, { recursive: true }) } catch (_) {}
  }

  function write(level, msg, meta) {
    const entry = { ts: timestamp(), level, msg, ...meta }
    const line = JSON.stringify(entry)
    if (file) {
      try { fs.appendFileSync(file, line + '\n', 'utf8') } catch (e) { /* ignore */ }
    }
    // also print to console
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }

  return {
    info: (msg, meta = {}) => write('info', msg, meta),
    warn: (msg, meta = {}) => write('warn', msg, meta),
    error: (msg, meta = {}) => write('error', msg, meta)
  }
}

export default createLogger
