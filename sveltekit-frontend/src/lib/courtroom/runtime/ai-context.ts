import type { State, Story } from '../story/engine';
import type { ActorRegistry } from './actor-runtime';

export interface DialogueRequest {
  caseId: string;
  storyVersion: number;
  actorId: string;
  phase: State['phase'];
  topic: string;
  evidenceIds: string[];
}
export interface DialogueProposal {
	proposalOnly: true;
  caseId: string;
  actorId: string;
  phase: State['phase'];
  evidenceIds: string[];
  allowedIntents: readonly string[];
  modelRevision: string;
  text: string;
  intent: 'answer' | 'decline' | 'ask_clarification';
  emotion?: 'neutral' | 'confident' | 'nervous' | 'angry' | 'relieved';
}
const allowedIntents = ['answer', 'decline', 'ask_clarification'] as const;
export function makeDialogueRequest(story: Story, state: State, registry: ActorRegistry, actorId: string, topic: string): DialogueRequest {
  const actor = registry.find(actorId);
  if (!actor) throw new Error('Unknown actor');
  if (!topic.trim() || topic.length > 300) throw new Error('Invalid topic');
  if (actor.allowedTopics?.length && !actor.allowedTopics.includes(topic)) throw new Error('Topic unavailable');
  return { caseId: story.id, storyVersion: story.version, actorId, phase: state.phase, topic,
    evidenceIds: [...state.evidence] };
}
export function validateDialogueProposal(request: DialogueRequest, value: unknown): DialogueProposal | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Partial<DialogueProposal>;
  if (p.proposalOnly !== true || p.caseId !== request.caseId || p.actorId !== request.actorId || p.phase !== request.phase ||
      typeof p.modelRevision !== 'string' || !p.modelRevision.trim() || p.modelRevision.length > 200 ||
      !Array.isArray(p.evidenceIds) || p.evidenceIds.length !== request.evidenceIds.length ||
      !p.evidenceIds.every((id, index) => id === request.evidenceIds[index]) ||
      !Array.isArray(p.allowedIntents) || p.allowedIntents.length !== allowedIntents.length ||
      !allowedIntents.every((intent, index) => p.allowedIntents?.[index] === intent) ||
      typeof p.text !== 'string' || !p.text.trim() || p.text.length > 500) return null;
  if (!allowedIntents.includes(p.intent as typeof allowedIntents[number])) return null;
  if (p.emotion && !['neutral','confident','nervous','angry','relieved'].includes(p.emotion)) return null;
  return { proposalOnly: true, caseId: p.caseId, actorId: p.actorId, phase: p.phase, evidenceIds: [...p.evidenceIds],
    allowedIntents: [...allowedIntents], modelRevision: p.modelRevision, text: p.text, intent: p.intent!,
    ...(p.emotion ? {emotion:p.emotion}: {}) };
}
/** LLM output is non-authoritative. It cannot mint evidence, fire cues or advance phases. */
export async function requestDialogue(
  request: DialogueRequest,
  endpoint = '/api/courtroom/dialogue',
  signal?: AbortSignal
): Promise<DialogueProposal | null> {
  const response = await fetch(endpoint, { method:'POST', headers:{ 'content-type':'application/json' },
    body:JSON.stringify(request), signal });
  if (!response.ok) return null;
  return validateDialogueProposal(request, await response.json());
}
