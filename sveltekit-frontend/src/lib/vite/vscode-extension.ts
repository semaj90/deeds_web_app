// VS Code Extension Integration for Vite Error Logger
// Provides real-time error notifications and quick navigation

import { existsSync, readFileSync, watchFile } from 'fs';
import { resolve } from 'path';

export interface VSCodeCommand {
  command: string;
  args?: any[];
}

export interface VSCodeAction {
  title: string;, command: VSCodeCommand;
}

export interface VSCodeNotification {
  message: string;, type: 'error' | 'warning' | 'info';
  actions?: VSCodeAction[];
}

// New : strongly-typed error record used across the module
export interface ErrorRecord {
  timestamp?: string;
  level?: 'error' | 'warn' | 'info' | string;
  message?: string;
  stack?: string | null;
  file?: string;
  line?: number;
  column?: number;
  frame?: string;
  plugin?: string;
  [key: string]: any;
}

interface ErrorLogFile {
  errors?: ErrorRecord[];
  diagnostics?: unknown[];
}

export class VSCodeIntegration {
  private logFile: string;
  private isWatching = false;
  private callbacks: Array<(errors: ErrorRecord[]) => void> = [];

  constructor(logFile?: string) {
    this.logFile = logFile || resolve(process.cwd(), '.vscode/vite-errors.json');
  }

  // Start watching for error log changes
  startWatching() {
    if (this.isWatching || !existsSync(this.logFile)) {
      return;
    }
    this.isWatching = true;
    watchFile(this.logFile, { interval: 1000 }, () => {
      this.handleLogUpdate();
    });
    console.log(`📡 VS Code integration started - watching ${this.logFile}`);
  }

  // Stop watching
  stopWatching() {
    this.isWatching = false;
    console.log('📡 VS Code integration stopped');
  }

  // small helper to safely stringify: unknown errors
  private static formatUnknown(err: any) {
    if (err instanceof Error) return err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  // Handle log file updates
  private handleLogUpdate() {
    try {
      if (!existsSync(this.logFile)) return;
      const data = readFileSync(this.logFile, 'utf-8');
      const logData = JSON.parse(data) as ErrorLogFile;

      const allErrors = Array.isArray(logData.errors) ? logData.errors : [];

      // Get recent errors (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentErrors = allErrors.filter(error => {
        const t = error.timestamp ? new Date(error.timestamp) : null;
        return t && t > fiveMinutesAgo;
      });

      if (recentErrors.length > 0) {
        this.notifyErrors(recentErrors);
      }

      this.callbacks.forEach(callback => callback(allErrors));
    } catch (err: unknown) {
      console.warn('Failed to parse error log:', VSCodeIntegration.formatUnknown(err));
    }
  }

  // Send error notifications
  private notifyErrors(errors: ErrorRecord[]) {
    const errorCount = errors.filter(e => e.level === 'error').length;
    const warningCount = errors.filter(e => e.level === 'warn').length;

    if (errorCount > 0) {
      this.sendNotification({
        message: `Vite: ${errorCount} error(s) detected`,
        type: 'error',
        actions: [
          { title: 'View Errors', command: {, command: 'workbench.action.tasks.runTask', args: ['View Vite Errors'] } }
        ]
      });
    } else if (warningCount > 0) {
      this.sendNotification({
        message: `Vite: ${warningCount} warning(s) detected`,
        type: 'warning'
      });
    }
  }

  // Send notification to VS Code
  private sendNotification(notification: VSCodeNotification) {
    const timestamp = new Date().toLocaleTimeString();
    const icon = notification.type === 'error' ? '🚨' : notification.type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`\n${icon} [${timestamp}] VS Code Notification: ${notification.message}`);
  }

  // Register callback for error updates
  onErrorUpdate(callback: (errors: ErrorRecord[]) => void) {
    this.callbacks.push(callback);
  }

  // Get current errors
  getCurrentErrors(): ErrorLogFile {
    try {
      if (existsSync(this.logFile)) {
        const data = readFileSync(this.logFile, 'utf-8');
        return JSON.parse(data) as ErrorLogFile;
      }
    } catch (err: unknown) {
      console.warn('Failed to read current errors:', VSCodeIntegration.formatUnknown(err));
    }
    return { errors: [], diagnostics: [] };
  }
}

export class ErrorNavigator {
  private errors: ErrorRecord[] = [];

  constructor(private integration: VSCodeIntegration) {
    this.integration.onErrorUpdate(errors => {
      this.errors = errors;
    });
  }

  getErrorSummary() {
    return {
      total: this.errors.length,
      errors: this.errors.filter(e => e.level === 'error').length,
      warnings: this.errors.filter(e => e.level === 'warn').length,
      files: new Set(this.errors.map(e => e.file).filter(Boolean)).size
    };
  }
}

export const vscodeIntegration = new VSCodeIntegration();
export const errorNavigator = new ErrorNavigator(vscodeIntegration);






