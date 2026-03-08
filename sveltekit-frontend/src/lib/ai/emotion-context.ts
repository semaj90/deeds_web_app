import { browser } from '$app/environment';

/**
 * Emotion Context Module
 *
 * Tracks user emotional state from multiple signals:
 * 1. Text sentiment (typing analysis)
 * 2. Webcam face emotion (opt-in)
 * 3. Behavioral signals (typing speed, pause patterns, deletions)
 *
 * Feeds into LLM system prompt to adapt tone and complexity.
 */

// ── Types ──────────────────────────────────────────────────────────

export type FaceEmotion = 'happy' | 'sad' | 'angry' | 'fear' | 'surprise' | 'disgust' | 'neutral';

export type TextEmotion =
	| 'admiration' | 'amusement' | 'anger' | 'annoyance' | 'approval'
	| 'caring' | 'confusion' | 'curiosity' | 'desire' | 'disappointment'
	| 'disapproval' | 'disgust' | 'embarrassment' | 'excitement' | 'fear'
	| 'gratitude' | 'grief' | 'joy' | 'love' | 'nervousness'
	| 'optimism' | 'pride' | 'realization' | 'relief' | 'remorse'
	| 'sadness' | 'surprise' | 'neutral';

export type BehavioralSignal = 'rushed' | 'careful' | 'frustrated' | 'engaged' | 'distracted' | 'idle';

export interface EmotionState {
	face: { emotion: FaceEmotion; confidence: number } | null;
	text: { emotions: Array<{ label: TextEmotion; score: number }>; dominant: TextEmotion } | null;
	behavioral: BehavioralSignal;
	composite: {
		mood: 'positive' | 'negative' | 'neutral' | 'mixed';
		intensity: number; // 0-1
		needsSimplification: boolean;
		needsEncouragement: boolean;
		needsPatience: boolean;
	};
	timestamp: number;
}

// ── State ──────────────────────────────────────────────────────────

let currentState: EmotionState = createDefaultState();

function createDefaultState(): EmotionState {
	return {
		face: null,
		text: null,
		behavioral: 'engaged',
		composite: {
			mood: 'neutral',
			intensity: 0.5,
			needsSimplification: false,
			needsEncouragement: false,
			needsPatience: false,
		},
		timestamp: Date.now(),
	};
}

// ── Text Emotion Analysis ──────────────────────────────────────────

const NEGATIVE_EMOTIONS = new Set<TextEmotion>([
	'anger', 'annoyance', 'disappointment', 'disapproval', 'disgust',
	'embarrassment', 'fear', 'grief', 'nervousness', 'remorse', 'sadness',
]);

const POSITIVE_EMOTIONS = new Set<TextEmotion>([
	'admiration', 'amusement', 'approval', 'caring', 'curiosity',
	'excitement', 'gratitude', 'joy', 'love', 'optimism', 'pride', 'relief',
]);

const CONFUSED_EMOTIONS = new Set<TextEmotion>(['confusion', 'realization', 'surprise']);

/**
 * Analyze text for emotional content using keyword heuristics.
 * Lightweight fallback when ONNX model isn't loaded.
 */
