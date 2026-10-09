/** Parent Atlas: Gemma 4 browser MTP compatibility gate (offline only).
 * E2B-it-assistant is a drafter, never an independently admitted SLM.
 */
export const GEMMA4_BROWSER_ROLES_V1 = Object.freeze({
  'gemma3-270m': 'INDEPENDENT_HELPER_LEGACY',
  'gemma4-e2b-it': 'INDEPENDENT_TARGET',
  'gemma4-e2b-it-assistant': 'MTP_DRAFTER_ONLY',
} as const);

export type Gemma4BrowserMtpEvidenceV1 = {
  targetModelChecksum: string | null;
  assistantModelChecksum: string | null;
  tokenizerChecksum: string | null;
  browserRuntime: 'transformersjs-webgpu' | 'litertlm-web';
  speculativeApiVerified: boolean;
  sharedTokenizerVerified: boolean;
  targetVerificationVerified: boolean;
  kvRewindVerified: boolean;
  draftAcceptanceParityVerified: boolean;
  outputParityVerified: boolean;
  gpuMemoryHeadroomVerified: boolean;
};

export function inspectGemma4BrowserMtpReadinessV1(evidence: Gemma4BrowserMtpEvidenceV1) {
  const reasons: string[] = [];
  const digest = (value: string | null) => /^sha256:[0-9a-f]{64}$/.test(value ?? '');
  if (!digest(evidence.targetModelChecksum)) reasons.push('TARGET_DIGEST_UNVERIFIED');
  if (!digest(evidence.assistantModelChecksum)) reasons.push('DRAFTER_DIGEST_UNVERIFIED');
  if (!digest(evidence.tokenizerChecksum)) reasons.push('TOKENIZER_DIGEST_UNVERIFIED');
  if (evidence.browserRuntime !== 'transformersjs-webgpu' && evidence.browserRuntime !== 'litertlm-web')
    reasons.push('BROWSER_RUNTIME_UNSUPPORTED');
  for (const [key, reason] of [
    ['speculativeApiVerified', 'SPECULATIVE_API_UNVERIFIED'],
    ['sharedTokenizerVerified', 'SHARED_TOKENIZER_UNVERIFIED'],
    ['targetVerificationVerified', 'TARGET_VERIFICATION_UNVERIFIED'],
    ['kvRewindVerified', 'KV_REWIND_UNVERIFIED'],
    ['draftAcceptanceParityVerified', 'DRAFT_ACCEPTANCE_UNVERIFIED'],
    ['outputParityVerified', 'OUTPUT_PARITY_UNVERIFIED'],
    ['gpuMemoryHeadroomVerified', 'GPU_HEADROOM_UNVERIFIED'],
  ] as const) {
    if (evidence[key] !== true) reasons.push(reason);
  }
  return {
    schema: 'atlas.gemma4-browser-mtp-readiness.v1' as const,
    status: reasons.length ? 'MTP_NOT_ADMITTED' as const : 'EVIDENCE_COMPLETE_REVIEW_REQUIRED' as const,
    reasons, standaloneAssistantAllowed: false as const,
    runtimeEligible: false as const,
    canonicalAuthority: false as const,
    modelLoaded: false as const,
    writesPerformed: false as const,
    // Even complete self-reported evidence needs independent receipt verification.
    nextGate: 'INDEPENDENT_BROWSER_RUNTIME_RECEIPT_REVIEW' as const,
  };
}
