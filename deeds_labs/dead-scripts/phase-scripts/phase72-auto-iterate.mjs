#!/usr/bin/env node
console.log('DEBUG: Script started');

/**
 * Phase 72 Automated Iterative Error Fix Loop
 * GPU-accelerated clustering + ACE autonomous fixes
 *
 * Workflow:
 * Cycle 1: Fix easy clusters (expect ~50% reduction: 12k → 6k)
 * Cycle 2: Re-cluster remaining (expect ~75% cumulative: 6k → 3k)
 * Cycle 3: Final polish (expect ~90%+ cumulative: 3k → 1k-200)
 *
 * Estimated Duration: 20-30 minutes
 */

import { spawn } from 'child_process'
import cliProgress from 'cli-progress'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Timing estimates (in seconds)
const TIMINGS = {
  GPU_CLUSTERING: 300, // 5 min - GPU WebGPU SOM clustering
  ACE_ANALYSIS: 180,   // 3 min - ACE pattern analysis
  ACE_FIXES: 240,      // 4 min - ACE code generation
  VERIFICATION: 60,    // 1 min - svelte-check verification
  CYCLE_OVERHEAD: 30   // 30s - overhead per cycle
}

const TOTAL_DURATION_SEC =
  (TIMINGS.GPU_CLUSTERING + TIMINGS.ACE_ANALYSIS + TIMINGS.ACE_FIXES + TIMINGS.VERIFICATION + TIMINGS.CYCLE_OVERHEAD) * 3 // 3 cycles

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
}

