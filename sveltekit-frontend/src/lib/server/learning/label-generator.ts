/**
 * Label Generator — Hypergraph evidence generates the labels
 *
 * Not manual decisions that two chunks are positive because their text sounds related.
 *
 * Architecture:
 *   Hypergraph evidence  → co-success rates  → training labels
 *
 * Examples:
 *   packet A packet B co_success: 0.91 → strong positive
 *   packet A packet C co_retrieved often co_success: 0.07 → hard negative
 *
 * That is far more valuable than generic semantic similarity.
 */

export interface LabelEvidence {
  packet_a: {
    packet_key: string;
    source_ref: string;
    successful_runs: number;
    failed_runs: number;
  };
  packet_b: {
    packet_key: string;
    source_ref: string;
    successful_runs: number;
    failed_runs: number;
  };
  co_success: number; // Proportion of co-retrieved runs that were successful
  co_retrieved_count: number;
}

export interface GeneratedLabel {
  packet_a_key: string;
  packet_b_key: string;
  score: number;
  label_type: 'positive' | 'hard_negative' | 'weak_positive' | 'negative';
  evidence: {
    co_success: number;
    co_retrieved_count: number;
    successful_runs: number;
    failed_runs: number;
  };
}

/**
 * Generate labels from hypergraph evidence
 */
export function generateLabelsFromHypergraph(
  evidence: LabelEvidence[]
): GeneratedLabel[] {
  return evidence.map(evidence => {
    const { co_success, co_retrieved_count } = evidence;
    const successful_runs = evidence.packet_a.successful_runs + evidence.packet_b.successful_runs;
    const failed_runs = evidence.packet_a.failed_runs + evidence.packet_b.failed_runs;

    // Calculate confidence based on co-retrieved count
    const confidence = co_retrieved_count > 0 ? co_success : 0;

    // Assign label type based on co-success rate
    let label_type: 'positive' | 'hard_negative' | 'weak_positive' | 'negative';
    let score: number;

    if (co_success >= 0.9) {
      label_type = 'positive';
      score = 1.0;
    } else if (co_success >= 0.7) {
      label_type = 'positive';
      score = 0.95;
    } else if (co_success >= 0.5) {
      label_type = 'positive';
      score = 0.90;
    } else if (co_success >= 0.3) {
      label_type = 'weak_positive';
      score = 0.85;
    } else if (co_success > 0) {
      label_type = 'hard_negative';
      score = 0.65;
    } else {
      label_type = 'negative';
      score = 0.0;
    }

    return {
      packet_a_key: evidence.packet_a.packet_key,
      packet_b_key: evidence.packet_b.packet_key,
      score,
      label_type,
      evidence: {
        co_success,
        co_retrieved_count,
        successful_runs,
        failed_runs,
      },
    };
  });
}

/**
 * Calculate co-success rate between two packets
 */
export function calculateCoSuccessRate(
  packet_a_runs: Array<{
    packet_b_retrieved: boolean;
    successful: boolean;
  }>,
  packet_b_runs: Array<{
    packet_a_retrieved: boolean;
    successful: boolean;
  }>
): number {
  // Find co-retrieved runs
  const coRetrievedRuns = packet_a_runs.filter(run => run.packet_b_retrieved);
  
  if (coRetrievedRuns.length === 0) {
    return 0;
  }

  const successfulCoRetrieved = coRetrievedRuns.filter(run => run.successful);
  
  return successfulCoRetrieved.length / coRetrievedRuns.length;
}

/**
 * Validate label quality
 */
export function validateLabelQuality(labels: GeneratedLabel[]): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for label distribution
  const labelCounts = new Map<string, number>();
  for (const label of labels) {
    labelCounts.set(label.label_type, (labelCounts.get(label.label_type) ?? 0) + 1);
  }

  // Check for extreme scores
  const extremeScores = labels.filter(label => label.score <= 0.1 || label.score >= 0.99);
  if (extremeScores.length > labels.length * 0.5) {
    issues.push('Too many extreme scores (>50%) - consider adding more diversity');
  }

  // Check for balanced hard negatives
  const hardNegativeCount = labelCounts.get('hard_negative') ?? 0;
  if (hardNegativeCount < labels.length * 0.1) {
    issues.push('Too few hard negatives (<10%) - consider mining more failed runs');
  }

  // Check for label diversity
  const labelTypes = new Set(labels.map(label => label.label_type));
  if (labelTypes.size === 1 && labelTypes.has('positive')) {
    issues.push('All labels are positive - consider adding more diversity');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
