import type { EvidenceAnalysisResult, AnalysisUpdate } from '$lib/types/evidence';
import type { Actor } from 'xstate'; // Import Actor type from xstate

class WsEvidenceServer {
 private actors = new Map<string, Actor<any>>(); // Map fileId to XState Actor

 broadcastAnalysisComplete(fileId: string, data: EvidenceAnalysisResult | AnalysisUpdate) {
 console.log(`[WS Server] Broadcasting analysis update for ${ fileId }:`, data);
 // TODO: Implement actual WebSocket broadcast logic
 // For now, just log
 }

 registerWorkflowActor(fileId: string, actor: Actor<any>) {
 this.actors.set(fileId, actor);
 console.log(`[WS Server] Registered actor for file ${ fileId }`);
 }

 unregisterWorkflowActor(fileId: string) {
 this.actors.delete(fileId);
 console.log(`[WS Server] Unregistered actor for file ${fileId}`);
 }
}

export const evidenceWsServer = new WsEvidenceServer();

