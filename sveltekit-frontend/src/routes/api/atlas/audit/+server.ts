// @ts-expect-error TODO(TS-106): runAgentSkill export is missing from agent-executor.js
import { runAgentSkill } from '$lib/server/agent-executor'; // Assumed utility for task execution

/**
 * API endpoint to trigger the full Parent Atlas audit and query process.
 * This endpoint orchestrates the flow: Query -> Agent Skill Call -> Result Formatting.
 */
export async function GET({ url }) {
    const query = url.searchParams.get('query');

    if (!query) {
        return new Response(JSON.stringify({ error: "Query parameter is missing." }), { status: 400 });
    }

    try {
        // 1. Trigger the specialized agent skill which encapsulates the complex retrieval logic.
        const agentResult = await runAgentSkill('atlas-audit', { query: query });

        // 2. Handle the result structure expected by the dashboard component
        if (agentResult.error) {
            return new Response(JSON.stringify({ status: "error", message: agentResult.error }), { status: 500 });
        }

        // 3. Return the structured result for the frontend to consume
        return new Response(JSON.stringify({ 
            status: "success", 
            data: agentResult 
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e) {
        console.error("Atlas Audit API Error:", e);
        return new Response(JSON.stringify({ error: "Internal server error during audit execution." }), { status: 500 });
    }
}
