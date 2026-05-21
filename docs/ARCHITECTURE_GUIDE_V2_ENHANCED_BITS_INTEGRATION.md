# Enhanced Bits Integration Analysis Report

This report details the usage, context, and architectural implications of the `enhanced-bits` component suite across the codebase. This suite appears to contain legacy or experimental components that rely heavily on custom CSS variables and direct module imports.

## 1. Architectural Status

The evidence suggests that `enhanced-bits` is an **archived or deprecated** suite. Several files indicate it has been superseded or removed in recent cleanup efforts (e.g., `PRODUCTION_REMEDIATION_PLAN.md` mentions the removal of this directory).

**Key Findings:**
*   **Dependency:** Components like `ContractAnalyzer.svelte` and `CitationManager.svelte` directly consume styling variables (`--enhanced-bits-*`) and import components from this directory.
*   **Contextual Overlap:** The usage strongly suggests that `enhanced-bits` is a wrapper or an older version of the core UI components that should now be governed by the standard `ui/` directory components.
*   **Implication:** Direct imports from `src/lib/components/ui/enhanced-bits/` should be flagged for deprecation.

## 2. Cross-Reference Mappings

| Source File | Dependency Type | Target Component/Module | Relevance to Analysis |
| :--- | :--- | :--- | :--- |
| `ContractAnalyzer.svelte` | Styling/Logic | `--enhanced-bits-*` CSS variables | **High**: Directly uses custom CSS variables, indicating deep integration. |
| `CitationManager.svelte` | Styling/Logic | `--enhanced-bits-*` CSS variables | **High**: Relies on specific themed components. |
| `utils/dynamic-imports.ts` | Dynamic Import | `SSRWebGPULoader.svelte` | **Medium**: Points to a specific, potentially complex, component within the suite. |
| `AGENTS.md` | Agent Schema | `enhanced-bits` directory paths | **High**: The agent definition explicitly lists these paths as part of the system's knowledge base. |

## 3. Actionable Recommendations (Build Mode)

1.  **Refactoring Priority**: Components like `ContractAnalyzer.svelte` and `CitationManager.svelte` must be audited to replace direct CSS variable usage (`var(--enhanced-bits-*)`) with standard UnoCSS utility classes or by accepting themed props from a centralized theme provider.
2.  **Deprecation**: If the `enhanced-bits` directory is confirmed obsolete, all imports from it must be replaced with the corresponding components from the standard `ui/` directory.
3.  **Knowledge Base Update**: The `AGENTS.md` and associated documentation should be updated to reflect the removal of this suite to prevent future development errors.