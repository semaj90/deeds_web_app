export type GateStatus = 'pass' | 'fail' | 'skip' | 'warn';

export interface GateCheck {
  id: string;
  status: GateStatus;
  message: string;
  detail?: unknown;
}

export interface GateReport {
  ts: string;
  overall: 'PASS' | 'FAIL';
  passed: number;
  failed: number;
  total?: number;
  checks: GateCheck[];
  meta?: Record<string, unknown>;
}

export interface RunOptions {
  /** Pass --json to the underlying script (suppress log output) */
  json?: boolean;
  /** Extra args forwarded to the script */
  args?: string[];
  /** Timeout in ms */
  timeout?: number;
}
