// Node orchestrator: watches NDJSON exports and dispatches clustering jobs to Python worker.
import fs from 'fs'
import { spawn } from 'child_process'
import path from 'path'

const argv = process.argv.slice(2)
const opts = {
  once: false,
  watch: false,
  input: null,
  dryRun: false,
  write: false,
  enqueue: false,
  jobsDir: '.opencode/jobs',
}
for (let i=0;i<argv.length;i++){
  const a = argv[i]
  if (a === '--once') { opts.once = true; continue }
  if (a === '--watch') { opts.watch = true; continue }
  if (a === '--input' && argv[i+1]) { opts.input = argv[++i]; continue }
  if (a === '--dry-run') { opts.dryRun = true; continue }
  if (a === '--write') { opts.write = true; continue }
  if (a === '--enqueue') { opts.enqueue = true; continue }
  if (a === '--jobs-dir' && argv[i+1]) { opts.jobsDir = argv[++i]; continue }
}

function fileExists(p){ try { return fs.existsSync(p) } catch { return false } }

async function runOnce(){
  if (!opts.input) return console.error('No --input provided')
  const inPath = path.resolve(opts.input)
  if (!fileExists(inPath)) return console.error('Input not found:', inPath)

  console.log('Dispatching clustering worker for', inPath)
  const outPath = `.tmp/atlas-cluster-assignments.${Date.now()}.jsonl`
  const pyArgs = ['workers/atlas-cluster-worker.py', '--input', inPath, '--out', outPath]
  if (opts.dryRun) pyArgs.push('--dry-run')
  // default k
  pyArgs.push('--k', '16')

  if (opts.enqueue) {
    // create job descriptor in jobsDir
    const job = { input: inPath, out: outPath, k: 16, createdAt: new Date().toISOString(), dryRun: !!opts.dryRun }
    fs.mkdirSync(opts.jobsDir, { recursive: true })
    const jobPath = path.join(opts.jobsDir, `job-${Date.now()}.json`)
    fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf-8')
    console.log('Enqueued job:', jobPath)
    // If not enqueue-only, still run immediately when requested
    if (!opts.dryRun) console.log('Note: job created; worker will run immediately because --dry-run is false')
  }

  // Use 'python' from PATH; on Windows the Node executable path replacement is unreliable
  const py = spawn('python', pyArgs, { stdio: 'inherit', shell: false })
  py.on('exit', (code) => {
    console.log('Worker exited', code)
    console.log('Preview: node scripts/atlas/qdrant-upsert-clusters.mjs --input .tmp/atlas-cluster-assignments.jsonl --collection codebase_chunks_768 --dry-run')
  })
}

if (opts.once) {
  runOnce()
} else {
  // Watch mode
  import('chokidar').then(({default: chokidar})=>{
    const watcher = chokidar.watch('.opencode/**/!(*.lock).jsonl', {ignoreInitial:true})
    watcher.on('add', p=>{
      console.log('New file detected:', p)
      const out = `.tmp/atlas-cluster-assignments.${Date.now()}.jsonl`
      const pyArgs = ['workers/atlas-cluster-worker.py', '--input', p, '--out', out, '--k', '16']
      if (opts.dryRun) pyArgs.push('--dry-run')
      if (opts.enqueue) {
        const job = { input: p, out, k: 16, createdAt: new Date().toISOString(), dryRun: !!opts.dryRun }
        fs.mkdirSync(opts.jobsDir, { recursive: true })
        const jobPath = path.join(opts.jobsDir, `job-${Date.now()}.json`)
        fs.writeFileSync(jobPath, JSON.stringify(job, null, 2), 'utf-8')
        console.log('Enqueued job:', jobPath)
      }
      const py = spawn('python', pyArgs, { stdio: 'inherit', shell: false })
      py.on('exit', code=> console.log('Worker finished', code))
    })
    console.log('Watching .opencode for exports...')
  })
}
