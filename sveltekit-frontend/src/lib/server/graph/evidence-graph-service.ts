import neo4j, { type Driver, type Transaction } from 'neo4j-driver';

// Configuration / env with safe defaults
const NEO4J_URL = process.env.NEO4J_URL ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS ?? 'neo4j';
const NEO4J_INIT_ON_START = (process.env.NEO4J_INIT_ON_START ?? 'false') === 'true';
const CREATE_SIMILARITY = (process.env.NEO4J_CREATE_SIMILARITY_LINKS ?? 'false') === 'true';
const SIMILARITY_THRESHOLD = Number(process.env.NEO4J_SIMILARITY_THRESHOLD ?? 0.85);

// Singleton driver (typed from the runtime factory)
let _driver: Driver | null = null;
function getDriver(): Driver {
    // lazy-init
    if (!_driver) {
        _driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    }
    return _driver;
}

// Ensure basic schema (constraints)
export async function ensureSchema(): Promise<void> {
    if (!NEO4J_INIT_ON_START) return;
    const driver = getDriver();
    const session = driver.session();
    try {
        await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (e:Evidence) REQUIRE e.id IS UNIQUE');
        await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE');
        await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (ent:Entity) REQUIRE ent.id IS UNIQUE');
    } finally {
        await session.close();
    }
}

// Types
export interface EntityInput {
    name: string;
    type?: string | null;
}

export interface EdgeInput {
    from: string;
    to: string;
    relation: string;
}

export interface EvidenceGraphUpsertInput {
    evidenceId: string;
    title?: string | null;
    summary?: string | null;
    riskLevel?: string | null;
    caseId?: string | null;
    caseName?: string | null;
    entities?: EntityInput[];
    relatedEvidence?: Array<{ evidenceId: string }>;
    similarEvidence?: Array<{ evidenceId: string; score: number }>;
}

// Upsert evidence + optional case, entities and explicit edges.
export async function upsertEvidenceGraph(data: EvidenceGraphUpsertInput): Promise<number> {
    const driver = getDriver();
    const session = driver.session();
    let relationshipsCreated = 0;
    try {
        await session.writeTransaction(async (tx: Transaction) => {
            // Upsert evidence node
            await tx.run(
                `MERGE (e:Evidence {id: $evidenceId})
                 SET e.title = COALESCE($title, e.title),
                     e.summary = COALESCE($summary, e.summary),
                     e.riskLevel = COALESCE($riskLevel, e.riskLevel),
                     e.updatedAt = datetime()`,
                {
                    evidenceId: data.evidenceId,
                    title: data.title,
                    summary: data.summary,
                    riskLevel: data.riskLevel,
                }
            );

            // Upsert case and relationship
            if (data.caseId) {
                const res = await tx.run(
                    `MERGE (c:Case {id: $caseId})
                     SET c.name = COALESCE($caseName, c.name), c.updatedAt = datetime()
                     MERGE (e:Evidence {id: $evidenceId})
                     MERGE (e)-[r:ASSOCIATED_WITH]->(c)
                     SET r.updatedAt = datetime()`,
                    { caseId: data.caseId, caseName: data.caseName, evidenceId: data.evidenceId }
                );
                relationshipsCreated += (res.summary.counters.updates().relationshipsCreated ?? 0);
            }

            // Entities and MENTIONS
            if (Array.isArray(data.entities) && data.entities.length) {
                const res = await tx.run(
                    `UNWIND $entities AS ent
                     MERGE (n:Entity {id: ent.id})
                     SET n.name = ent.name, n.type = COALESCE(ent.type, 'unknown'), n.updatedAt = datetime()
                     WITH n
                     MERGE (e:Evidence {id: $evidenceId})
                     MERGE (e)-[r:MENTIONS]->(n)
                     SET r.updatedAt = datetime()`,
                    {
                        evidenceId: data.evidenceId,
                        entities: data.entities.map((ent, idx) => ({
                            id: `${data.evidenceId}:entity:${idx}:${ent.name}`,
                            name: ent.name,
                            type: ent.type ?? null,
                        })),
                    }
                );
                relationshipsCreated += (res.summary.counters.updates().relationshipsCreated ?? 0);
            }
        });
        return relationshipsCreated;
    } catch (err) {
        console.warn('[Neo4j] upsertEvidenceGraph failed:', err);
        return 0;
    } finally {
        await session.close();
    }
}

// Create similarity links
export async function createSimilarityLinks(
    evidenceId: string, neighbors: Array<{ key: string; similarity: number }>
): Promise<void> {
    if (!CREATE_SIMILARITY) return;
    if (!neighbors || neighbors.length === 0) return;

    const driver = getDriver();
    const session = driver.session();
    try {
        await session.writeTransaction(async (tx: Transaction) => {
            for (const n of neighbors) {
                if (n.similarity >= SIMILARITY_THRESHOLD) {
                    await tx.run(
                        `MERGE (a:Evidence {id: $a})
                         MERGE (b:Evidence {id: $b})
                         MERGE (a)-[r:SIMILAR_TO]->(b)
                         SET r.score = $score, r.createdAt = datetime()`,
                        { a: evidenceId, b: n.key, score: n.similarity }
                    );
                }
            }
        });
    } finally {
        await session.close();
    }
}

// Initialize schema on import if requested
ensureSchema().catch((e) => console.debug('neo4j schema init failed', e));

const EvidenceGraphService = {
    upsertEvidenceGraph: createSimilarityLinks,
    ensureSchema,
};

export default EvidenceGraphService;
