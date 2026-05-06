/**
 * Audit Triage Utility: Analyzes file-level audit signals to identify
 * directory-level hotspots and architectural risks.
 */
export async function triageAuditHotspots(files: Array<{ filePath: string; audit?: any }>) {
	const dirAudit = new Map<string, { totalScore: number, warnings: string[], criticalFiles: string[], count: number }>();

	for (const file of files) {
		const dir = file.filePath.split(/[/\\]/).slice(0, -1).join('/') || '.';
		const stats = dirAudit.get(dir) || { totalScore: 0, warnings: [], criticalFiles: [], count: 0 };

		stats.count++;
		if (file.audit?.score !== undefined) {
			stats.totalScore += file.audit.score;
			if (file.audit.score < 0.4) {
				stats.criticalFiles.push(file.filePath);
			}
		}

		if (Array.isArray(file.audit?.warnings)) {
			stats.warnings.push(...file.audit.warnings);
		}

		dirAudit.set(dir, stats);
	}

	return Array.from(dirAudit.entries()).map(([dir, stats]) => {
		const avgScore = stats.count > 0 ? stats.totalScore / stats.count : 1.0;
		return {
			path: dir,
			avgScore,
			warningCount: stats.warnings.length,
			criticalFiles: stats.criticalFiles.slice(0, 5),
			dominantWarnings: Array.from(new Set(stats.warnings)).slice(0, 3),
			riskLevel: avgScore < 0.4 ? 'CRITICAL' : avgScore < 0.7 ? 'WARNING' : 'STABLE'
		};
	}).sort((a, b) => a.avgScore - b.avgScore);
}

/**
 * Generates an "Audit Verdict" string for use in WikiNotes.
 */
export function generateAuditVerdict(hotspot: any): string {
	if (hotspot.riskLevel === 'STABLE') {
		return `✅ Directory is STABLE (Score: ${hotspot.avgScore.toFixed(2)}). No critical risks identified.`;
	}

	let verdict = hotspot.riskLevel === 'CRITICAL' 
		? `🚨 CRITICAL RISK (Score: ${hotspot.avgScore.toFixed(2)})`
		: `⚠️ WARNING (Score: ${hotspot.avgScore.toFixed(2)})`;

	verdict += `\n- Dominant issues: ${hotspot.dominantWarnings.join(', ') || 'General instability'}`;
	if (hotspot.criticalFiles.length > 0) {
		verdict += `\n- Critical files: ${hotspot.criticalFiles.join(', ')}`;
	}

	return verdict;
}
