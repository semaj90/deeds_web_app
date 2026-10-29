/**
 * Offline emotion read of what the user typed, to pick the courtroom character's reaction (nod, shake, sad, angry,
 * surprised) the way a game picks a reaction from a dialogue choice. Deterministic and instant: a small weighted lexicon,
 * a three-word negation window, and punctuation cues. It is a proposal for an animation, never a fact about the user:
 * below the confidence floor it returns `neutral`, and the caller keeps the idle.
 *
 * A model-backed classifier (the :8095 NLP sidecar) could replace the lexicon later behind the same function; nothing
 * here needs it, and the courtroom must not wait on a model to react.
 */
import { courtroomAnimForEmotion, type CourtroomAnimType, type CourtroomEmotion } from './courtroom-types.js';

export interface TextEmotionRead {
	emotion: CourtroomEmotion;
	/** 0..1; neutral when nothing cleared the floor. */
	confidence: number;
	/** Words that carried the decision (for logs and tests; never shown as the user's "feelings"). */
	evidence: string[];
}

type Scored = Exclude<CourtroomEmotion, 'neutral'>;

const LEXICON: Record<Scored, readonly string[]> = {
	happy: ['thank', 'thanks', 'great', 'good', 'glad', 'happy', 'excellent', 'agree', 'yes', 'perfect', 'wonderful', 'relieved', 'pleased', 'fair'],
	sad: ['sorry', 'sad', 'unfortunately', 'regret', 'grief', 'lost', 'tragic', 'mourn', 'hopeless', 'cry', 'devastated', 'apologize'],
	angry: ['angry', 'furious', 'outrageous', 'liar', 'lying', 'lie', 'ridiculous', 'absurd', 'unacceptable', 'objection', 'insult', 'insulting', 'damn', 'hate', 'enough', 'stop', 'refuse', 'blame'],
	fear: ['afraid', 'scared', 'fear', 'worried', 'nervous', 'threat', 'threatened', 'terrified', 'anxious', 'panic', 'danger'],
	surprise: ['wow', 'shocking', 'shocked', 'unbelievable', 'suddenly', 'unexpected', 'really', 'seriously', 'surprised', 'whoa', 'never', 'impossible'],
	disgust: ['disgusting', 'gross', 'sickening', 'vile', 'revolting', 'appalling', 'shameful', 'despicable', 'filthy'],
};

const NEGATORS = new Set(['not', 'no', "don't", 'dont', "didn't", 'didnt', "isn't", 'isnt', "wasn't", 'wasnt', 'never', 'hardly', 'cannot', "can't", 'cant']);
/** A negated word stops counting for its emotion; "not happy" leans sad rather than happy. */
const NEGATION_FLIPS: Partial<Record<Scored, Scored>> = { happy: 'sad' };

/** Words that carry a reaction on their own (courtroom shorthand), counted double. */
const STRONG = new Set(['objection', 'liar', 'outrageous', 'furious', 'disgusting', 'shocking', 'terrified', 'devastated']);

const INDEX = new Map<string, Scored>();
for (const [emotion, words] of Object.entries(LEXICON) as [Scored, readonly string[]][]) {
	for (const w of words) if (!INDEX.has(w)) INDEX.set(w, emotion);
}

export const TEXT_EMOTION_CONFIDENCE_FLOOR = 0.34;
const MAX_CHARS = 2000;

export function readTextEmotion(input: string): TextEmotionRead {
	const text = typeof input === 'string' ? input.slice(0, MAX_CHARS) : '';
	const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
	const scores: Record<Scored, number> = { happy: 0, sad: 0, angry: 0, fear: 0, surprise: 0, disgust: 0 };
	const evidence: Record<Scored, string[]> = { happy: [], sad: [], angry: [], fear: [], surprise: [], disgust: [] };

	tokens.forEach((token, i) => {
		const emotion = INDEX.get(token);
		if (!emotion) return;
		const negated = tokens.slice(Math.max(0, i - 3), i).some((t) => NEGATORS.has(t));
		const target = negated ? NEGATION_FLIPS[emotion] : emotion;
		if (!target) return;
		scores[target] += negated ? 0.7 : STRONG.has(token) ? 2 : 1;
		evidence[target].push(negated ? `not ${token}` : token);
	});

	// Punctuation and shouting: they strengthen what was found, and "?!" alone reads as surprise.
	const bangs = (text.match(/!/g) ?? []).length;
	const shouted = tokens.length >= 2 && text === text.toUpperCase() && /[A-Z]{3,}/.test(text);
	if (/\?!|!\?/.test(text)) { scores.surprise += 0.8; evidence.surprise.push('?!'); }
	if (shouted) { scores.angry += 1; evidence.angry.push('ALL CAPS'); }
	if (bangs >= 2) {
		const lead = (Object.entries(scores) as [Scored, number][]).sort((a, b) => b[1] - a[1])[0];
		if (lead[1] > 0) { scores[lead[0]] += 0.4; evidence[lead[0]].push('!!'); }
	}

	const ranked = (Object.entries(scores) as [Scored, number][]).sort((a, b) => b[1] - a[1]);
	const [top, topScore] = ranked[0];
	const total = ranked.reduce((s, [, v]) => s + v, 0);
	if (topScore <= 0 || total <= 0) return { emotion: 'neutral', confidence: 0, evidence: [] };
	// Share of the evidence, scaled by how much there is: one ordinary word is below the floor, two agreeing words clear it.
	const confidence = Math.min(1, (topScore / total) * Math.min(1, 0.1 + 0.2 * topScore));
	if (confidence < TEXT_EMOTION_CONFIDENCE_FLOOR) return { emotion: 'neutral', confidence, evidence: [] };
	return { emotion: top, confidence, evidence: evidence[top] };
}

/** The reaction animation for typed text; `idle` when the read is neutral or unsure. */
export function animForUserText(text: string): CourtroomAnimType {
	return courtroomAnimForEmotion(readTextEmotion(text).emotion);
}
