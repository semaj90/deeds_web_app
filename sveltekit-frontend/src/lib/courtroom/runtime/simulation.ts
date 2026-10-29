import { initialState, step, type Input, type State, type Story } from '../story/engine';
import { reconcileScene, type CharacterAdapter } from './actor-runtime';

export const TICKS_PER_SECOND = 30;
const STEP_MS = 1000 / TICKS_PER_SECOND;

/** Browser-scheduled, bounded 30Hz deterministic story loop; renderer is independent. */
export class CourtroomSimulation {
  state: State;
  private accumulator = 0;
  private priorFrame: number | null = null;
  private frame: number | null = null;
  private active = false;
  private subscribers = new Set<(state: State) => void>();
  constructor(public readonly story: Story, private adapter: CharacterAdapter) {
    this.state = initialState(story);
  }
  dispatch(input: Input): State {
    const previous = this.state;
    this.state = step(this.story, previous, input);
    reconcileScene(previous, this.state, this.adapter);
    for (const notify of this.subscribers) notify(this.state);
    return this.state;
  }
  subscribe(fn: (state: State) => void): () => void {
    this.subscribers.add(fn); fn(this.state);
    return () => this.subscribers.delete(fn);
  }
  start(): void {
    if (this.active) return;
    if (typeof requestAnimationFrame !== 'function') throw new Error('Browser only');
    this.active = true;
    const update = (now: number) => {
      if (!this.active) return;
      if (this.priorFrame !== null) {
        this.accumulator += Math.min(250, Math.max(0, now - this.priorFrame));
        let processed = 0;
        while (this.accumulator >= STEP_MS && processed++ < 5) {
          this.dispatch({ type: 'TICK' });
          this.accumulator -= STEP_MS;
        }
        if (processed > 5) this.accumulator = 0;
      }
      this.priorFrame = now;
      this.frame = requestAnimationFrame(update);
    };
    this.frame = requestAnimationFrame(update);
  }
  stop(): void {
    this.active = false;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.priorFrame = null;
    this.accumulator = 0;
  }
  dispose(): void { this.stop(); this.subscribers.clear(); this.adapter.dispose?.(); }
}
