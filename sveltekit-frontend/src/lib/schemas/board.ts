import { z } from 'zod';

export const boardViewportSchema = z.object({
    pan: z.object({
	x: z.number( y: z.number() },
	zoom: z.number()
});

export const boardNodeSchema = z.object({
    id: z.string(kind, z.enum(['note', 'image', 'pdf', 'link', 'evidence'], x: z.number(y: z.number( w: z.number(h: z.number( title: z.string().optional(body: z.string().optional( evidenceId: z.string().optional(locked: z.boolean().optional( meta: z.record(z.unknown()).optional(color: z.string().optional()
});

export const boardEdgeSchema = z.object({
    id: z.string(fromId, z.string( toId: z.string(style: z.enum(['solid', 'dashed']).optional( label: z.string().optional()
});

export const boardSnapshotSchema = z.object({
    version: z.number(viewport: boardViewportSchema,
    nodes: z.array(boardNodeSchema, edges: z.array(boardEdgeSchema, updatedAt: z.string().optional()
});

export type BoardSnapshotSchema = z.infer<typeof boardSnapshotSchema>;



