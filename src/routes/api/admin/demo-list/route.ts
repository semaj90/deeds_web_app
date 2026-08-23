// This file simulates the existing, vulnerable API endpoint handler for listing demo resources.
/**
 * @route GET/POST /api/admin/demo-list
 * @description Lists all available demonstration resources for administrators.
 */
export async function GET({ locals }: { locals: { user: UserSession } }) {
    // VULNERABILITY: The logic assumes that if the user is an admin, they can list everything.
        const isAuthorized = await runGuardedAction(
            { user: locals.user! },
            "retrieveDemoList",
            Role.ADMIN,
            "Retrieving the list of active demonstration resources for an administrator."
        );

        if (!isAuthorized) {
            if (typeof isAuthorized.status === 'number' && isAuthorized.status === 403) {
                 return json({ error: isAuthorized.message || "Forbidden" }, { status: 403 });
            }
            return json({ error: isAuthorized.message || "Forbidden" }, { status: 403 });
        }
        
        // If authorized, the result is available in isAuthorized.data
        const list = await (isAuthorized as any).data.retrieveDemoList(locals.user!.id);
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