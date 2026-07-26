// This file simulates the existing, vulnerable API endpoint handler for listing demo resources.
/**
 * @route GET/POST /api/admin/demo-list
 * @description Lists all available demonstration resources for administrators.
 */
export async function GET({ locals }: { locals: { user: UserSession } }) {
    // VULNERABILITY: The logic assumes that if the user is an admin, they can list everything.
    if (!locals.user || !locals.user.roles.includes('ADMIN')) {
        return json({ error: "Forbidden", message: "Requires ADMIN role." }, { status: 403 });
    }
    
    // Direct call to the retrieval core
    const list = await retrieveDemoList(locals.user.id); 
    
    // Potential data leakage here: returning un-sanitized list details.
    return json({ success: true, list: list });
}

// Simulated external dependency
async function retrieveDemoList(userId: string) {
    console.log(\`Executing unprotected demo list retrieval for admin: \${userId}\`);
    // Returns a raw list that might include internal IDs or sensitive metadata.
    return [
        { id: "d-1", name: "Core Widget", metadata: "internal_key_123" }, 
        { id: "d-2", name: "Edge Case Handler", metadata: "internal_key_456" }
    ];
}