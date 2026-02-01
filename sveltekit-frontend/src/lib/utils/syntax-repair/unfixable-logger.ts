/**
 * Unfixable File Logger
 *
 * Logs files that cannot be automatically fixed and generates manual review reports.
 * Tracks fix success rate per pattern for analysis.
 *
 * Requirements: 1.6 - Generate manual review report for unfixable files
 */

import type { PatternMatcher } from './pattern-matcher';

/**
 * Represents an unfixable file entry
 */
export interface UnfixableEntry {
  filePath: string;
	errorType: string;
  errorMessage: string;
  lineNumber?: number;
  columnNumber?: number;
	attemptedPatterns: string[];
  reason: UnfixableReason;
	timestamp: Date;
}

/**
 * Reasons why a file cannot be automatically fixed
 */
export type UnfixableReason =
  | 'no-matching-pattern'
  | 'pattern-failed'
  | 'syntax-too-complex'
  | 'manual-review-required'
  | 'file-read-error'
  | 'file-write-error'
  | 'circular-dependency'
  | 'unknown';

/**
 * Pattern fix statistics
 */
export interface PatternStats {
  patternName: string;
	totalAttempts: number;
  successCount: number;
	failureCount: number;
  successRate: number;
	commonFailureReasons: Map<UnfixableReason, number>;
}

/**
 * Manual review report
 */
export interface ManualReviewReport {
  generatedAt: Date;
	totalUnfixableFiles: number;
  byReason: Map<UnfixableReason, number>;
  byErrorType: Map<string, number>;
  patternStats: PatternStats[];
	entries: UnfixableEntry[];
  recommendations: string[];
}

/**
 * Unfixable File Logger class
 */
export class UnfixableLogger {
  private entries: UnfixableEntry[] = [];
  private patternAttempts: Map<string, { success: number;
	failure: number; reasons: Map<UnfixableReason, number> }> = new Map();

  /**
   * Log an unfixable file
   */
  logUnfixable(entry: Omit<UnfixableEntry, 'timestamp'>): void {
    this.entries.push({
      ...entry,
      timestamp: new Date(),
    });

    // Update pattern stats for failed patterns
    for (const patternName of entry.attemptedPatterns) {
      this.recordPatternFailure(patternName, entry.reason);
    }
  }

  /**
   * Record a successful pattern application
   */
  recordPatternSuccess(patternName: string): void {
    const stats = this.patternAttempts.get(patternName) ?? {
      success: 0,
      failure: 0,
      reasons: new Map(),
    };
    stats.success++;
    this.patternAttempts.set(patternName, stats);
  }

  /**
   * Record a failed pattern application
   */
  recordPatternFailure(patternName: string, reason: UnfixableReason): void {
    const stats = this.patternAttempts.get(patternName) ?? {
      success: 0,
      failure: 0,
      reasons: new Map(),
    };
    stats.failure++;
    stats.reasons.set(reason, (stats.reasons.get(reason) ?? 0) + 1);
    this.patternAttempts.set(patternName, stats);
  }

  /**
   * Get all unfixable entries
   */
  getEntries(): UnfixableEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries by reason
   */
  getEntriesByReason(reason: UnfixableReason): UnfixableEntry[] {
    return this.entries.filter((e) => e.reason === reason);
  }

  /**
   * Get entries by error type
   */
  getEntriesByErrorType(errorType: string): UnfixableEntry[] {
    return this.entries.filter((e) => e.errorType === errorType);
  }

  /**
   * Get pattern statistics
   */
  getPatternStats(): PatternStats[] {
    const stats: PatternStats[] = [];

    this.patternAttempts.forEach((data, patternName) => {
      const total = data.success + data.failure;
      stats.push({
        patternName,
        totalAttempts: total,
        successCount: data.success,
        failureCount: data.failure,
        successRate: total > 0 ? data.success / total : 0,
        commonFailureReasons: data.reasons,
      });
    });

    return stats.sort((a, b) => b.totalAttempts - a.totalAttempts);
  }

