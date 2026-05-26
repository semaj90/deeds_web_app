import { validateRequest, safeValidateRequest } from '@/lib/server/utils/validateRequest';
import { z } from 'zod';

// Define the expected schema for the POST body
const aceAskSchema = z.object({
    query: z.string().min(1, "Query cannot be empty."),
    context_ids: z.array(z.string().optional()).optional(),
});

export async function POST(request: Request) {
    const body = await safeValidateRequest(request.json(), aceAskSchema);

    if (!body) {
        // Return 400 JSON on invalid body, preserving stable shape
        return new Response(JSON.stringify({ 
            error: "Validation Failed", 
            details: "Invalid request body payload.", 
            schema_violation: true 
        }), { status: 400, headers: { 'Content-Type': 'application/json' }});
    }

    // Logic proceeds only if validation is successful
    const { query, context_ids } = body;
    
    // Original logic using the validated payload
    // ... [rest of the original logic using query and context_ids] ...
    
    return new Response(JSON.stringify({ success: true, message: "Query processed successfully with validated payload." }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
    });
}