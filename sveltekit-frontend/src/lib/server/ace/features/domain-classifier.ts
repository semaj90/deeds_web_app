import { z } from 'zod';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';

export const DomainClassSchema = z.enum([
  'auth',
  'database',
  'cache',
  'api',
  'ui',
  'util',
  'config',
  'test',
  'worker',
  'search',
  'analysis',
  'ml',
  'document',
  'unknown'
]);

export type DomainClass = z.infer<typeof DomainClassSchema>;

export interface DomainClassificationResult {
  packetKey: string;
  sourceRef: string;
  classifiedDomain: DomainClass;
  confidence: number;
  features: {
    hasAuth: boolean;
    hasDb: boolean;
    hasCache: boolean;
    isTest: boolean;
    hasHttp: boolean;
  };
}

export class DomainClassifier {
  private rules: Map<DomainClass, RegExp[]> = new Map();

  constructor() {
    this.initializeRules();
  }

  private initializeRules(): void {
    // Auth domain
    this.rules.set('auth', [
      /lucia|session|password|token|auth|login|oauth|jwt|credential/i,
      /user.*identif|grant|permission|role|access/i
    ]);

    // Database
    this.rules.set('database', [
      /database|postgres|drizzle|query|migration|schema|table|column/i,
      /db\.|sql|select|insert|update|delete|where/i
    ]);

    // Cache
    this.rules.set('cache', [
      /redis|cache|memcache|valkey|bitfrost|ttl|expir/i,
      /get\(|set\(|invalidate|flush|evict/i
    ]);

    // API
    this.rules.set('api', [
      /route|endpoint|server\.ts|api\/|post|get|put|delete|fetch/i,
      /rest|graphql|rpc|transport|protocol/i
    ]);

    // UI
    this.rules.set('ui', [
      /\.svelte|component|button|dialog|modal|layout|page\.svelte/i,
      /onclick|class:|style:|bind:|slot|snippet/i
    ]);

    // Utilities
    this.rules.set('util', [
      /util|helper|library|function|service|tool|format|parse|convert/i,
      /^lib\/|utils\//i
    ]);

    // Configuration
    this.rules.set('config', [
      /config|env|settings|constants|\.env|tsconfig|vite\.config|svelte\.config/i,
      /process\.env|environment|flag|feature/i
    ]);

    // Tests
    this.rules.set('test', [
      /\.test\.|\.spec\.|__tests__|vitest|jest|expect|describe|it\(/i,
      /mock|stub|fixture|setup|teardown/i
    ]);

    // Workers
    this.rules.set('worker', [
      /worker|thread|async|background|queue|job|task|schedule/i,
      /rabbitm|nats|job.*queue|background.*task/i
    ]);

    // Search
    this.rules.set('search', [
      /search|qdrant|vector|embedding|retrieve|fts|full.*text|lexical/i,
      /similarity|distance|index|query/i
    ]);

    // Analysis
    this.rules.set('analysis', [
      /analysis|audit|report|metric|monitor|observ|trace|telemetry|graph/i,
      /error.*analysis|debug|inspect|validate/i
    ]);

    // ML
    this.rules.set('ml', [
      /model|train|pytorch|tensor|gpu|cuda|inference|kmeans|som|autoencoder/i,
      /embedding|vector.*space|neural|loss|accuracy/i
    ]);

    // Document
    this.rules.set('document', [
      /document|pdf|markdown|text|content|parse|extract|chunk/i,
      /evidence|file|upload|process/i
    ]);
  }

  classifyByPath(sourceRef: string): DomainClass {
    let bestMatch: DomainClass = 'unknown';
    let bestScore = 0;

    for (const [domain, patterns] of this.rules.entries()) {
      let matches = 0;
      for (const pattern of patterns) {
        if (pattern.test(sourceRef)) {
          matches++;
        }
      }
      const score = matches / patterns.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = domain;
      }
    }

    return bestMatch;
  }

  classifyByContent(content: string): DomainClass {
    let bestMatch: DomainClass = 'unknown';
    let bestScore = 0;

    for (const [domain, patterns] of this.rules.entries()) {
      let matches = 0;
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          matches++;
        }
      }
      const score = matches / patterns.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = domain;
      }
    }

    return bestMatch;
  }

  async classifyPacket(
    packetKey: string,
    sourceRef: string,
    limit: number = 1
  ): Promise<DomainClassificationResult | null> {
    // Fetch packet content from DB
    const results = await db.execute(
      sql`
        SELECT packet_key, source_ref, summary
        FROM atlas_packets
        WHERE packet_key = ${packetKey}
        LIMIT ${limit}
      `
    );

    if (results.rows.length === 0) {
      return null;
    }

    const row = results.rows[0] as any;
    const content = row.summary || '';

    // Classify by path and content
    const pathDomain = this.classifyByPath(sourceRef);
    const contentDomain = this.classifyByContent(content);

    // Combine classifications (prefer content when available)
    const classifiedDomain = content ? contentDomain : pathDomain;

    // Extract feature indicators
    const features = {
      hasAuth: /lucia|password|token|session/i.test(content),
      hasDb: /database|postgres|drizzle|sql/i.test(content),
      hasCache: /redis|cache|bitfrost/i.test(content),
      isTest: /(test|spec)\.ts/i.test(sourceRef),
      hasHttp: /fetch|post|get|put|delete|rest/i.test(content)
    };

    // Calculate confidence
    const confidence =
      (features.hasAuth ? 0.15 : 0) +
      (features.hasDb ? 0.15 : 0) +
      (features.hasCache ? 0.15 : 0) +
      (features.isTest ? 0.1 : 0) +
      (features.hasHttp ? 0.15 : 0) +
      (classifiedDomain !== 'unknown' ? 0.3 : 0);

    return {
      packetKey,
      sourceRef,
      classifiedDomain,
      confidence: Math.min(confidence, 1.0),
      features
    };
  }
}
