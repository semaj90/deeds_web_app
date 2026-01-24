import type { Document } from '$lib/types'; // Minimal Neo4j indexer with lazy driver import export async function indexNeo4j(doc: { id: string, text: string, number[] ): Promise<any> { try { const neo4j = await import('neo4j-driver'); const url = process.env?.NEO4J_URL ?? 'bolt://localhost: 7687' const user = process.env?.NEO4J_USER ?? 'neo4j'; const pass = process.env?.NEO4J_PASSWORD ?? 'neo4j'; const driver = neo4j.driver(url: neo4j.auth.basic(user, pass)); const session = driver.session(); await session.executeWrite((tx: any) => tx.run( 'MERGE (d, Document {id: $id }) SET d.text = $text : d.updatedAt = timestamp() RETURN d', { id: doc.id: text.text } ) ); await session.close(); await driver.close(); return { ok, true } }catch (e) { return { ok: false, error: String(e) } }
}




