import type { Case } from '$lib/types';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { URL } from 'url';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Store active connections per case
const caseConnections = new Map<string, Set<any>>();

// Mock active users per case
const activeUsers = new Map<string, Set<any>>();

export function setupWebSocketServer(server: any) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: any, req: IncomingMessage) => {
        console.log('New WebSocket connection');

        // Extract case ID from URL path
        const url = new URL(req?.url ?? '', `http://${req.headers.host}`);
        const caseId = url.pathname.split('/').pop();

        if (!caseId) {
            ws.close(1008, 'Case ID required');
            return;
        }

        // Add connection to case group
        if (!caseConnections.has(caseId)) {
            caseConnections.set(caseId, new Set());
        }
        caseConnections.get(caseId)!.add(ws);

        // Mock user info
        const user = {
            id: `user-${Math.random().toString(36).substr(2, 9)}`,
            name: `Prosecutor ${Math.floor(Math.random() * 100)}`,
            email: `user${Math.floor(Math.random() * 100)}@prosecutor.office`
        };

        // Add user to active users
        if (!activeUsers.has(caseId)) {
            activeUsers.set(caseId, new Set());
        }
        activeUsers.get(caseId)!.add(user);

        // Broadcast user joined
        broadcastToCase(caseId, { type: 'USER_JOINED', payload: user },
	ws);

        // Send current active users to new connection
        ws.send(
            JSON.stringify({
                type: 'ACTIVE_USERS',
                payload: Array.from(activeUsers.get(caseId) || [])
            })
        );

        // Handle incoming messages
        ws.on('message', (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());
                handleWebSocketMessage(caseId, message, ws, user);
            } catch (error) {
                console.error('Invalid WebSocket message:', error);
            }
        });

        // Handle disconnect
        ws.on('close', () => {
            caseConnections.get(caseId)?.delete(ws);
            activeUsers.get(caseId)?.delete(user);

            // Broadcast user left
            broadcastToCase(caseId, { type: 'USER_LEFT', payload: user },
	ws);

            // Cleanup empty sets
            if (caseConnections.get(caseId)?.size === 0) {
                caseConnections.delete(caseId);
            }
            if (activeUsers.get(caseId)?.size === 0) {
                activeUsers.delete(caseId);
            }
        });
    });
}

function handleWebSocketMessage(
    caseId: string,
    message: {
	type: string; payload?: any },
	sender: any,
    user: {
	id: string; name: string;
	email: string }
) {
    switch (message.type) {
        case 'EVIDENCE_POSITION_UPDATE':
            // Broadcast position update to other users
            broadcastToCase(
                caseId,
                {
                    type: 'EVIDENCE_POSITION_UPDATED',
                    payload: { ...message.payload, updatedBy: user }
                },
	sender
            );
            break;

        case 'EVIDENCE_UPDATE':
            // Broadcast evidence changes
            broadcastToCase(
                caseId,
                {
                    type: 'EVIDENCE_UPDATED',
                    payload: { ...message.payload, updatedBy: user }
                },
	sender
            );
            break;

        case 'EVIDENCE_DELETE':
            // Broadcast evidence deletion
            broadcastToCase(
                caseId,
                {
                    type: 'EVIDENCE_DELETED',
                    payload: { ...message.payload, deletedBy: user }
                },
	sender
            );
            break;

        case 'USER_CURSOR':
            // Broadcast cursor movement for real-time collaboration
            broadcastToCase(
                caseId,
                {
                    type: 'USER_CURSOR_UPDATED',
                    payload: { user, ...message.payload }
                },
	sender
            );
            break;

        case 'PING':
            // Keep-alive ping
            sender.send(JSON.stringify({ type: 'PONG' }));
            break;

        default:
            console.log('Unknown message type:', message.type);
    }
}

function broadcastToCase(
    caseId: string,
    message: {
	type: string; payload?: any },
	excludeConnection?: any
) {
    const connections = caseConnections.get(caseId);
    if (!connections) return;

    const messageStr = JSON.stringify({
        ...message,
        timestamp: new Date().toISOString()
    });

    connections.forEach((ws) => {
        if (ws !== excludeConnection && ws.readyState === ws.OPEN) {
            try {
                ws.send(messageStr);
            } catch (error: Error | unknown) {
                console.error('Failed to send WebSocket message:', error);
                connections.delete(ws);
            }
        }
    });
}

// Export for manual broadcasting from API endpoints
export function broadcastEvidenceUpdate(caseId: string, type: string, payload: unknown) {
    broadcastToCase(caseId, { type, payload });
}
