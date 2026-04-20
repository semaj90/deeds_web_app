/**
 * Timeline-driven 3D reconstruction engine.
 * Loads keyframes from the DB and plays them back as Babylon.js animations,
 * synchronized with dialogue turns and camera transitions.
 */

export interface TimelineKeyframe {
	id: string;
	timeMs: number;
	characterRole: string;
	animType: string;
	animationId?: string | null;
	posX?: number | null;
	posY?: number | null;
	posZ?: number | null;
	rotY?: number | null;
	cameraView?: string | null;
	dialogueTurn?: number | null;
	effect?: string | null;
	evidenceUrl?: string | null;
	phase?: string | null;
}

export type TimelineState = 'idle' | 'playing' | 'paused' | 'seeking';

/**
 * Timeline engine that drives courtroom 3D reconstruction playback.
 * Manages ordered keyframes, playback position, and dispatches events
 * to the CourtroomScene for execution.
 */
export class TimelineEngine {
	// Reactive state
	state = $state<TimelineState>('idle');
	currentTimeMs = $state(0);
	totalDurationMs = $state(0);
	playbackSpeed = $state(1);
	currentKeyframeIndex = $state(-1);
	progress = $derived(this.totalDurationMs > 0 ? (this.currentTimeMs / this.totalDurationMs) * 100 : 0);

	keyframes: TimelineKeyframe[] = [];
	private executedIndices = new Set<number>();
	private animFrameId: number | null = null;
	private lastTickTime: number = 0;
	private onKeyframe: ((kf: TimelineKeyframe) => void) | null = null;

	/** Load keyframes (already sorted by timeMs) */
	loadKeyframes(keyframes: TimelineKeyframe[]): void {
		this.keyframes = keyframes.sort((a, b) => a.timeMs - b.timeMs);
		this.totalDurationMs = keyframes.length > 0
			? keyframes[keyframes.length - 1].timeMs + 2000 // add 2s buffer after last keyframe
			: 0;
		this.reset();
	}

	/** Register a callback for when keyframes are reached during playback */
	onKeyframeReached(callback: (kf: TimelineKeyframe) => void): void {
		this.onKeyframe = callback;
	}

	/** Start or resume playback */
	play(): void {
		if (this.state === 'playing') return;
		if (this.keyframes.length === 0) return;

		this.state = 'playing';
		this.lastTickTime = performance.now();
		this.tick();
	}

	/** Pause playback */
	pause(): void {
		if (this.state !== 'playing') return;
		this.state = 'paused';
		if (this.animFrameId !== null) {
			cancelAnimationFrame(this.animFrameId);
			this.animFrameId = null;
		}
	}

	/** Toggle play/pause */
	toggle(): void {
		if (this.state === 'playing') this.pause();
		else this.play();
	}

	/** Seek to a specific time */
	seekTo(timeMs: number): void {
		const wasPlaying = this.state === 'playing';
		if (wasPlaying) this.pause();

		this.currentTimeMs = Math.max(0, Math.min(timeMs, this.totalDurationMs));
		this.executedIndices.clear();

		// Execute all keyframes up to the seek point
		for (let i = 0; i < this.keyframes.length; i++) {
			if (this.keyframes[i].timeMs <= this.currentTimeMs) {
				this.executedIndices.add(i);
				this.currentKeyframeIndex = i;
				// Fire only the last keyframe per character role (snap to state)
			}
		}

		// Fire the latest keyframe for each role to set correct scene state
		const latestByRole = new Map<string, TimelineKeyframe>();
		for (let i = 0; i < this.keyframes.length; i++) {
			if (this.keyframes[i].timeMs <= this.currentTimeMs) {
				latestByRole.set(this.keyframes[i].characterRole, this.keyframes[i]);
			}
		}
		for (const kf of latestByRole.values()) {
			this.onKeyframe?.(kf);
		}

		this.state = 'idle';
		if (wasPlaying) this.play();
	}

	/** Seek to a specific dialogue turn */
	seekToTurn(turn: number): void {
		const kf = this.keyframes.find((k) => k.dialogueTurn === turn);
		if (kf) {
			this.seekTo(kf.timeMs);
		}
	}

	/** Jump to next keyframe */
	stepForward(): void {
		const nextIdx = this.currentKeyframeIndex + 1;
		if (nextIdx < this.keyframes.length) {
			this.seekTo(this.keyframes[nextIdx].timeMs);
		}
	}

