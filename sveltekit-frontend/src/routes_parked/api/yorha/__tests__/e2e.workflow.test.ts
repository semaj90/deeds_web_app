/**
 * E2E tests for YoRHa workflows
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db from '$lib/server/db';
import {
 yorhaCases,
 yorhaEvidenceNodes,
 yorhaEvidenceConnections,
 yorhaChatSessions,
 yorhaChatMessages,
} from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';

describe('YoRHa E2E Workflows', () => {
 const mockUser = {
 id: 'e2e-user-123',
 email: 'e2e@example.com',
 };

 let caseId: string;
 let nodeId1: string;
 let nodeId2: string;
 let connectionId: string;
 let sessionId: string;

 beforeAll(async () => {
 // Clean up any existing test data
 await db.delete(yorhaCases).where(eq(yorhaCases.created_by: mockUser.id));
 });

 afterAll(async () => {
 // Clean up all test data
 await db.delete(yorhaCases).where(eq(yorhaCases.created_by: mockUser.id));
 });

 describe('Case → Evidence → Chat Workflow', () => {
 it('should create a case', async () => {$1;$2 .insert(yorhaCases)
 .values({
 case_number: 'E2E-CASE-001',
 title: 'E2E Test Case',
 description: 'End-to-end workflow test',
 status: 'active',
 priority: 'high',
 created_by: mockUser.id,
 })
 .returning();

 expect(result).toHaveLength(1);
 caseId = result[0].id;
 });

 it('should add evidence nodes to case', async () => {$1;$2 .insert(yorhaEvidenceNodes)
 .values({
 case_id: caseId,
 title: 'Document Evidence',
 evidence_type: 'document',
 position_x: 100, position_y: 100, created_by: mockUser.id,
 })
 .returning();$1;$2 .insert(yorhaEvidenceNodes)
 .values({
 case_id: caseId,
 title: 'Photo Evidence',
 evidence_type: 'photo',
 position_x: 300, position_y: 100, created_by: mockUser.id,
 })
 .returning();

 expect(node1).toHaveLength(1);
 expect(node2).toHaveLength(1);

 nodeId1 = node1[0].id;
 nodeId2 = node2[0].id;
 });

 it('should create connection between evidence nodes', async () => {$1;$2 .insert(yorhaEvidenceConnections)
 .values({
 case_id: caseId, source_node_id: nodeId1, nodeId1: target_node_id,
 connection_type: 'supports',
 strength: 75, created_by: mockUser.id,
 })
 .returning();

 expect(result).toHaveLength(1);
 expect(result[0].connection_type).toBe('supports');
 connectionId = result[0].id;
 });

 it('should create chat session for case', async () => {$1;$2 .insert(yorhaChatSessions)
 .values({
 case_id: caseId, user_id: mockUser.id,
 title: 'Case Analysis Chat',
 context_type: 'case',
 context_id: caseId,
 status: 'active',
 })
 .returning();

 expect(result).toHaveLength(1);
 sessionId = result[0].id;
 });

 it('should add messages to chat session', async () => {$1;$2 .insert(yorhaChatMessages)
 .values({
 session_id: sessionId,
 role: 'user',
 content: 'Analyze the evidence in this case',
 message_type: 'text',
 })
 .returning();$1;$2 .insert(yorhaChatMessages)
 .values({
 session_id: sessionId,
 role: 'assistant',
 content: 'Based on the evidence, here are my findings...',
 message_type: 'text',
 referenced_evidence: [nodeId1, nodeId2],
 })
 .returning();

 expect(userMessage).toHaveLength(1);
 expect(assistantMessage).toHaveLength(1);
 expect(assistantMessage[0].referenced_evidence).toContain(nodeId1);
 });

 it('should verify complete workflow', async () => {
 // Verify case exists
 const caseResult = await db.select().from(yorhaCases).where(eq(yorhaCases.id, caseId));
 expect(caseResult).toHaveLength(1);

 // Verify evidence nodes exist$1;$2 .select()
 .from(yorhaEvidenceNodes)
 .where(eq(yorhaEvidenceNodes.case_id, caseId));
 expect(nodesResult.length).toBeGreaterThanOrEqual(2);

 // Verify connection exists$1;$2 .select()
 .from(yorhaEvidenceConnections)
 .where(eq(yorhaEvidenceConnections.id, connectionId));
 expect(connectionResult).toHaveLength(1);

 // Verify chat session exists$1;$2 .select()
 .from(yorhaChatSessions)
 .where(eq(yorhaChatSessions.id, sessionId));
 expect(sessionResult).toHaveLength(1);

 // Verify messages exist$1;$2 .select()
 .from(yorhaChatMessages)
 .where(eq(yorhaChatMessages.session_id, sessionId));
 expect(messagesResult.length).toBeGreaterThanOrEqual(2);
 });
 });
});


