/**
 * @fileoverview Node responsible for creating the TOON context packet (compact summary).
 * This node synthesizes all gathered information into a single, highly compact context blob.
 */
import { contextBuildKvPacket } from '@/lib/server/utils/context-utils';

/**
 * Builds the TOON context packet from the final state.
 * @param {FeatureMappingState} state - The current state object.
 * @returns {Promise<FeatureMappingState>} The state updated with the TOON packet.
 */
export async function toonContextNode(state) {
    console.log('[ToonContextNode] Starting TOON context packet generation...');
    
    // Use context.build_kv_packet to generate the compact card
    const toonPacket = await contextBuildKvPacket(state);

    return {
        ...state,
        toonPacket: toonPacket,
    };
}