	/** Jump to previous keyframe */
	stepBackward(): void {
		const prevIdx = Math.max(0, this.currentKeyframeIndex - 1);
		if (prevIdx >= 0 && prevIdx < this.keyframes.length) {
			this.seekTo(this.keyframes[prevIdx].timeMs);
		}
	}

	/** Set playback speed (0.25x to 4x) */
	setSpeed(speed: number): void {
		this.playbackSpeed = Math.max(0.25, Math.min(4, speed));
	}

	/** Reset to beginning */
	reset(): void {
		this.pause();
		this.currentTimeMs = 0;
		this.currentKeyframeIndex = -1;
		this.executedIndices.clear();
		this.state = 'idle';
	}

	/** Generate keyframes from a simulation dialogue history (auto-reconstruction) */
	static generateFromDialogue(
		dialogueHistory: Array<{
			phase: string;
			turn: number;
			speaker: string;
			role: string;
			content: string;
		}>,
		msPerTurn: number = 3000,
	): TimelineKeyframe[] {
		const keyframes: TimelineKeyframe[] = [];
		let timeMs = 0;

		for (const entry of dialogueHistory) {
			// Camera transition keyframe
			keyframes.push({
				id: `auto_cam_${entry.turn}`,
				timeMs,
				characterRole: entry.role,
				animType: 'idle',
				cameraView: ROLE_TO_VIEW[entry.role] ?? 'wide',
				dialogueTurn: entry.turn,
				phase: entry.phase,
			});

			// Speaking animation keyframe (200ms after camera move)
			keyframes.push({
				id: `auto_speak_${entry.turn}`,
				timeMs: timeMs + 200,
				characterRole: entry.role,
				animType: 'speaking',
				dialogueTurn: entry.turn,
				phase: entry.phase,
			});

			// Check for objection keywords
			const contentLower = entry.content.toLowerCase();
			if (contentLower.includes('objection') || contentLower.includes('sustained') || contentLower.includes('overruled')) {
				keyframes.push({
					id: `auto_objection_${entry.turn}`,
					timeMs: timeMs + 100,
					characterRole: entry.role,
					animType: 'objection',
					effect: 'screen_flash',
					dialogueTurn: entry.turn,
					phase: entry.phase,
				});
			}

			// If content mentions evidence, trigger present_evidence
			if (contentLower.includes('exhibit') || contentLower.includes('evidence') || contentLower.includes('document')) {
				keyframes.push({
					id: `auto_evidence_${entry.turn}`,
					timeMs: timeMs + 500,
					characterRole: entry.role,
					animType: 'present_evidence',
					dialogueTurn: entry.turn,
					phase: entry.phase,
				});
			}

			// Return to idle before next turn
			keyframes.push({
				id: `auto_idle_${entry.turn}`,
				timeMs: timeMs + msPerTurn - 400,
				characterRole: entry.role,
				animType: 'idle',
				dialogueTurn: entry.turn,
				phase: entry.phase,
			});

			timeMs += msPerTurn;
		}

		return keyframes.sort((a, b) => a.timeMs - b.timeMs);
	}

	private tick(): void {
		if (this.state !== 'playing') return;

		const now = performance.now();
		const delta = (now - this.lastTickTime) * this.playbackSpeed;
		this.lastTickTime = now;
		this.currentTimeMs += delta;

		// Check for keyframes that should execute
		for (let i = 0; i < this.keyframes.length; i++) {
			if (this.executedIndices.has(i)) continue;
			if (this.keyframes[i].timeMs <= this.currentTimeMs) {
				this.executedIndices.add(i);
				this.currentKeyframeIndex = i;
				this.onKeyframe?.(this.keyframes[i]);
			}
		}

		// Check for end of timeline
		if (this.currentTimeMs >= this.totalDurationMs) {
			this.currentTimeMs = this.totalDurationMs;
			this.state = 'idle';
			return;
		}

		this.animFrameId = requestAnimationFrame(() => this.tick());
	}

	dispose(): void {
		this.pause();
		this.keyframes = [];
		this.executedIndices.clear();
		this.onKeyframe = null;
	}
}

/** Map dialogue roles to camera views */
const ROLE_TO_VIEW: Record<string, string> = {
	prosecutor: 'prosecution',
	defense: 'defense',
	judge: 'judge',
	witness: 'witness',
	narrator: 'wide',
};