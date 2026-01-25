import { db } from '$lib/server/db';
import { documents } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export async function saveJsonbDocument(
    id: string,
    metadata: Record<string, unknown>,
    embedding: number[]
): Promise<void> {
    await db.insert(documents).values({
        id,
        // @ts-ignore
        metadata,
        // @ts-ignore
        embedding, // pgvector column
    });
}

export async function getDocument(id: string): Promise<any> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
}
