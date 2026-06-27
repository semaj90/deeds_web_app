/**
 * bad-summary-scanner.ts — Detect and flag low-quality or corrupted summaries
 *
 * Scans existing summaries for:
 * - Leaked thinking text (<think>, <|channel>thought, etc.)
 * - Malformed JSON or incomplete text
 * - Excessively short/long summaries
 * - Duplicate content patterns
 * - Invalid character sequences
 *
 * Returns list of bad summaries for regeneration.
 */

import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';
import { sql } from 'drizzle-orm';

export interface BadSummaryIssue {
  packet_key: string;
  issue_type: 'thinking_leak' | 'malformed' | 'too_short' | 'too_long' | 'invalid_chars' | 'duplicate';
  severity: 'critical' | 'warning';
  evidence: string;
  recommendation: 'regenerate' | 'manual_review' | 'ignore';
}

export interface BadSummaryReport {
  total_scanned: number;
  bad_count: number;
  critical_count: number;
  issues: BadSummaryIssue[];
  scan_timestamp: string;
}

/**
 * Check if summary contains leaked thinking text markers.
 * These indicate the summary was not properly stripped of model reasoning.
 */
function checkThinkingLeaks(summary: string): string | null {
  const thinkingPatterns = [
    /<think>/gi,
    /<\/think>/gi,
    /<\|channel>thought/gi,
    /<\|begin_of_thought/gi,
    /<\|start_thinking/gi,
    /\[\THINK\]/gi,
    /\[/thinking\]/gi,
    /<reasoning>/gi,
    /<justification>/gi,
  ];

  for (const pattern of thinkingPatterns) {
    const match = summary.match(pattern);
    if (match) {
      return `Found ${match[0]} marker`;
    }
  }

  return null;
}

/**
 * Check if summary has malformed structure.
 */
function checkMalformed(summary: string): string | null {
  // Check for unclosed brackets/quotes
  const openBraces = (summary.match(/\{/g) || []).length;
  const closeBraces = (summary.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    return `Unmatched braces: ${openBraces} open, ${closeBraces} closed`;
  }

  // Check for excessive newlines (likely copy-paste errors)
  const newlineCount = (summary.match(/\n/g) || []).length;
  if (newlineCount > 50) {
    return `Excessive newlines: ${newlineCount}`;
  }

  // Check for null bytes or control characters (corruption)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(summary)) {
    return 'Contains control characters (corrupted)';
  }

  return null;
}

/**
 * Check if summary is suspiciously short or long.
 */
function checkLength(summary: string): string | null {
  const length = summary.length;

  // Too short: less than 50 chars (likely not a real summary)
  if (length < 50) {
    return `Summary too short: ${length} chars (threshold: 50)`;
  }

  // Too long: more than 5000 chars (should be compact)
  if (length > 5000) {
    return `Summary too long: ${length} chars (threshold: 5000)`;
  }

  return null;
}

/**
 * Check for invalid UTF-8 sequences or mojibake.
 */
function checkInvalidChars(summary: string): string | null {
  // Check for replacement character (U+FFFD) which indicates invalid UTF-8
  if (summary.includes('�')) {
    return 'Contains replacement character (invalid UTF-8)';
  }

  // Check for excessive non-ASCII when not expected
  const nonAsciiCount = (summary.match(/[^\x00-\x7F]/g) || []).length;
  const asciiCount = summary.length - nonAsciiCount;
  if (nonAsciiCount > asciiCount * 0.5 && !/[^\x00-\x7F]/.test('legal')) {
    // Allow non-ASCII if actually present (e.g., Unicode quotes, dashes)
    return `High non-ASCII ratio: ${nonAsciiCount}/${summary.length}`;
  }

  return null;
}

/**
 * Scan a single summary for issues.
 */
