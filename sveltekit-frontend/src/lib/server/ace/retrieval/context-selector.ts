import type { AceEvidence } from '../contracts/ace-context-packet.js';
import type { TokenAccountant } from '../tokenizer/token-accountant.js';

export interface ContextSelectionConfig {
  budgetTokens: number;
  minEvidenceCount: number;
  maxEvidenceCount: number;
}

export class ContextSelector {
  private tokenizer: TokenAccountant;

  constructor(tokenizer: TokenAccountant) {
    this.tokenizer = tokenizer;
  }

  async selectContext(
    evidence: AceEvidence[],
    query: string,
    config: ContextSelectionConfig
  ): Promise<{ evidence: AceEvidence[]; totalTokens: number }> {
    // Sort by fused score descending
    const sorted = [...evidence].sort((a, b) => (b.fusedScore ?? 0) - (a.fusedScore ?? 0));

    // Greedy selection: add evidence until budget exhausted or max count reached
    const selected: AceEvidence[] = [];
    let totalTokens = 0;

    for (const e of sorted) {
      if (selected.length >= config.maxEvidenceCount) {
        break;
      }

      // Estimate tokens for this evidence
      const evidenceText = `${e.packetKey}: ${e.sourceRef || 'unknown'} (${e.evidenceKind})`;
      const tokens = await this.tokenizer.countText(evidenceText);

      if (totalTokens + tokens <= config.budgetTokens) {
        selected.push(e);
        totalTokens += tokens;
      }
    }

    // Ensure minimum evidence
    if (selected.length < config.minEvidenceCount) {
      return {
        evidence: sorted.slice(0, config.minEvidenceCount),
        totalTokens: await this.tokenizer.countMessages(
          sorted.slice(0, config.minEvidenceCount).map(e => ({
            role: 'evidence',
            content: `${e.packetKey}: ${e.sourceRef}`
          }))
        )
      };
    }

    return { evidence: selected, totalTokens };
  }
}
