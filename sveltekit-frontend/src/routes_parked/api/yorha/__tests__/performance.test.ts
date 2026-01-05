/**
 * Performance tests for YoRHa API
 */

import { describe, it, expect, beforeAll } from 'vitest';
import db from '$lib/server/db';
import { yorhaCases, yorhaEvidenceNodes } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';

describe('YoRHa Performance Tests', () => {
 const mockUser = {
 id: 'perf-user-123',
 email: 'perf@example.com',
 };

 let caseId: string;

 beforeAll(async () => {
 // Create test case
 const result = await db
 .insert(yorhaCases)
 .values({
 case_number: 'PERF-CASE-001',
 title: 'Performance Test Case',
 status: 'active',
 priority: 'medium',
 created_by: mockUser.id,
 })
 .returning();

 caseId = result[0].id;
 });

 describe('API Response Times', () => {
 it('should fetch cases within 500ms', async () => {
 const start = performance.now();

 await db.select().from(yorhaCases).where(eq(yorhaCases.created_by, mockUser.id));

 const duration = performance.now() - start;
 expect(duration).toBeLessThan(500);
 });

 it('should create evidence node within 300ms', async () => {
 const start = performance.now();

 await db
 .insert(yorhaEvidenceNodes)
 .values({
 case_id: caseId,
 title: 'Performance Test Node',
 evidence_type: 'document',
 created_by: mockUser.id,
 })
 .returning();

 const duration = performance.now() - start;
 expect(duration).toBeLessThan(300);
 });

 it('should query evidence nodes within 200ms', async () => {
 const start = performance.now();

 await db.select().from(yorhaEvidenceNodes).where(eq(yorhaEvidenceNodes.case_id, caseId));

 const duration = performance.now() - start;
 expect(duration).toBeLessThan(200);
 });
 });

 describe('Bulk Operations', () => {
 it('should handle bulk insert of 100 nodes', async () => {
 const nodes = Array.from({ length: 100 }, (_, i) => ({
 case_id: caseId,
 title: `Bulk Node ${ i }`,
 evidence_type: 'document',
 created_by: mockUser.id,
 }));

 const start = performance.now();

 await db.insert(yorhaEvidenceNodes).values(nodes);

 const duration = performance.now() - start;
 expect(duration).toBeLessThan(5000); // 5 seconds for 100 inserts
 });
 });

 describe('Query Optimization', () => {
 it('should use indexes efficiently', async () => {
 const start = performance.now();

 // Query using indexed column
 await db.select().from(yorhaEvidenceNodes).where(eq(yorhaEvidenceNodes.case_id, caseId));

 const duration = performance.now() - start;
 expect(duration).toBeLessThan(100); // Should be very fast with index
 });
 });
});