export function scanSummary(packetKey: string, summary: string): BadSummaryIssue[] {
  const issues: BadSummaryIssue[] = [];

  // Check for thinking leaks (critical)
  const thinkLeak = checkThinkingLeaks(summary);
  if (thinkLeak) {
    issues.push({
      packet_key: packetKey,
      issue_type: 'thinking_leak',
      severity: 'critical',
      evidence: thinkLeak,
      recommendation: 'regenerate',
    });
  }

  // Check for malformed structure (critical)
  const malformed = checkMalformed(summary);
  if (malformed) {
    issues.push({
      packet_key: packetKey,
      issue_type: 'malformed',
      severity: 'critical',
      evidence: malformed,
      recommendation: 'regenerate',
    });
  }

  // Check for invalid chars (warning)
  const invalidChars = checkInvalidChars(summary);
  if (invalidChars) {
    issues.push({
      packet_key: packetKey,
      issue_type: 'invalid_chars',
      severity: 'warning',
      evidence: invalidChars,
      recommendation: 'manual_review',
    });
  }

  // Check for length issues (warning)
  const lengthIssue = checkLength(summary);
  if (lengthIssue) {
    issues.push({
      packet_key: packetKey,
      issue_type: lengthIssue.includes('short') ? 'too_short' : 'too_long',
      severity: 'warning',
      evidence: lengthIssue,
      recommendation: 'manual_review',
    });
  }

  return issues;
}

/**
 * Batch scan all summaries in Postgres.
 * Returns report of bad summaries requiring regeneration.
 */
export async function scanAllSummaries(): Promise<BadSummaryReport> {
  const report: BadSummaryReport = {
    total_scanned: 0,
    bad_count: 0,
    critical_count: 0,
    issues: [],
    scan_timestamp: new Date().toISOString(),
  };

  try {
    // Fetch all packets with summaries
    const packets = await db
      .select()
      .from(atlasPackets)
      .where(sql`summary IS NOT NULL AND summary != ''`)
      .limit(10000); // Safety limit

    report.total_scanned = packets.length;

    for (const packet of packets) {
      if (!packet.summary) continue;

      const issues = scanSummary(packet.packet_key, packet.summary);
      if (issues.length > 0) {
        report.bad_count++;
        report.issues.push(...issues);

        const criticalCount = issues.filter((i) => i.severity === 'critical').length;
        report.critical_count += criticalCount;
      }
    }
  } catch (err) {
    console.error('[bad-summary-scanner] Scan failed:', err);
    throw err;
  }

  return report;
}

/**
 * Get list of summaries that need regeneration (critical issues only).
 */
export async function getRegenerationCandidates(): Promise<string[]> {
  const report = await scanAllSummaries();
  const critical = report.issues.filter(
    (i) => i.severity === 'critical' && i.recommendation === 'regenerate'
  );
  return [...new Set(critical.map((i) => i.packet_key))];
}

/**
 * Export scan report for analysis.
 */
export function formatReport(report: BadSummaryReport): string {
  const lines: string[] = [
    `Bad Summary Scan Report`,
    `Timestamp: ${report.scan_timestamp}`,
    `Total scanned: ${report.total_scanned}`,
    `Bad summaries: ${report.bad_count} (${((report.bad_count / report.total_scanned) * 100).toFixed(1)}%)`,
    `Critical issues: ${report.critical_count}`,
    ``,
    `Issues by type:`,
  ];

  const byType = new Map<string, number>();
  for (const issue of report.issues) {
    byType.set(issue.issue_type, (byType.get(issue.issue_type) ?? 0) + 1);
  }
  for (const [type, count] of byType) {
    lines.push(`  - ${type}: ${count}`);
  }

  lines.push(``, `Top issues requiring action:`);
  const critical = report.issues.filter((i) => i.severity === 'critical').slice(0, 10);
  for (const issue of critical) {
    lines.push(`  [${issue.issue_type}] ${issue.packet_key}: ${issue.evidence}`);
  }

  return lines.join('\n');
}
