/**
 * Agent Shell Machine
 * Lightweight state machine for the AI Agent Shell
 * Replaces xstate dependency with a minimal standalone implementation
 *
 * States: idle → processing → idle
 * Events: INPUT, SUBMIT, CLEAR, SET_MODE, ERROR, SUCCESS
 */

// Types
export interface ShellContext {
  input: string;
  history: string[];
  lastResult: unknown | null;
  error: string | null;
  mode: 'chat' | 'command' | 'analysis';
}

export type ShellEvent =
  | { type: 'INPUT'; value: string }
  | { type: 'SUBMIT' }
  | { type: 'CLEAR' }
  | { type: 'SET_MODE'; mode: ShellContext['mode'] }
  | { type: 'ERROR'; message: string }
  | { type: 'SUCCESS'; result: unknown };

export type ShellState = 'idle' | 'processing';

export interface ShellMachineSnapshot {
  state: ShellState;
  context: ShellContext;
}

type ShellListener = (snapshot: ShellMachineSnapshot) => void;

/**
 * Minimal state machine implementation (no xstate dependency)
 */
export class AgentShellMachine {
  private _state: ShellState = 'idle';
  private _context: ShellContext;
  private _listeners: Set<ShellListener> = new Set();

  constructor(initialContext?: Partial<ShellContext>) {
    this._context = {
      input: '',
      history: [],
      lastResult: null,
      error: null,
      mode: 'chat',
      ...initialContext,
    };
  }

  get state(): ShellState {
    return this._state;
  }

  get context(): Readonly<ShellContext> {
    return this._context;
  }

  get snapshot(): ShellMachineSnapshot {
    return { state: this._state, context: { ...this._context } };
  }

  /**
   * Subscribe to state/context changes
   */
  subscribe(listener: ShellListener): () => void {
    this._listeners.add(listener);
    // Immediately emit current state
    listener(this.snapshot);
    return () => this._listeners.delete(listener);
  }

  /**
   * Send an event to the state machine
   */
  send(event: ShellEvent): void {
    switch (this._state) {
      case 'idle':
        this.handleIdleState(event);
        break;
      case 'processing':
        this.handleProcessingState(event);
        break;
    }
    this.notify();
  }

  private handleIdleState(event: ShellEvent): void {
    switch (event.type) {
      case 'INPUT':
        this._context = { ...this._context, input: event.value };
        break;
      case 'SUBMIT':
        this._state = 'processing';
        break;
      case 'SET_MODE':
        this._context = { ...this._context, mode: event.mode };
        break;
      case 'CLEAR':
        this._context = {
          ...this._context,
          input: '',
          error: null,
          lastResult: null,
        };
        break;
    }
  }

  private handleProcessingState(event: ShellEvent): void {
    switch (event.type) {
      case 'SUCCESS':
        this._context = {
          ...this._context,
          lastResult: event.result,
          error: null,
          history:
            typeof event.result === 'string'
              ? [...this._context.history, event.result]
              : this._context.history,
        };
        this._state = 'idle';
        break;
      case 'ERROR':
        this._context = {
          ...this._context,
          error: event.message,
        };
        this._state = 'idle';
        break;
    }
  }

  private notify(): void {
    const snapshot = this.snapshot;
    for (const listener of this._listeners) {
      listener(snapshot);
    }
  }
}

/**
 * Factory function to create a new agent shell machine
 */
export function createAgentShellMachine(
  initialContext?: Partial<ShellContext>
): AgentShellMachine {
  return new AgentShellMachine(initialContext);
}

/**
 * Singleton instance for shared use
 */
let machineInstance: AgentShellMachine | null = null;

export function getAgentShellMachine(): AgentShellMachine {
  if (!machineInstance) {
    machineInstance = new AgentShellMachine();
  }
  return machineInstance;
}
