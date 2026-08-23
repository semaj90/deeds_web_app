// This file simulates the existing, vulnerable API endpoint handler.
/**
 * @route GET/POST /api/acp/service-ports
 * @description Lists all services and ports available for connection.
 */
export async function GET({ locals }: { locals: { user: UserSession } }) {
    // VULNERABILITY: The role check here is direct and potentially bypassed 
    // if the calling service trusts the user role passed in headers/cookies 
    // without re-validating it against the core service logic.
        const isAuthorized = await runGuardedAction(
            { user: locals.user! }, // Pass the user object from locals
            "searchAtlas", // Using a general operational name for this example
            Role.ADMIN,
            "Retrieving the list of available ACP services and ports for discovery"
        );

        if (!isAuthorized) {
            // If failed, runGuardedAction returns a superFormFail structure.
            // We check for the failure status to return a 403.
            if (typeof isAuthorized.status === 'number' && isAuthorized.status === 403) {
                 return json({ error: isAuthorized.message || "Forbidden" }, { status: 403 });
            }
            return json({ error: isAuthorized.message || "Forbidden" }, { status: 403 });
        }
        
        // If authorized, the result is available in isAuthorized.data
        const ports = await (isAuthorized as any).data.getServicePorts(locals.user!.id);
        return json({ ports: ports, source: "guarded_call" });
}

// Simulated external dependency
async function getServicePorts(userId: string) {
    console.log(\`Executing unprotected logic for user: \${userId}\`);
    // Returns all ports without checking if the user only requested a view.
    return [{ name: 'pg', port: 5432 }, { name: 'redis', port: 6379 }];
}