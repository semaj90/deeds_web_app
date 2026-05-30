import fs from 'fs';
import path from 'path';
import { getRedis } from '$lib/server/redis.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

const REWARDS_DIR = path.join(process.cwd(), '../memory/rewards');
const LEDGER_FILE = path.join(process.cwd(), '../.opencode/outcome-ledger.ndjson');

type PipelineEvent = 'reward:update' | 'ledger:append';
type PipelineCallback = (data: any) => void | Promise<void>;

class OfflineDataPipeline {
  private listeners = new Map<PipelineEvent, Set<PipelineCallback>>();
  private watchers: fs.FSWatcher[] = [];

  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories() {
    try {
      fs.mkdirSync(REWARDS_DIR, { recursive: true });
      fs.mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
    } catch (err) {
      console.warn('[OfflinePipeline] Failed to create directories:', err);
    }
  }

  /**
   * Register an event listener for offline data synchronization events
   */
  public addEventListener(event: PipelineEvent, callback: PipelineCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Trigger registered event callbacks
   */
  private triggerEvent(event: PipelineEvent, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[OfflinePipeline] Error in listener callback for ${event}:`, err);
        }
      }
    }
  }

  /**
   * Start filesystem listeners to track offline file modifications
   */
  public start() {
    console.log(`[OfflinePipeline] Starting watchers...`);
    console.log(`  - Rewards: ${REWARDS_DIR}`);
    console.log(`  - Ledger: ${LEDGER_FILE}`);

    // Watch rewards directory
    if (fs.existsSync(REWARDS_DIR)) {
      const rewardWatcher = fs.watch(REWARDS_DIR, async (eventType, filename) => {
        if (filename && filename.endsWith('.json')) {
          console.log(`[OfflinePipeline] Detected rewards update: ${filename}`);
          await this.syncRewardsFile(filename);
        }
      });
      this.watchers.push(rewardWatcher);
    }

    // Watch outcome ledger file
    if (fs.existsSync(LEDGER_FILE)) {
      let filePosition = fs.statSync(LEDGER_FILE).size;
      const ledgerWatcher = fs.watch(LEDGER_FILE, async (eventType) => {
        if (eventType === 'change') {
          filePosition = await this.readLedgerAppends(filePosition);
        }
      });
      this.watchers.push(ledgerWatcher);
    } else {
      // If ledger does not exist yet, watch parent directory to detect its creation
      const parentDir = path.dirname(LEDGER_FILE);
      const parentWatcher = fs.watch(parentDir, (eventType, filename) => {
        if (filename === path.basename(LEDGER_FILE)) {
          console.log(`[OfflinePipeline] Ledger file created, restarting watchers.`);
          this.stop();
          this.start();
        }
      });
      this.watchers.push(parentWatcher);
    }
  }

  /**
   * Stop all active directory/file watchers
   */
  public stop() {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }

  /**
   * Synchronize reward file contents to Redis cache & trigger listeners
   */
  private async syncRewardsFile(filename: string) {
    const filePath = path.join(REWARDS_DIR, filename);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.trim()) return;

      const data = fastJsonParse<Record<string, any>>(content);
      const redis = getRedis();

      if (filename === 'tool-performance.json') {
        const pipeline = redis.pipeline();
        for (const [tool, stats] of Object.entries(data)) {
          pipeline.set(`rewards:tool:${tool}`, JSON.stringify(stats), 'EX', 86400); // 24h
        }
        await pipeline.exec();
        this.triggerEvent('reward:update', { type: 'tool', data });
      } else if (filename === 'sourceRef-performance.json') {
        const pipeline = redis.pipeline();
        for (const [ref, stats] of Object.entries(data)) {
          pipeline.set(`rewards:source-ref:${ref}`, JSON.stringify(stats), 'EX', 86400); // 24h
        }
        await pipeline.exec();
        this.triggerEvent('reward:update', { type: 'source-ref', data });
      } else if (filename === 'cluster-performance.json') {
        const pipeline = redis.pipeline();
        for (const [cluster, stats] of Object.entries(data)) {
          pipeline.set(`rewards:cluster:${cluster}`, JSON.stringify(stats), 'EX', 86400); // 24h
        }
        await pipeline.exec();
        this.triggerEvent('reward:update', { type: 'cluster', data });
      }
    } catch (err) {
      console.warn(`[OfflinePipeline] Failed to sync rewards file ${filename}:`, err);
    }
  }

  /**
   * Read new line appends from outcome ledger & trigger event callbacks
   */
  private async readLedgerAppends(startPosition: number): Promise<number> {
    try {
      const stats = fs.statSync(LEDGER_FILE);
      if (stats.size <= startPosition) return stats.size;

      const stream = fs.createReadStream(LEDGER_FILE, {
        encoding: 'utf8',
        start: startPosition,
        end: stats.size
      });

      let buffer = '';
      for await (const chunk of stream) {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete last line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = fastJsonParse(line);
            this.triggerEvent('ledger:append', entry);
          } catch (e) {
            console.warn('[OfflinePipeline] Failed to parse ledger line:', e);
          }
        }
      }
      return stats.size;
    } catch (err) {
      console.warn('[OfflinePipeline] Error reading ledger appends:', err);
      return startPosition;
    }
  }
}

// Export singleton instance
export const offlinePipeline = new OfflineDataPipeline();

/**
 * Convenience bootstrap helper called on application/server initialization
 */
export function startOfflinePipelineListener() {
  try {
    offlinePipeline.start();
  } catch (err) {
    console.error('[OfflinePipeline] Initialization failed:', err);
  }
}
