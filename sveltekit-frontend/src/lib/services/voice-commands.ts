/**
 * Voice Command Recognition System
 *
 * Detects voice commands in user speech and executes actions.
 * Commands are parsed from transcripts and don't appear in chat messages.
 *
 * Supported commands:
 * - "send message" / "send it" → Send current text
 * - "clear chat" / "new conversation" → Reset conversation
 * - "stop speaking" / "be quiet" → Stop TTS playback
 * - "repeat that" / "say that again" → Re-speak last AI message
 * - "louder" / "quieter" → Adjust TTS volume
 * - "faster" / "slower" → Adjust TTS speed
 * - "start listening" / "stop listening" → Toggle STT
 */

export interface VoiceCommand {
	pattern: RegExp;
	action: () => void | Promise<void>;
	label: string;
	category: 'control' | 'tts' | 'stt';
}

export interface VoiceCommandMatch {
	command: VoiceCommand;
	transcript: string;
	confidence: number;
}

export class VoiceCommandRegistry {
	private commands: VoiceCommand[] = [];
	private enabled = true;

	/**
	 * Register a voice command with pattern matching
	 */
	register(command: VoiceCommand): void {
		this.commands.push(command);
	}

	/**
	 * Parse transcript and find matching command
	 * Returns null if no command matches
	 */
	match(transcript: string): VoiceCommandMatch | null {
		if (!this.enabled) return null;

		const normalized = transcript.toLowerCase().trim();

		// Exact match (highest priority)
		for (const command of this.commands) {
			if (command.pattern.test(normalized)) {
				return {
					command,
					transcript: normalized,
					confidence: 1.0
				};
			}
		}

		// Fuzzy match (for noisy transcripts)
		for (const command of this.commands) {
			const pattern = command.pattern.source.replace(/[()^$]/g, '');
			const keywords = pattern.split('|').map(k => k.trim());

			for (const keyword of keywords) {
				if (normalized.includes(keyword)) {
					return {
						command,
						transcript: normalized,
						confidence: 0.7
					};
				}
			}
		}

		return null;
	}

	/**
	 * Execute command if matched in transcript
	 * Returns true if command was executed
	 */
	async execute(transcript: string): Promise<boolean> {
		const match = this.match(transcript);
		if (!match) return false;

		try {
			await match.command.action();
			return true;
		} catch (err) {
			console.error('[VoiceCommands] Execution failed:', err);
			return false;
		}
	}

	/**
	 * Get all registered commands (for UI display)
	 */
	getCommands(category?: VoiceCommand['category']): VoiceCommand[] {
		if (!category) return this.commands;
		return this.commands.filter(c => c.category === category);
	}

	/**
	 * Enable/disable command recognition
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	/**
	 * Clear all commands (for testing)
	 */
	clear(): void {
		this.commands = [];
	}
}

// Singleton instance
export const voiceCommands = new VoiceCommandRegistry();

/**
 * Pre-defined command patterns (registered by components)
 */
export const COMMAND_PATTERNS = {
	// Control commands
	SEND: /^(send|send it|send message)$/i,
	CLEAR: /^(clear|clear chat|new conversation|reset)$/i,
	CANCEL: /^(cancel|never mind|forget it)$/i,

	// TTS commands
	STOP_SPEAKING: /^(stop|be quiet|stop speaking|silence|shut up)$/i,
	REPEAT: /^(repeat|say that again|repeat that|what did you say)$/i,
	LOUDER: /^(louder|increase volume|turn it up)$/i,
	QUIETER: /^(quieter|decrease volume|turn it down)$/i,
	FASTER: /^(faster|speed up|talk faster)$/i,
	SLOWER: /^(slower|slow down|talk slower)$/i,

	// STT commands
	START_LISTENING: /^(start listening|listen|wake up)$/i,
	STOP_LISTENING: /^(stop listening|don't listen|mute)$/i,

	// Utility commands
	HELP: /^(help|what can you do|show commands)$/i,
	UNDO: /^(undo|go back|revert)$/i
};

/**
 * Command execution feedback
 */
export interface CommandFeedback {
	type: 'success' | 'error' | 'info';
	message: string;
	duration?: number; // ms to show toast
}

/**
 * Create command feedback object
 */
export function createFeedback(
	type: CommandFeedback['type'],
	message: string,
	duration = 2000
): CommandFeedback {
	return { type, message, duration };
}

/**
 * Levenshtein distance for fuzzy matching (optional enhancement)
 */
export function levenshteinDistance(a: string, b: string): number {
	const matrix: number[][] = [];

	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}

	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // substitution
					matrix[i][j - 1] + 1,     // insertion
					matrix[i - 1][j] + 1      // deletion
				);
			}
		}
	}

	return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-1) between two strings
 */
export function stringSimilarity(a: string, b: string): number {
	const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
	const maxLength = Math.max(a.length, b.length);
	return 1 - distance / maxLength;
}
