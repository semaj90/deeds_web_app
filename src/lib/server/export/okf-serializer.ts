/**
 * OKF (OpenKnowledge Framework) Serializer
 *
 * Exports Graphify pipeline artifacts in OKF format:
 * - Knowledge documents (facts, entities, relationships)
 * - Structured metadata (schema, provenance, version)
 * - Serialization formats (JSON-LD, N-Quads, Turtle)
 *
 * OKF enables:
 * - Cross-system knowledge portability
 * - RDF triple store interop (Neo4j, ArangoDB, etc.)
 * - Semantic web compliance (W3C standards)
 * - Audit trail (PROV-O provenance)
 */

import crypto from 'crypto';

export interface OKFDocument {
  '@context': {
    '@vocab': string;
    [key: string]: string | Record<string, unknown>;
  };
  '@type': 'KnowledgeDocument' | 'KnowledgeGraph' | 'KnowledgeAsset';
  '@id': string;
  name: string;
  description: string;
  version: string;
  created: string;
  modified: string;
  license: string;
  attributions: OKFAttribution[];
  content: OKFContent;
  metadata: OKFMetadata;
  provenance: OKFProvenance;
}

export interface OKFAttribution {
  name: string;
  role: 'author' | 'contributor' | 'agent';
  entity: string;
}

export interface OKFContent {
  '@type': 'Graph' | 'EntitySet' | 'FactSet';
  entities: OKFEntity[];
  relationships: OKFRelationship[];
  facts: OKFFact[];
}

export interface OKFEntity {
  '@id': string;
  '@type': string | string[];
  name: string;
  description?: string;
  properties: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface OKFRelationship {
  '@id': string;
  '@type': 'Relationship';
  source: string;
  target: string;
  relationType: string;
  properties?: Record<string, unknown>;
  weight?: number;
}

export interface OKFFact {
  '@id': string;
  '@type': 'Fact';
  subject: string;
  predicate: string;
  object: string | number | boolean;
  confidence?: number;
  source?: string;
  timestamp?: string;
}

export interface OKFMetadata {
  schema_version: string;
  entity_count: number;
  relationship_count: number;
  fact_count: number;
  language: string;
  checksum: string;
  format: 'jsonld' | 'nquads' | 'turtle';
}

export interface OKFProvenance {
  '@type': 'Provenance';
  wasGeneratedBy: {
    '@type': 'Activity';
    name: string;
    description: string;
    startTime: string;
    endTime: string;
    duration_ms: number;
    agent: string;
  };
  wasDerivedFrom: Array<{
    source: string;
    timestamp: string;
  }>;
  hadPrimarySource: Array<{
    '@id': string;
    name: string;
    type: string;
  }>;
}

export class OKFSerializer {
  private baseContext: OKFDocument['@context'] = {
    '@vocab': 'http://purl.org/okf/core#',
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    owl: 'http://www.w3.org/2002/07/owl#',
    schema: 'http://schema.org/',
    prov: 'http://www.w3.org/ns/prov#',
    dcat: 'http://www.w3.org/ns/dcat#',
  };

  /**
   * Create OKF document from Graphify stage output
   */
  createDocument(params: {
    stage_name: string;
    stage_id: number;
    content: {
      entities: OKFEntity[];
      relationships: OKFRelationship[];
      facts: OKFFact[];
    };
    execution_duration_ms: number;
    execution_agent: string;
    source_refs?: Array<{ id: string; name: string; type: string }>;
  }): OKFDocument {
    const documentId = this.generateDocumentId(params.stage_name, params.stage_id);
    const now = new Date().toISOString();
    const checksum = this.computeChecksum(params.content);

    const doc: OKFDocument = {
      '@context': this.baseContext,
      '@type': 'KnowledgeDocument',
      '@id': documentId,
      name: `${params.stage_name} Knowledge Export`,
      description: `OKF export of Graphify stage ${params.stage_id} output`,
      version: '1.0',
      created: now,
      modified: now,
      license: 'CC-BY-4.0',
      attributions: [
        {
          name: 'Graphify Pipeline',
          role: 'agent',
          entity: `graphify:stage:${params.stage_id}`,
        },
      ],
      content: {
        '@type': 'Graph',
        entities: params.content.entities,
        relationships: params.content.relationships,
        facts: params.content.facts,
      },
      metadata: {
        schema_version: '1.0',
        entity_count: params.content.entities.length,
        relationship_count: params.content.relationships.length,
        fact_count: params.content.facts.length,
        language: 'en',
        checksum,
        format: 'jsonld',
      },
      provenance: {
        '@type': 'Provenance',
        wasGeneratedBy: {
          '@type': 'Activity',
          name: params.stage_name,
          description: `Stage ${params.stage_id} execution`,
          startTime: new Date(Date.now() - params.execution_duration_ms).toISOString(),
          endTime: now,
          duration_ms: params.execution_duration_ms,
          agent: params.execution_agent,
        },
        wasDerivedFrom: [],
        hadPrimarySource: params.source_refs || [],
      },
    };

    return doc;
  }

