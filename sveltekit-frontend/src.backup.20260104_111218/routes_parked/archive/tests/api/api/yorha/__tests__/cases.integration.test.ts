/**
 * Integration tests for YoRHa Cases API
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '$lib/server/db';
import { yorhaCases } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';

describe('YoRHa Cases API Integration', () => {
 const mockUser = {
 id: 'test-user-123',
 email: 'test@example.com',
 };

 const mockCase = {
 case_number: 'CASE-2025-TEST001',
 title: 'Test Case',
 description: 'A test case for integration testing',
 status: 'active' as const,
 priority: 'high' as const,
 created_by: mockUser.id,
 };

 let createdCaseId: string;

 beforeAll(async () => {
 // Clean up any existing test data
 await db.delete(yorhaCases).where(eq(yorhaCases.case_number, mockCase.case_number));
 });

 afterAll(async () => {
 // Clean up test data
 if (createdCaseId) {
 await db.delete(yorhaCases).where(eq(yorhaCases.id, createdCaseId));
 }
 });

 it('should create a new case', async () => {
 const result = await db.insert(yorhaCases).values(mockCase).returning();

 expect(result).toHaveLength(1);
 expect(result[0].case_number).toBe(mockCase.case_number);
 expect(result[0].title).toBe(mockCase.title);
 expect(result[0].status).toBe('active');

 createdCaseId = result[0].id;
 });

 it('should retrieve a case by ID', async () => {
 const result = await db.select().from(yorhaCases).where(eq(yorhaCases.id, createdCaseId));

 expect(result).toHaveLength(1);
 expect(result[0].id).toBe(createdCaseId);
 expect(result[0].case_number).toBe(mockCase.case_number);
 });

 it('should update a case', async () => {
 const updated = await db
 .update(yorhaCases)
 .set({
 title: 'Updated Test Case',
 priority: 'critical',
 updated_at: new Date(),
 })
 .where(eq(yorhaCases.id, createdCaseId))
 .returning();

 expect(updated).toHaveLength(1);
 expect(updated[0].title).toBe('Updated Test Case');
 expect(updated[0].priority).toBe('critical');
 });

 it('should list cases with filters', async () => {
 const result = await db.select().from(yorhaCases).where(eq(yorhaCases.status, 'active'));

 expect(result.length).toBeGreaterThan(0);
 expect(result.every((c) => c.status === 'active')).toBe(true);
 });

 it('should soft delete a case', async () => {
 const updated = await db
 .update(yorhaCases)
 .set({
 status: 'archived',
 updated_at: new Date(),
 })
 .where(eq(yorhaCases.id, createdCaseId))
 .returning();

 expect(updated[0].status).toBe('archived');

 // Verify it's still in database (soft delete)
 const result = await db.select().from(yorhaCases).where(eq(yorhaCases.id, createdCaseId));

 expect(result).toHaveLength(1);
 });
});