export function analyzeTextEmotion(text: string): EmotionState['text'] {
	const lower = text.toLowerCase();
	const emotions: Array<{ label: TextEmotion; score: number }> = [];

	// Keyword-based heuristic (fast, no model needed)
	const patterns: Array<[TextEmotion, RegExp, number]> = [
		['anger', /\b(angry|furious|outraged|frustrated|annoyed|mad)\b/i, 0.8],
		['confusion', /\b(confused|unclear|don't understand|what do you mean|huh|lost)\b/i, 0.7],
		['curiosity', /\b(how|why|what|when|where|curious|wonder|interested)\b/i, 0.5],
		['fear', /\b(worried|scared|afraid|anxious|nervous|concerned)\b/i, 0.7],
		['joy', /\b(happy|glad|great|awesome|excellent|wonderful|love it)\b/i, 0.8],
		['sadness', /\b(sad|disappointed|unhappy|depressed|heartbroken)\b/i, 0.7],
		['gratitude', /\b(thanks|thank you|appreciate|grateful)\b/i, 0.8],
		['annoyance', /\b(ugh|annoying|irritating|stop|enough|seriously)\b/i, 0.7],
		['excitement', /\b(wow|amazing|incredible|!{2,}|excited)\b/i, 0.7],
		['disapproval', /\b(no|wrong|bad|terrible|awful|hate)\b/i, 0.6],
	];

	for (const [emotion, pattern, baseScore] of patterns) {
		if (pattern.test(lower)) {
			emotions.push({ label: emotion, score: baseScore });
		}
	}

	if (emotions.length === 0) {
		emotions.push({ label: 'neutral', score: 0.6 });
	}

	emotions.sort((a, b) => b.score - a.score);
	return { emotions, dominant: emotions[0].label };
}

// ── Behavioral Signal Detection ────────────────────────────────────

export function detectBehavioralSignal(metrics: {
	typingSpeed: number; // chars per minute
	pauseTime: number; // ms since last keystroke
	deletionRate: number; // deletions / total keystrokes
	sessionDuration: number; // ms
}): BehavioralSignal {
	if (metrics.pauseTime > 120000) return 'idle'; // 2+ minutes
	if (metrics.pauseTime > 30000) return 'distracted'; // 30s+
	if (metrics.deletionRate > 0.4) return 'frustrated'; // 40%+ deletions
	if (metrics.typingSpeed > 300) return 'rushed'; // Very fast typing
	if (metrics.typingSpeed < 60 && metrics.pauseTime < 5000) return 'careful';
	return 'engaged';
}

// ── Composite Mood Calculation ─────────────────────────────────────

function computeComposite(state: EmotionState): EmotionState['composite'] {
	let positiveScore = 0;
	let negativeScore = 0;
	let confusedScore = 0;

	// Text emotions
	if (state.text) {
		for (const { label, score } of state.text.emotions) {
			if (POSITIVE_EMOTIONS.has(label)) positiveScore += score;
			if (NEGATIVE_EMOTIONS.has(label)) negativeScore += score;
			if (CONFUSED_EMOTIONS.has(label)) confusedScore += score;
		}
	}

	// Face emotion (weighted higher — more reliable than text keywords)
	if (state.face && state.face.confidence > 0.5) {
		const faceWeight = 1.5;
		if (['happy', 'surprise'].includes(state.face.emotion)) positiveScore += state.face.confidence * faceWeight;
		if (['sad', 'angry', 'fear', 'disgust'].includes(state.face.emotion)) negativeScore += state.face.confidence * faceWeight;
	}

	// Behavioral signals
	if (state.behavioral === 'frustrated') negativeScore += 0.6;
	if (state.behavioral === 'idle' || state.behavioral === 'distracted') negativeScore += 0.3;
	if (state.behavioral === 'engaged') positiveScore += 0.3;

	const total = positiveScore + negativeScore + confusedScore + 0.001;
	const intensity = Math.min(1, total / 3);

	let mood: EmotionState['composite']['mood'] = 'neutral';
	if (positiveScore > negativeScore * 1.5) mood = 'positive';
	else if (negativeScore > positiveScore * 1.5) mood = 'negative';
	else if (positiveScore > 0.3 && negativeScore > 0.3) mood = 'mixed';

	return {
		mood,
		intensity,
		needsSimplification: confusedScore > 0.5 || state.behavioral === 'frustrated',
		needsEncouragement: negativeScore > 1.0 || state.behavioral === 'frustrated',
		needsPatience: state.behavioral === 'idle' || state.behavioral === 'distracted',
	};
}

// ── Public API ─────────────────────────────────────────────────────

/** Update text emotion from user's latest message */
export function updateTextEmotion(text: string): EmotionState {
	currentState.text = analyzeTextEmotion(text);
	currentState.composite = computeComposite(currentState);
	currentState.timestamp = Date.now();
	return currentState;
}

/** Update face emotion from webcam classifier */
export function updateFaceEmotion(emotion: FaceEmotion, confidence: number): EmotionState {
	currentState.face = { emotion, confidence };
	currentState.composite = computeComposite(currentState);
	currentState.timestamp = Date.now();
	return currentState;
}

/** Update behavioral signal from typing metrics */
export function updateBehavior(metrics: Parameters<typeof detectBehavioralSignal>[0]): EmotionState {
	currentState.behavioral = detectBehavioralSignal(metrics);
	currentState.composite = computeComposite(currentState);
	currentState.timestamp = Date.now();
	return currentState;
}

/**
 * Analyze a webcam frame via the Ollama VLM endpoint (Gemma 3 SigLIP).
 * Sends a base64 image to the multimodal model, parses the emotion label,
 * and calls updateFaceEmotion() to update the composite state.
 *
 * @param imageBase64 - Base64-encoded webcam frame (JPEG/PNG)
 * @param ollamaUrl - Ollama API base URL (default: /api/ollama for proxied access)
 * @returns The updated EmotionState, or null if analysis failed
 */
export async function analyzeWebcamFrame(
	imageBase64: string,
	ollamaUrl: string = '/api/ollama'
): Promise<EmotionState | null> {
	if (!browser) return null;

	const EMOTION_MAP: Record<string, FaceEmotion> = {
		happy: 'happy', joy: 'happy', smile: 'happy', smiling: 'happy',
		sad: 'sad', sadness: 'sad', unhappy: 'sad',
		angry: 'angry', anger: 'angry', furious: 'angry',
		fear: 'fear', afraid: 'fear', scared: 'fear', fearful: 'fear',
		surprise: 'surprise', surprised: 'surprise', shocked: 'surprise',
		disgust: 'disgust', disgusted: 'disgust',
		neutral: 'neutral', calm: 'neutral',
	};

	try {
		const res = await fetch(`${ollamaUrl}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{
						role: 'user',
						content: 'What emotion is this person expressing? Respond with ONLY one word: happy, sad, angry, fear, surprise, disgust, or neutral.',
						images: [imageBase64],
					},
				],
				stream: false,
			}),
		});

		if (!res.ok) return null;

		const data = await res.json();
		const responseText = (data?.message?.content ?? '').toLowerCase().trim();

		// Parse emotion from VLM response
		let detectedEmotion: FaceEmotion = 'neutral';
		let confidence = 0.6;

		for (const [keyword, emotion] of Object.entries(EMOTION_MAP)) {
			if (responseText.includes(keyword)) {
				detectedEmotion = emotion;
				confidence = 0.8; // VLM detection = higher confidence than keyword heuristic
				break;
			}
		}

		return updateFaceEmotion(detectedEmotion, confidence);
	} catch {
		return null;
	}
}

/** Get current emotion state */
export function getEmotionState(): EmotionState {
	return currentState;
}

/** Reset emotion state */
export function resetEmotionState(): void {
	currentState = createDefaultState();
}

/**
 * Generate LLM system prompt modifier based on current emotion state.
 * Appended to the base system prompt to make responses adaptive.
 */
export function getEmotionSystemPrompt(): string {
	const { composite, face, text, behavioral } = currentState;
	const parts: string[] = [];

	// Only add emotion context if we have signals
	if (!face && !text && behavioral === 'engaged') return '';

	parts.push('\n[Emotion Context]');

	if (composite.mood === 'negative') {
		parts.push('The user appears frustrated or upset. Respond with empathy, patience, and encouragement.');
	} else if (composite.mood === 'positive') {
		parts.push('The user appears engaged and positive. Match their energy with enthusiasm.');
	} else if (composite.mood === 'mixed') {
		parts.push('The user has mixed emotions. Be balanced and supportive.');
	}

	if (composite.needsSimplification) {
		parts.push('The user seems confused. Use simpler language, shorter sentences, and provide examples.');
	}

	if (composite.needsEncouragement) {
		parts.push('Offer encouragement and reassurance. Acknowledge their effort.');
	}

	if (composite.needsPatience) {
		parts.push('The user has been inactive. Welcome them back warmly and summarize where they left off.');
	}

	if (face && face.confidence > 0.6) {
		parts.push(`Facial expression: ${face.emotion} (${(face.confidence * 100).toFixed(0)}% confidence).`);
	}

	if (text && text.dominant !== 'neutral') {
		parts.push(`Text sentiment: ${text.dominant}.`);
	}

	return parts.join(' ');
}