  /**
   * Serialize document to JSON-LD format
   */
  serializeJsonLD(doc: OKFDocument): string {
    return JSON.stringify(doc, null, 2);
  }

  /**
   * Serialize document to N-Quads RDF format
   */
  serializeNQuads(doc: OKFDocument): string {
    const quads: string[] = [];
    const docUri = doc['@id'];

    // Document metadata triples
    quads.push(`<${docUri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${doc['@type']}> .`);
    quads.push(
      `<${docUri}> <http://purl.org/dc/elements/1.1/title> "${this.escapeString(doc.name)}" .`
    );
    quads.push(
      `<${docUri}> <http://purl.org/dc/elements/1.1/issued> "${doc.created}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`
    );

    // Entity triples
    for (const entity of doc.content.entities) {
      quads.push(
        `<${entity['@id']}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${Array.isArray(entity['@type']) ? entity['@type'][0] : entity['@type']}> .`
      );
      quads.push(
        `<${entity['@id']}> <http://purl.org/dc/elements/1.1/title> "${this.escapeString(entity.name)}" .`
      );
    }

    // Relationship triples
    for (const rel of doc.content.relationships) {
      quads.push(
        `<${rel.source}> <http://purl.org/okf/core#${rel.relationType}> <${rel.target}> .`
      );
      if (rel.weight !== undefined) {
        quads.push(
          `<${rel['@id']}> <http://purl.org/okf/core#weight> "${rel.weight}"^^<http://www.w3.org/2001/XMLSchema#float> .`
        );
      }
    }

    // Fact triples
    for (const fact of doc.content.facts) {
      const objectValue =
        typeof fact.object === 'string'
          ? `"${this.escapeString(fact.object)}"`
          : `"${fact.object}"^^<http://www.w3.org/2001/XMLSchema#${typeof fact.object}>`;

      quads.push(`<${fact.subject}> <${fact.predicate}> ${objectValue} .`);

      if (fact.confidence !== undefined) {
        quads.push(
          `<${fact['@id']}> <http://purl.org/okf/core#confidence> "${fact.confidence}"^^<http://www.w3.org/2001/XMLSchema#float> .`
        );
      }
    }

    return quads.join('\n');
  }

  /**
   * Serialize document to Turtle RDF format
   */
  serializeTurtle(doc: OKFDocument): string {
    let ttl = '';

    // Prefixes
    ttl += '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n';
    ttl += '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n';
    ttl += '@prefix okf: <http://purl.org/okf/core#> .\n';
    ttl += '@prefix dc: <http://purl.org/dc/elements/1.1/> .\n';
    ttl += '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n\n';

    // Document
    ttl += `<${doc['@id']}>\n`;
    ttl += `  a okf:KnowledgeDocument ;\n`;
    ttl += `  dc:title "${this.escapeString(doc.name)}" ;\n`;
    ttl += `  dc:issued "${doc.created}"^^xsd:dateTime ;\n`;
    ttl += `  dc:license "${doc.license}" .\n\n`;

    // Entities
    for (const entity of doc.content.entities) {
      ttl += `<${entity['@id']}>\n`;
      ttl += `  a okf:Entity ;\n`;
      ttl += `  dc:title "${this.escapeString(entity.name)}" `;
      if (entity.description) {
        ttl += `;\n  dc:description "${this.escapeString(entity.description)}"`;
      }
      ttl += ` .\n\n`;
    }

    // Relationships
    for (const rel of doc.content.relationships) {
      ttl += `<${rel.source}> okf:${rel.relationType} <${rel.target}> ;\n`;
      if (rel.weight !== undefined) {
        ttl += `  okf:weight ${rel.weight} .\n`;
      }
    }

    return ttl;
  }

  /**
   * Create OKF package (ZIP with manifest)
   */
  async createPackage(
    documents: OKFDocument[],
    packageName: string
  ): Promise<{ manifest: string; documents: Array<{ name: string; content: string }> }> {
    const manifestEntry = {
      name: packageName,
      description: 'OKF Knowledge Package',
      version: '1.0',
      created: new Date().toISOString(),
      documents: documents.map((doc) => ({
        id: doc['@id'],
        name: doc.name,
        entity_count: doc.metadata.entity_count,
        relationship_count: doc.metadata.relationship_count,
        checksum: doc.metadata.checksum,
      })),
    };

    return {
      manifest: JSON.stringify(manifestEntry, null, 2),
      documents: documents.map((doc) => ({
        name: `${doc['@id']}.jsonld`,
        content: this.serializeJsonLD(doc),
      })),
    };
  }

  /**
   * Generate document ID from stage name/ID
   */
  private generateDocumentId(stageName: string, stageId: number): string {
    const slug = stageName.toLowerCase().replace(/\s+/g, '-');
    return `okf:graphify:${slug}:${stageId}:${Date.now()}`;
  }

  /**
   * Compute checksum of document content
   */
  private computeChecksum(content: OKFContent): string {
    const contentStr = JSON.stringify(content);
    return crypto.createHash('sha256').update(contentStr).digest('hex').slice(0, 16);
  }

  /**
   * Escape string for RDF/Turtle output
   */
  private escapeString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }
}