const log = {
  header: (msg) => console.log(`\n${colors.bright}${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  metric: (label, value) => console.log(`${colors.bright}${label}:${colors.reset} ${value}`),
  progress: (msg) => console.log(`${colors.magenta}⚙ ${msg}${colors.reset}`)
}

// Global progress tracking
let globalProgressBar = null
let phaseProgressBar = null
let startTime = null

/**
 * Initialize progress bars
 */
function initializeProgressBars() {
  startTime = Date.now()

  const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: '{phase} |{bar}| {percentage}% | ETA: {eta}s | {value}/{total}s',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
  }, cliProgress.Presets.shades_classic)

  globalProgressBar = multibar.create(TOTAL_DURATION_SEC, 0, { phase: colors.cyan + 'Overall   ' + colors.reset })
  phaseProgressBar = multibar.create(100, 0, { phase: colors.yellow + 'Current   ' + colors.reset })

  return multibar
}

/**
 * Update progress bars during operation
 */
function updateProgress(elapsed, phaseProgress = 0) {
  if (globalProgressBar) {
    globalProgressBar.update(Math.min(elapsed, TOTAL_DURATION_SEC))
  }
  if (phaseProgressBar) {
    phaseProgressBar.update(Math.min(phaseProgress, 100))
  }
}

/**
 * Format time remaining
 */
function formatTimeRemaining(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

/**
 * Execute shell command and return output
 */
function executeCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: projectRoot,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
      ...options
    })

    let stdout = ''
    let stderr = ''

    if (proc.stdout) {
      proc.stdout.on('data', (data) => {
        stdout += data.toString()
        process.stdout.write(data)
      })
    }

    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        stderr += data.toString()
        process.stderr.write(data)
      })
    }

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code })
      } else {
        reject({ stdout, stderr, code })
      }
    })
  })
}

/**
 * Parse svelte-check output to extract error count
 */
function parseErrorCount(output) {
  const match = output.match(/(\d+)\s+error/)
  return match ? parseInt(match[1]) : null
}

/**
 * Get current error count
 */
async function getErrorCount() {
  try {
    const result = await executeCommand('npm', ['run', 'check:svelte'], {
      stdio: ['inherit', 'pipe', 'pipe']
    })
    const count = parseErrorCount(result.stdout)
    return count
  } catch (error) {
    log.error(`Failed to get error count: ${error.message}`)
    return null
  }
}

/**
 * Cycle 1: Fix easy clusters
 */
async function cycle1(multibar) {
  log.header('CYCLE 1: Fix Easy Clusters (High-Pattern Errors)')
  log.info('Expected outcome: ~50% reduction (12k → 6k)')

  const cycleStart = Date.now()
  const startCount = await getErrorCount()
  if (startCount) {
    log.metric('Starting error count', startCount)
  }

  try {
    // Run GPU clustering pipeline
    log.progress('Running GPU-accelerated clustering analysis...')
    phaseProgressBar.update(0, { phase: colors.yellow + 'Clustering' + colors.reset })
    await executeCommand('npm', ['run', 'phase72:gpu:pipeline'])

    const elapsed1 = Math.floor((Date.now() - startTime) / 1000)
    updateProgress(elapsed1, 33)

    // ACE identifies and fixes top clusters
    log.progress('ACE analyzing top error clusters...')
    phaseProgressBar.update(33, { phase: colors.yellow + 'ACE Analyze' + colors.reset })
    await executeCommand('npm', ['run', 'ace:execute'])

    const elapsed2 = Math.floor((Date.now() - startTime) / 1000)
    updateProgress(elapsed2, 66)

    // Verify improvement
    log.progress('Verifying improvements...')
    phaseProgressBar.update(66, { phase: colors.yellow + 'Verify    ' + colors.reset })
    const result = await executeCommand('npm', ['run', 'check:svelte'], {
      stdio: ['inherit', 'pipe', 'pipe']
    })

    const elapsed3 = Math.floor((Date.now() - startTime) / 1000)
    updateProgress(elapsed3, 100)

    const endCount = parseErrorCount(result.stdout)
    if (endCount && startCount) {
      const reduction = startCount - endCount
      const percentage = ((reduction / startCount) * 100).toFixed(1)
      log.success(`Cycle 1 complete: ${startCount} → ${endCount} (${percentage}% reduction)`)
      return { startCount, endCount, reduction, percentage }
    }
  } catch (error) {
    log.error(`Cycle 1 failed: ${error.message}`)
    throw error
  }
}

/**
 * Cycle 2: Re-cluster remaining errors
 */
async function cycle2(multibar) {
  log.header('CYCLE 2: Re-Cluster Remaining Errors')
  log.info('Expected outcome: ~75% cumulative reduction (6k → 3k)')

  const cycleStart = Date.now()
  const startCount = await getErrorCount()
  if (startCount) {
    log.metric('Starting error count', startCount)
  }

  try {
    // Re-analyze remaining errors with tighter clustering
    log.progress('Re-clustering remaining ~6k errors...')
    phaseProgressBar.update(0, { phase: colors.yellow + 'Clustering' + colors.reset })
    await executeCommand('npm', ['run', 'phase72:gpu:pipeline'])

    const elapsed1 = Math.floor((Date.now() - startTime) / 1000)
    updateProgress(elapsed1, 33)

    // ACE handles second wave (medium-complexity patterns)
    log.progress('ACE analyzing medium-complexity patterns...')
    phaseProgressBar.update(33, { phase: colors.yellow + 'ACE Analyze' + colors.reset })
    await executeCommand('npm', ['run', 'ace:execute'])

    const elapsed2 = Math.floor((Date.now() - startTime) / 1000)
    updateProgress(elapsed2, 66)

    // Check progress
    log.progress('Checking progress...')
    phaseProgressBar.update(66, { phase: colors.yellow + 'Verify    ' + colors.reset })
    const result = await executeCommand('npm', ['run', 'check:svelte'], {
      stdio: ['inherit', 'pipe', 'pipe']
    })

    const elapsed3 = Math.floor((Date.now() - startTime) / 1000)
    updateProgress(elapsed3, 100)

    const endCount = parseErrorCount(result.stdout)
    if (endCount && startCount) {
      const reduction = startCount - endCount
      const percentage = ((reduction / startCount) * 100).toFixed(1)
      log.success(`Cycle 2 complete: ${startCount} → ${endCount} (${percentage}% reduction)`)
      return { startCount, endCount, reduction, percentage }
    }
  } catch (error) {
    log.error(`Cycle 2 failed: ${error.message}`)
    throw error
  }
}

/**
 * Cycle 3: Final polish pass
 */
async function cycle3(multibar) {
  log.header('CYCLE 3: Final Polish Pass')
  log.info('Expected outcome: ~90%+ cumulative reduction (3k → 1k-200)')

  const cycleStart = Date.now()
  const startCount = await getErrorCount()
  if (startCount) {
    log.metric('Starting error count', startCount)
  }

  try {
    // One more GPU clustering pass on remaining errors
    log.progress('Final GPU clustering pass on ~3k errors...')
    phaseProgressBar.update(0, { phase: colors.yellow + 'Clustering' + colors.reset })
    await executeCommand('npm', ['run', 'phase72:gpu:pipeline'])

    const elapsed1 = Math.floor((Date.now() - startTime) / 1000)
    updateProgress(elapsed1, 33)

    // ACE tackles the hardest remaining patterns
    log.progress('ACE analyzing hardest remaining patterns...')
    phaseProgressBar.update(33, { phase: colors.yellow + 'ACE Final ' + colors.reset })
    await executeCommand('npm', ['run', 'ace:execute'])

    const elapsed2 = Math.floor((Date.now() - startTime) / 1000)
    updateProgress(elapsed2, 66)

    // Final verification
    log.progress('Final verification...')
    phaseProgressBar.update(66, { phase: colors.yellow + 'Verify    ' + colors.reset })
    const result = await executeCommand('npm', ['run', 'check:svelte'], {
      stdio: ['inherit', 'pipe', 'pipe']
    })

    const elapsed3 = Math.floor((Date.now() - startTime) / 1000)
    updateProgress(elapsed3, 100)

    const endCount = parseErrorCount(result.stdout)
    if (endCount && startCount) {
      const reduction = startCount - endCount
      const percentage = ((reduction / startCount) * 100).toFixed(1)
      log.success(`Cycle 3 complete: ${startCount} → ${endCount} (${percentage}% reduction)`)
      return { startCount, endCount, reduction, percentage }
    }
  } catch (error) {
    log.error(`Cycle 3 failed: ${error.message}`)
    throw error
  }
}

/**
 * Main orchestration
 */
async function main() {
  log.header('Phase 72 Automated Iterative Error Fix Loop')
  log.info('GPU-accelerated clustering + ACE autonomous fixes')

  const multibar = initializeProgressBars()

  const results = {
    cycle1: null,
    cycle2: null,
    cycle3: null,
    totalReduction: 0,
    totalPercentage: 0
  }

  try {
    // Get initial count
    const initialCount = await getErrorCount()
    log.metric('Initial error count', initialCount)

    // Run cycles
    log.info('Starting 3-cycle workflow...\n')

    results.cycle1 = await cycle1(multibar)
    log.info('Waiting before Cycle 2...')
    await new Promise(resolve => setTimeout(resolve, 2000))

    results.cycle2 = await cycle2(multibar)
    log.info('Waiting before Cycle 3...')
    await new Promise(resolve => setTimeout(resolve, 2000))

    results.cycle3 = await cycle3(multibar)

    // Stop progress bars
    multibar.stop()

    // Summary
    log.header('WORKFLOW COMPLETE')
    log.metric('Cycle 1 reduction', `${results.cycle1.reduction} errors (${results.cycle1.percentage}%)`)
    log.metric('Cycle 2 reduction', `${results.cycle2.reduction} errors (${results.cycle2.percentage}%)`)
    log.metric('Cycle 3 reduction', `${results.cycle3.reduction} errors (${results.cycle3.percentage}%)`)

    const finalCount = results.cycle3.endCount
    const totalReduction = initialCount - finalCount
    const totalPercentage = ((totalReduction / initialCount) * 100).toFixed(1)

    log.metric('Total reduction', `${totalReduction} errors (${totalPercentage}%)`)
    log.metric('Final error count', finalCount)

    // Save results
    const reportPath = path.join(projectRoot, 'phase72-iteration-results.json')
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      initialCount,
      finalCount,
      totalReduction,
      totalPercentage,
      cycles: results
    }, null, 2))

    log.success(`Results saved to ${reportPath}`)
    log.success('Phase 72 iteration complete!')

  } catch (error) {
    log.error(`Workflow failed: ${error.message}`)
    process.exit(1)
  }
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    log.error(error.message)
    process.exit(1)
  })
}

export { cycle1, cycle2, cycle3, getErrorCount }
