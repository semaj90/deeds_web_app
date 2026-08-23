import { getGatewayState, saveGatewayMessage, updateMessageStatus } from './state-manager';

/**
 * Enforces the canonical gateway flow. This function must be called first
 * to ensure all downstream logic operates on the latest, consistent state.
 * @param messagePayload The raw data payload from the incoming request.
 * @returns A structured result object containing the processed data or an error.
 */
export async function enforceGatewayFlow(messagePayload: any): Promise<{ success: boolean; result: any; error: string | null }> {
  const messageId = messagePayload.id || 'unknown';
  
  try {
    // 1. READ: Enforce reading the canonical state first (Stage 2 enforcement)
    const currentState = await getGatewayState(messageId);
    
    if (!currentState) {
        // If no state exists, we treat this as a new transaction.
        const saved = await saveGatewayMessage({ 
            id: messageId, 
            payload: messagePayload, 
            source: 'initial_request' 
        });
        if (!saved) {
            return { success: false, result: null, error: "Failed to initialize state for the message." };
        }
        return { success: true, result: { initial: true, state: currentState }, error: null };
    }

    // 2. PROCESS: Execute core business logic using the retrieved state
    // --- Core logic placeholder: This is where the original business logic goes ---
    const processedData = { 
        newState: { status: 'processed', data: 'processed_data' },
        // Perform complex transformations based on currentState
    };
    // ------------------------------------------------------------------------------

    // 3. WRITE: Persist the result state back to the canonical DB
    await updateMessageStatus(messageId, 'processed');
    await saveGatewayMessage({ id: messageId, payload: processedData, source: 'gateway_flow' });

    return { success: true, result: processedData, error: null };

  } catch (error) {
    console.error("Gateway Flow Enforcement Failed:", error);
    // Crucially, we must still return a stable JSON shape even on failure
    return { success: false, result: null, error: `Gateway flow failed due to an internal error: ${error.message}` };
  }
}