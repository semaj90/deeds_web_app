// This file simulates the existing, vulnerable API endpoint handler for task execution.
/**
 * @route POST /api/agent/execute
 * @description Executes a specified agent tool/task. This is a high-privilege action.
 */
export async function POST({ locals }: { locals: { user: UserSession } }) {
    const { toolName, parameters } = await request.json();

    // VULNERABILITY: The role check is insufficient, only checking for existence 
    // but not validating against the required capabilities of the requested toolName.
        const isAuthorized = await runGuardedAction(
            { user: locals.user! },
            `executeTask: ${toolName}`, // Pass a unique name combining action and tool
            Role.ADMIN,
            `Executing agent task: ${toolName} with parameters: ${JSON.stringify(parameters)}`
        );

        if (!isAuthorized) {
            if (typeof isAuthorized.status === 'number' && isAuthorized.status === 403) {
                 return json({ error: isAuthorized.message || "Forbidden" }, { status: 403 });
            }
            return json({ error: isAuthorized.message || "Forbidden" }, { status: 403 });
        }
        
        // If authorized, the result is available in isAuthorized.data
        const result = await (isAuthorized as any).data.executeTaskCore(toolName, parameters, locals.user!);
        return json({ success: true, output: result });
}

// Simulated external dependency
async function executeTaskCore(toolName: string, params: any, user: UserSession) {
    console.log(\`Executing unprotected task '\${toolName}' for user: \${user.id}\`);
    if (toolName === "tool-a") {
        // Logic here might perform a partial, un-audited DB write.
        return "Task A executed successfully.";
    }
    return "Task executed.";
}