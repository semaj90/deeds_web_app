/**
 * Code Ingest Watcher
 * Continuous file watcher for .cpp/.hpp/.ts/.svelte/.md files
 * Triggers ingestion pipeline on file changes
 */

import { watch } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';
import { CodeIngestionPipeline } from '../pipeline/code_ingestion_pipeline';

export interface WatcherConfig {
  rootPath: string;
  patterns: string[];
  debounceMs: number;
  ignorePatterns: string[];
}

export class CodeIngestWatcher extends EventEmitter {
  private pipeline: CodeIngestionPipeline;
  private watchers: Map<string, NodeJS.Timeout> = new Map();
  private config: WatcherConfig;
  private isRunning = false;

  constructor(config: WatcherConfig) {
    super();
    this.config = config;
    this.pipeline = new CodeIngestionPipeline();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const patterns = [
      join(this.config.rootPath, '**/*.cpp'),
      join(this.config.rootPath, '**/*.hpp'),
      join(this.config.rootPath, '**/*.ts'),
      join(this.config.rootPath, '**/*.svelte'),
      join(this.config.rootPath, '**/*.md'),
    ];

    for (const pattern of patterns) {
      this.watchDirectory(pattern);
    }

    this.emit('started');
    console.log('Code ingest watcher started');
  }

  private watchDirectory(pattern: string): void {
    const watcher = watch(pattern, { recursive: true }, (eventType, filename) => {
      if (!filename || this.shouldIgnore(filename)) return;

      // Debounce file changes
      const key = filename;
      if (this.watchers.has(key)) {
        clearTimeout(this.watchers.get(key)!);
      }

      const timeout = setTimeout(async () => {
        try {
          await this.pipeline.ingest(filename);
          this.emit('ingested', { file: filename, timestamp: new Date() });
        } catch (error) {
          this.emit('error', { file: filename, error });
        }
        this.watchers.delete(key);
      }, this.config.debounceMs);

      this.watchers.set(key, timeout);
    });

    watcher.on('error', (error) => {
      this.emit('error', { error });
    });
  }

  private shouldIgnore(filename: string): boolean {
    return this.config.ignorePatterns.some(pattern => filename.includes(pattern));
  }

  stop(): void {
    this.watchers.forEach(timeout => clearTimeout(timeout));
    this.watchers.clear();
    this.isRunning = false;
    this.emit('stopped');
  }

  getStatus(): { isRunning: boolean; watchedFiles: number } {
    return {
      isRunning: this.isRunning,
      watchedFiles: this.watchers.size,
    };
  }
}

// Export singleton
export const watcher = new CodeIngestWatcher({
  rootPath: process.cwd(),
  patterns: ['**/*.cpp', '**/*.hpp', '**/*.ts', '**/*.svelte', '**/*.md'],
  debounceMs: 500,
  ignorePatterns: ['node_modules', '.git', 'dist', 'build'],
});