  /**
   * Generate manual review report
   */
  generateReport(): ManualReviewReport {
    const byReason = new Map<UnfixableReason, number>();
    const byErrorType = new Map<string, number>();

    for (const entry of this.entries) {
      byReason.set(entry.reason, (byReason.get(entry.reason) ?? 0) + 1);
      byErrorType.set(entry.errorType, (byErrorType.get(entry.errorType) ?? 0) + 1);
    }

    const patternStats = this.getPatternStats();
    const recommendations = this.generateRecommendations(byReason, byErrorType, patternStats);

    return {
      generatedAt: new Date(),
      totalUnfixableFiles: this.entries.length,
      byReason,
      byErrorType,
      patternStats,
      entries: [...this.entries],
      recommendations,
    };
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    byReason: Map<UnfixableReason, number>,
    byErrorType: Map<string, number>,
    patternStats: PatternStats[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for common issues
    const noMatchingPattern = byReason.get('no-matching-pattern') ?? 0;
    if (noMatchingPattern > 10) {
      recommendations.push(
        `${noMatchingPattern} files have no matching pattern. Consider creating new patterns for common error types.`
      );
    }

    const syntaxTooComplex = byReason.get('syntax-too-complex') ?? 0;
    if (syntaxTooComplex > 5) {
      recommendations.push(
        `${syntaxTooComplex} files have syntax too complex for auto-fix. Manual review required.`
      );
    }

    // Check for low success rate patterns
    for (const stat of patternStats) {
      if (stat.totalAttempts > 10 && stat.successRate < 0.5) {
        recommendations.push(
          `Pattern "${stat.patternName}" has low success rate (${(stat.successRate * 100).toFixed(1)}%). Consider improving the pattern.`
        );
      }
    }

    // Check for common error types
    byErrorType.forEach((count, errorType) => {
      if (count > 20) {
        recommendations.push(
          `Error type "${errorType}" appears ${count} times. Consider creating a dedicated fix pattern.`
        );
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('No significant issues detected. Continue with manual review of remaining files.');
    }

    return recommendations;
  }

  /**
   * Export report to JSON
   */
  exportToJson(): string {
    const report = this.generateReport();
    return JSON.stringify(
      {
        ...report,
        byReason: Object.fromEntries(report.byReason),
        byErrorType: Object.fromEntries(report.byErrorType),
        patternStats: report.patternStats.map((s) => ({
          ...s,
          commonFailureReasons: Object.fromEntries(s.commonFailureReasons),
        })),
      },
	null,
      2
    );
  }

  /**
   * Export report to Markdown
   */
  exportToMarkdown(): string {
    const report = this.generateReport();
    const lines: string[] = [];

    lines.push('# Unfixable Files Manual Review Report');
    lines.push('');
    lines.push(`Generated: ${report.generatedAt.toISOString()}`);
    lines.push(`Total Unfixable Files: ${report.totalUnfixableFiles}`);
    lines.push('');

    // Summary by reason
    lines.push('## Summary by Reason');
    lines.push('');
    lines.push('| Reason | Count |');
    lines.push('|--------|-------|');
    report.byReason.forEach((count, reason) => {
      lines.push(`| ${reason} | ${count} |`);
    });
    lines.push('');

    // Summary by error type
    lines.push('## Summary by Error Type');
    lines.push('');
    lines.push('| Error Type | Count |');
    lines.push('|------------|-------|');
    report.byErrorType.forEach((count, errorType) => {
      lines.push(`| ${errorType} | ${count} |`);
    });
    lines.push('');

    // Pattern statistics
    lines.push('## Pattern Statistics');
    lines.push('');
    lines.push('| Pattern | Attempts | Success | Failure | Rate |');
    lines.push('|---------|----------|---------|---------|------|');
    for (const stat of report.patternStats) {
      lines.push(
        `| ${stat.patternName} | ${stat.totalAttempts} | ${stat.successCount} | ${stat.failureCount} | ${(stat.successRate * 100).toFixed(1)}% |`
      );
    }
    lines.push('');

    // Recommendations
    lines.push('## Recommendations');
    lines.push('');
    for (const rec of report.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');

    // File list (first 50)
    lines.push('## Files Requiring Manual Review');
    lines.push('');
    const filesToShow = report.entries.slice(0, 50);
    for (const entry of filesToShow) {
      lines.push(`### ${entry.filePath}`);
      lines.push(`- Error: ${entry.errorType}`);
      lines.push(`- Message: ${entry.errorMessage}`);
      if (entry.lineNumber) {
        lines.push(`- Location: Line ${entry.lineNumber}${entry.columnNumber ? `, Column ${entry.columnNumber}` : ''}`);
      }
      lines.push(`- Reason: ${entry.reason}`);
      lines.push(`- Attempted Patterns: ${entry.attemptedPatterns.join(', ') || 'None'}`);
      lines.push('');
    }

    if (report.entries.length > 50) {
      lines.push(`... and ${report.entries.length - 50} more files`);
    }

    return lines.join('\n');
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
    this.patternAttempts.clear();
  }
}

/**
 * Global logger instance
 */
export const unfixableLogger = new UnfixableLogger();

/**
 * Convenience function to log an unfixable file
 */
export function logUnfixable(
  filePath: string,
  errorType: string,
  errorMessage: string,
  reason: UnfixableReason,
  attemptedPatterns: string[] = [],
  lineNumber?: number,
  columnNumber?: number
): void {
  unfixableLogger.logUnfixable({
    filePath,
    errorType,
    errorMessage,
    reason,
    attemptedPatterns,
    lineNumber,
    columnNumber,
  });
}
