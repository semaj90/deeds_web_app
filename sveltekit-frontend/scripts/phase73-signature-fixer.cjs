/**
 * Phase 73: Complex Signature Repair Script
 * Targeted fixes for function signatures with displaced types (double colon pattern)
 */
const fs = require('fs');
const path = require('path');

const targetFiles = [
    'src/lib/services/webgpu-simd-accelerator.ts',
    'src/lib/ai.bak/qlora-integration-analyzer.ts',
    'src/lib/ai.bak/qlora-topology-predictor.ts',
    'src/lib/wasm/qlora-wasm-loader.ts',
    'src/lib/orchestration/qlora-ollama-orchestrator.ts',
    'src/lib/server/webgpu-langchain-bridge.ts',
    'src/lib/services/wasm-ranking-cache-service.ts',
    'src/lib/integrations/redis-webgpu-simd-integration.ts',
    'src/lib/services/error-analysis/ErrorClustering.ts',
    'src/lib/state/evidenceCustodyMachine.ts',
    'src/lib/services/gguf-runtime.ts',
    'src/lib/workers/recursive-evidence-chain-worker.ts',
    'src/lib/services/nodejs-orchestrator.ts',
    'src/lib/services/knowledge-search/KnowledgeIndexer.ts',
    'src/lib/server/db/schema-phase90-hardened.ts',
    'src/lib/services/qlora-rl-langextract-integration.ts',
];

function repairSignatures(content) {
    let fixed = content;

    // Pattern: ): Type: ReturnType
    // Captures:
    // 1: Arguments content inside parens
    // 2: The displaced Type (e.g. string, RLUpdate)
    // 3: The ReturnType (Promise, void, etc starting with specific keywords check)
    // Pattern: ): Type: ReturnType (Double Colon)
    const doubleColonPattern = /\(([^)]*)\):\s*(\w+)\s*:\s*(Promise|void|string|number|boolean|any)/g;

    // Pattern: ), Type: ReturnType (Comma + Colon)
    // Matches: handleFlywheelRLUpdate(...), RLUpdate: Promise<void>
    const commaColonPattern = /\(([^)]*)\)\s*,\s*(\w+)\s*:\s*(Promise|void|string|number|boolean|any)/g;

    const fixer = (match, args, displacedType, returnType) => {
        // Analyze the arguments block
        const trimmedArgs = args.trim();

        // Split by comma to get the last argument
        const parts = trimmedArgs.split(',');
        const lastArg = parts[parts.length - 1].trim();

        // Check if last argument already has a type annotation
        if (lastArg.includes(':')) {
            // Case: (arg: Type): DisplacedType: ReturnType
            // Logic: Missing argument name. Create a generic one 'data'.
            // Or use checking for variable usage in body (too complex for regex), so default to 'rlData' if type is RLUpdate or 'data' otherwise
            let argName = 'data';
            if (displacedType === 'RLUpdate') argName = 'rlData';

            return `(${trimmedArgs}, ${argName}: ${displacedType}): ${returnType}`;
        } else {
            // Case: (argName): DisplacedType: ReturnType
            // Logic: Argument matches name, just append type
            return `(${trimmedArgs}: ${displacedType}): ${returnType}`;
        }
    };

    fixed = fixed.replace(doubleColonPattern, fixer);
    fixed = fixed.replace(commaColonPattern, fixer);

    // Special case for missing comma in generic corruptions
    // mapDocType(docType: string): number { ... const map: Record<string: number>
    // This was fixed by regex script but good to double check or handle "string: number" in other contexts

    return fixed;
}

let totalFixed = 0;
for (const relPath of targetFiles) {
    const fullPath = path.join(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) continue;

    const original = fs.readFileSync(fullPath, 'utf-8');
    const fixed = repairSignatures(original);

    if (original !== fixed) {
        fs.writeFileSync(fullPath, fixed);
        console.log(`✅ Fixed signatures: ${relPath}`);
        totalFixed++;
    }
}

console.log(`\n🎉 Phase 73 Repair Complete: ${totalFixed} files updated`);
