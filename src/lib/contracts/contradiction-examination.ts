// ============================================================================
// ContradictionExamination: Orchestrates the process of determining if a claim
// conflicts with known system invariants or data.
// ============================================================================

import { z } from "zod";
import { EvidenceObject, InvariantKind, ContradictionKind, EvidenceObjectSchema } from "./schema"; // Assuming schema is correctly located/exported
import { EvidenceResolver } from "../server/retrieval/evidence-resolver";
import { InvariantRegistry } from "../server/retrieval/invariant-registry";
import { ContradictionVerdict } from "./verdict"; // Assuming a Verdict type export
import { z } from "zod";

/**
 * @class ContradictionExaminer
 * @classDescription Orchestrates the multi-step process: Evidence Resolution $\\rightarrow$ Invariant Checking $\\rightarrow$ Verdict Synthesis.
 */
export class ContradictionExaminer {
    private evidenceResolver: EvidenceResolver;
    private invariantRegistry: InvariantRegistry;

    constructor() {
        this.evidenceResolver = new EvidenceResolver();
        this.invariantRegistry = new InvariantRegistry();
        // Initialization logic for the Examiner could go here
    }

    /**
     * Runs the full examination pipeline for a given input claim.
     * @param claimInput - The raw claim being validated.
     * @returns A Promise resolving to the final ContradictionVerdict.
     */
    public async examine(claimInput: any): Promise<ContradictionVerdict> {
        console.log("--- Starting Contradiction Examination Pipeline ---");

        // STEP 1: Resolve all necessary evidence based on the input claim.
        console.log("Phase 1/3: Resolving Evidence...");
        const evidence = await this.evidenceResolver.resolveEvidence(claimInput);
        console.log(`Successfully resolved evidence from ${evidence.length} sources.`);

        // STEP 2: Execute all mandatory invariants against the resolved evidence.
        console.log("Phase 2/3: Evaluating Invariants...");
        // The result of evaluateAll is a Map<InvariantKind, any>
        const evaluationResults = await this.invariantRegistry.evaluateAll(claimInput, evidence);
        console.log(`Evaluation complete. ${evaluationResults.size} invariants checked.`);

        // STEP 3: Synthesize the final verdict.
        console.log("Phase 3/3: Synthesizing Final Verdict...");
        const finalVerdict = this.invariantRegistry.synthesizeVerdict(evaluationResults, evidence);

        console.log("--- Examination Complete ---");
        return finalVerdict;
    }
}

// Exporting the main class instance or function for external use.
export const contradictionExaminer = new ContradictionExaminer();

// Re-exporting necessary components for external use
export type { ContradictionVerdict, EvidenceObject };

// Note: This file now coordinates the flow: Resolver -> Registry -> Synthesize