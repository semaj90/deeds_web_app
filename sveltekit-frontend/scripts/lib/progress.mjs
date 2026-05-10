/**
 * progress.mjs — ETA progress bar for long-running pipeline scripts.
 *
 * Zero dependencies. Pure Node.js process.stdout.write.
 *
 * Usage:
 *   import { Progress } from './scripts/lib/progress.mjs';
 *
 *   const p = new Progress('Embedding chunks', totalChunks);
 *   for (const chunk of chunks) {
 *     await embed(chunk);
 *     p.tick();
 *   }
 *   p.done();
 *
 * Output (updated in-place):
 *   Embedding chunks  [████████████░░░░░░░░]  60% │ 600/1000 │ elapsed: 12s │ eta: 8s
 */

const FILL = '█';
const EMPTY = '░';
const BAR_WIDTH = 20;

function fmtSec(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export class Progress {
  /**
   * @param {string} label   - Description shown before the bar
   * @param {number} total   - Total steps (use 0 for indeterminate)
   * @param {{ silent?: boolean }} [opts]
   */
  constructor(label, total = 0, opts = {}) {
    this.label = label;
    this.total = total;
    this.current = 0;
    this.startMs = Date.now();
    this.silent = opts.silent ?? !process.stdout.isTTY;
    this._lastLen = 0;
    if (!this.silent) this._render();
  }

  /** Advance by n steps (default 1) */
  tick(n = 1) {
    this.current = Math.min(this.current + n, this.total || Infinity);
    if (!this.silent) this._render();
  }

  /** Set absolute value */
  set(n) {
    this.current = Math.min(n, this.total || Infinity);
    if (!this.silent) this._render();
  }

  /** Update label (e.g. show current file being processed) */
  setLabel(label) {
    this.label = label;
    if (!this.silent) this._render();
  }

  /** Finish and print a newline */
  done(msg) {
    this.current = this.total || this.current;
    if (!this.silent) {
      this._render();
      process.stdout.write('\n');
    }
    const elapsed = Date.now() - this.startMs;
    if (msg) console.log(msg);
    else console.log(`✅ ${this.label} — done in ${fmtSec(elapsed)}`);
  }

  _render() {
    const elapsed = Date.now() - this.startMs;
    const pct = this.total > 0 ? Math.min(this.current / this.total, 1) : 0;
    const filled = Math.round(pct * BAR_WIDTH);

    const bar = FILL.repeat(filled) + EMPTY.repeat(BAR_WIDTH - filled);
    const pctStr = this.total > 0 ? `${Math.round(pct * 100)}%` : `${this.current} done`;
    const countStr = this.total > 0 ? `${this.current}/${this.total}` : `${this.current}`;

    let eta = '';
    if (this.total > 0 && this.current > 0 && this.current < this.total) {
      const rate = this.current / elapsed;
      const remaining = (this.total - this.current) / rate;
      eta = ` │ eta: ${fmtSec(remaining)}`;
    }

    const line = `\r${this.label}  [${bar}]  ${pctStr.padStart(4)} │ ${countStr} │ elapsed: ${fmtSec(elapsed)}${eta}  `;

    // Pad to overwrite previous line
    const padded = line.padEnd(this._lastLen);
    this._lastLen = line.length;
    process.stdout.write(padded);
  }
}

/**
 * Wrap an async iterable with a progress bar.
 *
 * @template T
 * @param {AsyncIterable<T>|Iterable<T>} iterable
 * @param {string} label
 * @param {number} [total]
 * @returns {AsyncGenerator<T>}
 */
export async function* withProgress(iterable, label, total = 0) {
  const p = new Progress(label, total);
  for await (const item of iterable) {
    yield item;
    p.tick();
  }
  p.done();
}

/**
 * Run an array of tasks with a progress bar, returning results.
 * Tasks run sequentially — use Promise.all externally for parallel.
 *
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} fn
 * @param {string} label
 * @returns {Promise<R[]>}
 */
export async function mapWithProgress(items, fn, label) {
  const p = new Progress(label, items.length);
  const results = [];
  for (let i = 0; i < items.length; i++) {
    results.push(await fn(items[i], i));
    p.tick();
  }
  p.done();
  return results;
}
