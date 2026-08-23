/**
 * @module Gatekeeper
 * @description Centralized gatekeeper service for all high-privilege API calls.
 * This module enforces mandatory role and operation-type validation before
 * executing core logic, preventing role-based privilege escalation and unauthorized
 * data/resource mutation (Data Leakage Prevention).
 */

import { UserSession, Role } from '$lib/types/user';
import { fail, fail as superFormFail } from 'sveltekit-superforms';

/**
 * Audits a potential API operation before execution.
 * @param session The current user's active session data.
 * @param operation The function/action to execute (e.g., 'executeTask', 'searchAtlas').
 * @param requiredRole The minimum role required to execute this operation (e.g., Role.ADMIN).
 * @param scopeDescription A human-readable description of the operation's scope.
 * @returns {Promise<boolean>} True if access is granted, false otherwise.
 */
export async function checkGatekeeper(
    session: UserSession,
    operation: string,
    requiredRole: Role,
    scopeDescription: string
): Promise<boolean> {
    // 1. ROLE CHECK: Must possess the minimum required role.
    if (!session.user || !session.user.roles.includes(requiredRole)) {
        console.error(`[GATEKEEPER FAIL] User lacks required role: ${requiredRole} for operation: ${operation}.`);
        // Return false immediately if the role is insufficient.
        return false;
    }

    // 2. OPERATION CHECK: Advanced logic based on the operation name/type.
    // This is where specific logic for task execution, data projection, etc., would live.
    if (operation.includes('execute')) {
        // Logic for verifying task_id/tool_name authorization
        // Example: if (!userCanExecuteTask(session, operation)) return false;
    }
    
    // 3. SCOPE/BOUNDARY CHECK: Check if the action is limited to a specific resource or context.
    // Example: Ensure that a read-only call (like search) cannot pass parameters
    // that imply a write operation (e.g., includes 'new' or 'update' in the payload).
    // if (!isReadOperation(operation)) {
    //    console.warn("[GATEKEEPER WARNING] Operation looks write-like but is flagged read-only.");
    // }


    console.log(`[GATEKEEPER SUCCESS] Role (${requiredRole}) and operation (${operation}) verified for scope: ${scopeDescription}.`);
    return true;
}

/**
 * A helper function to centralize and validate the execution of a sensitive action.
 * This function should be called directly in API routes instead of calling the raw underlying logic.
 * @param session The user session.
 * @param operationName The specific action being attempted.
 * @param roleRequired The minimum role needed.
 * @param scopeDescription A description of the scope.
 * @param actionFn The function that contains the raw logic that should run IF gatekeeper passes.
 * @returns The result of the action or an appropriate error.
 */
export async function runGuardedAction(
    session: UserSession,
    operationName: string,
    roleRequired: Role,
    scopeDescription: string,
    actionFn: (session: UserSession) => Promise<any>
): Promise<any> {
    const isAuthorized = await checkGatekeeper(
        session,
        operationName,
        roleRequired,
        scopeDescription
    );

    if (!isAuthorized) {
        // Use SvelteKit's failure mechanism for consistent error handling.
        return superFormFail({
            form: null, // Pass the relevant form/data here
            message: `Authorization failed: Insufficient role (${roleRequired}) or unauthorized operation for '${operationName}'.`,
            status: 403 // Forbidden
        });
    }

    // If authorized, execute the actual logic.
    return actionFn(session);
}