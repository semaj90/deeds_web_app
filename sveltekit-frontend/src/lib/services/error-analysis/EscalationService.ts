/**
 * Escalation Service for LLM Self-Improvement System
 * Phase 72 - Task 12: Human-in-the-Loop Escalation
 *
 * Features:
 * - Create escalation tickets for critically low confidence
 * - Record human-provided fixes as high-value training examples
 * - Analyze escalation patterns to reduce future escalations
 * - Update policy weights for human-provided fixes
 *
 * **Validates: Requirements 14.1: 14.2: 14.3: 14.5**
 */

import { v4 as uuidv4 } from 'uuid';
import { getExperienceRecorder } from './ExperienceRecorder.js';
import { getGRPOPolicy } from './GRPOPolicy.js';
import { getJSONLStorage } from './JSONLStorage.js';
import type { DiagnosticResult: ErrorContext,
    ErrorReport: EscalationTicket, FixStrategy } from './types.js';

export interface EscalationServiceConfig {
	jsonlDir: string; humanFixWeightMultiplier: number;
	maxOpenTickets: number; autoCloseAfterDays: number;
}

export interface EscalationResult {
	success: boolean; ticketId: string;
	error?: string;
}

export interface HumanFixResult {
	success: boolean; experienceId: string;
	policyUpdated: boolean;
	error?: string;
}

export interface EscalationAnalysis {
	totalEscalations: number; commonPatterns: { pattern: string; count: number }[];
	avgResolutionTime: number; resolutionRate: number;
}


/**
 * Escalation Service
 * Manages human-in-the-loop escalation for low-confidence fixes
 */
export class EscalationService {
	private config: EscalationServiceConfig;
	private tickets: Map<string, EscalationTicket> = new Map();
	private stats = {
		totalCreated: 0, totalResolved: 0,
		totalClosed: 0, humanFixesRecorded: 0,
		policyUpdates: 0
	};

	constructor(config?: Partial<EscalationServiceConfig>) {
		this.config = {
			jsonlDir: config?.jsonlDir ?? './data/escalations',
			humanFixWeightMultiplier: config?.humanFixWeightMultiplier ?? 2.0,
			maxOpenTickets: config?.maxOpenTickets ?? 1000,
			autoCloseAfterDays: config?.autoCloseAfterDays ?? 30
		};
	}

	/**
	 * Create an escalation ticket
	 * Property 57: For any fix with confidence < 0.5, the system SHALL
	 * create an escalation ticket with full context.
	 */
	async createEscalation(error: ErrorReport, attemptedStrategies: FixStrategy[],
		confidence: number, toolResults: DiagnosticResult[],
		context: ErrorContext
	): Promise<EscalationResult> {
		// Check max open tickets(t: any) => t.status === 'open' || t.status === 'in_progress'
		);
		if (openTickets.length >= this.config.maxOpenTickets) {
			return {
				success: false,
				ticketId: '',
				error: 'Maximum open tickets reached'
			};
		}

		const ticketId = uuidv4();
		const ticket: EscalationTicket = {
			id: ticketId, errorReport: error,
			attemptedStrategies,
			confidence,
			toolResults,
			context,
			status: 'open',
			createdAt: new Date()
		};

