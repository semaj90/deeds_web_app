import type { ActorSpec, Mood, State, Story } from '../story/engine';

export interface CharacterAdapter {
  /** Adapter to the EXISTING Babylon scene and Mixamo retarget owner. */
  setAnimation(actorId: string, clip: string): void;
  setEmotion(actorId: string, mood: Mood): void;
  setDialogue(actorId: string, text: string): void;
  setPhase(phase: State['phase']): void;
  /** Walk an actor to a floor-plan station (story `move` cue). Optional: adapters without movement ignore it. */
  moveActor?(actorId: string, station: string): void;
  dispose?(): void;
}

export type ActorDefinition = ActorSpec & {
  skeletonProfile?: string;
  assetPackId?: string;
  knownFacts?: string[];
  allowedTopics?: string[];
};

export class ActorRegistry {
  private actors = new Map<string, ActorDefinition>();
  register(actor: ActorDefinition): void {
    if (!/^[a-z0-9_-]{1,64}$/i.test(actor.id)) throw new Error('Invalid actor ID');
    if (this.actors.has(actor.id)) throw new Error(`Duplicate actor: ${actor.id}`);
    this.actors.set(actor.id, structuredClone(actor));
  }
  find(id: string): Readonly<ActorDefinition> | undefined { return this.actors.get(id); }
  list(): ReadonlyArray<ActorDefinition> { return [...this.actors.values()]; }
  static fromStory(story: Story): ActorRegistry {
    const registry = new ActorRegistry();
    story.actors.forEach(actor => registry.register(actor));
    return registry;
  }
}

/** Apply only changed story outputs to Babylon; never mutate the state object. */
export function reconcileScene(previous: State, next: State, adapter: CharacterAdapter): void {
  if (previous.phase !== next.phase) adapter.setPhase(next.phase);
  for (const [id, clip] of Object.entries(next.animations)) {
    if (previous.animations[id] !== clip) adapter.setAnimation(id, clip);
  }
  for (const [id, emotion] of Object.entries(next.mood)) {
    if (previous.mood[id] !== emotion) adapter.setEmotion(id, emotion);
  }
  for (const [id, station] of Object.entries(next.positions ?? {})) {
    if ((previous.positions ?? {})[id] !== station) adapter.moveActor?.(id, station);
  }
  for (const line of next.transcript.slice(previous.transcript.length)) {
    adapter.setDialogue(line.actorId, line.text);
  }
}
