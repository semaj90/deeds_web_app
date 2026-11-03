type LaneStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'BLOCKED';

type LaneResult = {
	status: LaneStatus;
	details: string;
};

type VerificationGateResult = {
	feature: string;
	task_source: string;
	lanes: Record<'smoke' | 'story' | 'atlas_traversal' | 'cubic_adversarial', LaneResult>;
	commands: string[];
	failures: string[];
	verdict: 'PASS' | 'FAIL' | 'PARTIAL' | 'BLOCKED';
};

export class VerificationGate {
	public async runFullAudit(featureName: string, taskSource: string): Promise<VerificationGateResult> {
		const notRun = (): LaneResult => ({
			status: 'BLOCKED',
			details: 'NOT_RUN: use the receipt-bound scripts/verify/run-verification.mjs executor',
		});
		return {
			feature: featureName,
			task_source: taskSource,
			lanes: {
				smoke: notRun(),
				story: notRun(),
				atlas_traversal: notRun(),
				cubic_adversarial: notRun(),
			},
			commands: [],
			failures: ['VERIFICATION_GATE_NOT_EXECUTED'],
			verdict: 'BLOCKED',
		};
	}
}