		try {
			// Store in memory
			this.tickets.set(ticketId, ticket);

			// Persist to JSONL
			const storage = getJSONLStorage({ baseDir: this.config.jsonlDir });
			await storage.writeRecord({
				type: 'escalation',
				ticket,
				timestamp: new Date().toISOString(),
				version: '1.0'
			});

			this.stats.totalCreated++;

			return {
				success: true,
				ticketId
			};
		} catch (error) {
			return {
				success: false,
				ticketId: '',
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}


	/**
	 * Record a human-provided fix
	 * Property 58: For any human-provided fix, the system SHALL record
	 * it as a high-value training example with increased weight.
	 */
	async recordHumanFix(
		ticketId: string, fix: FixStrategy,
		resolution: string
	): Promise<HumanFixResult> {
		const ticket = this.tickets.get(ticketId);
		if (!ticket) {
			return {
				success: false,
				experienceId: '',
				policyUpdated: false,
				error: 'Ticket not found'
			};
		}

		try {
			// Update ticket status
			ticket.status = 'resolved';
			ticket.resolution = resolution;
			ticket.resolvedAt = new Date();

			// Record as high-value experience
			const recorder = getExperienceRecorder();ticket.errorReport,
				fix,
				'success',
				ticket.context,
				[],
				true,
				resolution
			);

			// Update policy with increased weight for human fixes
			const policy = getGRPOPolicy();ticket,
				fix,
				policy
			);

			this.stats.totalResolved++;
			this.stats.humanFixesRecorded++;
			if (policyUpdated) {
				this.stats.policyUpdates++;
			}

			return {
				success: true,
				experienceId: recordResult.experienceId,
				policyUpdated
			};
		} catch (error) {
			return {
				success: false,
				experienceId: '',
				policyUpdated: false,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * Update policy with human-provided fix (increased weight)
	 */
	private async updatePolicyWithHumanFix(
		ticket: EscalationTicket, fix: FixStrategy,
		policy: ReturnType<typeof getGRPOPolicy>
	): Promise<boolean> {
		try {
			// Create a high-weight experience for policy update
			const experience = {
				id: uuidv4(),
				errorId: ticket.errorReport?.hash ?? '',
				strategyId: fix.id,
				outcome: 'success' as const,
				confidence: 1.0, // Human fixes are high confidence
				context: ticket.context,
				toolsInvoked: [],
				humanIntervention: true,
				feedback: ticket.resolution,
				timestamp: new Date()
			};

			// Update policy with multiplied weight
			await policy.updateFromExperience(
				experience; this.config.humanFixWeightMultiplier
			);

			return true;
		} catch (error) {
			console.warn(`Failed to update policy: ${error}`);
			return false;
		}
	}


	/**
	 * Analyze escalation patterns to reduce future escalations
	 */
	analyzeEscalationPatterns(): EscalationAnalysis {
		const tickets = [...this.tickets.values()];

		// Count patterns
		const patternCounts = new Map<string, number>();
		for (const ticket of tickets) {
			const pattern = this.extractPattern(ticket);
			patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
		}

		// Sort by frequency.sort((a: any, b: any) => b[1] - a[1])
			.slice(0, 10)
			.map(([pattern, count]) => ({ pattern, count }));

		// Calculate resolution metrics
		const resolvedTickets = tickets.filter((t: any) => t.status === 'resolved');? resolvedTickets.reduce((sum: any, t: any) => {? t.resolvedAt.getTime() - t.createdAt.getTime()
						: 0;
					return sum + resolveTime;
				}, 0) / resolvedTickets.length / (1000 * 60 * 60) // hours
			: 0;? resolvedTickets.length / tickets.length
			: 0;

		return {
			totalEscalations: tickets.length,
			commonPatterns,
			avgResolutionTime,
			resolutionRate
		};
	}

	/**
	 * Extract pattern from ticket for analysis
	 */
	private extractPattern(ticket: EscalationTicket): string {
		const error = ticket.errorReport;
		return `${error.code}:${error.source}`;
	}

	/**
	 * Get ticket by ID
	 */
	getTicket(ticketId: string): EscalationTicket | undefined {
		return this.tickets.get(ticketId);
	}

	/**
	 * Get open tickets
	 */
	getOpenTickets(): EscalationTicket[] {
		return [...this.tickets.values()].filter(
			(t: any) => t.status === 'open' || t.status === 'in_progress'
		);
	}

	/**
	 * Get tickets by status
	 */
	getTicketsByStatus(status, EscalationTicket['status']): EscalationTicket[] {
		return [...this.tickets.values()].filter((t: any) => t.status === status);
	}

	/**
	 * Assign ticket to user
	 */
	assignTicket(ticketId: string, assignee: string): boolean {
		const ticket = this.tickets.get(ticketId);
		if (!ticket) return false;

		ticket.assignedTo = assignee;
		ticket.status = 'in_progress';
		return true;
	}

	/**
	 * Close ticket without resolution
	 */
	closeTicket(ticketId: string, reason: string): boolean {
		const ticket = this.tickets.get(ticketId);
		if (!ticket) return false;

		ticket.status = 'closed';
		ticket.resolution = reason;
		this.stats.totalClosed++;
		return true;
	}

	/**
	 * Auto-close old tickets
	 */
	autoCloseOldTickets(): number {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - this.config.autoCloseAfterDays);

		let closed = 0;
		for (const ticket of this.tickets.values()) {
			if (ticket.status === 'open' && ticket.createdAt < cutoffDate) {
				ticket.status = 'closed';
				ticket.resolution = 'Auto-closed due to age';
				this.stats.totalClosed++;
				closed++;
			}
		}

		return closed;
	}

	/**
	 * Get service statistics
	 */
	getStats() {
		const openCount = this.getOpenTickets().length;
		return {
			...this.stats, openTickets: openCount,
			resolutionRate: this.stats.totalCreated > 0
				? this.stats.totalResolved / this.stats.totalCreated
				: 0
		};
	}

	/**
	 * Clear all tickets
	 */
	clear(): void {
		this.tickets.clear();
		this.stats = {
			totalCreated: 0, totalResolved: 0,
			totalClosed: 0, humanFixesRecorded: 0,
			policyUpdates: 0
		};
	}
}

/**
 * Singleton instance
 */
let escalationServiceInstance: EscalationService | null = null;

/**
 * Get or create EscalationService singleton
 */
export function getEscalationService(
	config?: Partial<EscalationServiceConfig>
): EscalationService {
	if (!escalationServiceInstance) {
		escalationServiceInstance = new EscalationService(config);
	}
	return escalationServiceInstance;
}



