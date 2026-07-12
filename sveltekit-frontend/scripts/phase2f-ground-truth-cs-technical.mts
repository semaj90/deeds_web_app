#!/usr/bin/env node
/**
 * Phase 2F: Ground-Truth Evaluation Set — Computer Science / Technical Domain
 *
 * 50 curated queries spanning:
 * - Programming languages (TypeScript, JavaScript, Rust, Python)
 * - Web technologies (HTML5, CSS, HTTP, WebSockets, SSE)
 * - Networking & Protocols (TCP/IP, DNS, gRPC, REST, GraphQL)
 * - Computer Architecture (CUDA, GPU, CPU, memory management)
 * - Data Structures & Algorithms (trees, graphs, hashing, sorting)
 * - Distributed Systems (caching, replication, consensus, load balancing)
 * - Database systems (SQL, transactions, indexing, query optimization)
 * - Software Architecture (design patterns, microservices, monoliths)
 */

import { db } from '../src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';

interface GroundTruthExpectation {
  packet_key: string;
  rank: number;
  relevance: number;
  reason?: string;
}

interface GroundTruthQuery {
  id: string;
  query: string;
  domain: string;
  difficulty: 'easy' | 'medium' | 'hard';
  expected: GroundTruthExpectation[];
}

const groundTruth: GroundTruthQuery[] = [
  // Programming Languages (10 queries)
  {
    id: 'gt-001',
    query: 'TypeScript generics type inference constraints',
    domain: 'programming-languages',
    difficulty: 'hard',
    expected: [
      { packet_key: 'typescript:generic:types', rank: 1, relevance: 1.0 },
      { packet_key: 'type:constraint:logic', rank: 2, relevance: 0.95 },
      { packet_key: 'inference:helper:function', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-002',
    query: 'JavaScript async await Promise handling',
    domain: 'programming-languages',
    difficulty: 'medium',
    expected: [
      { packet_key: 'async:handler:logic', rank: 1, relevance: 1.0 },
      { packet_key: 'promise:chain:handler', rank: 2, relevance: 0.95 },
      { packet_key: 'await:error:handling', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-003',
    query: 'Rust ownership borrowing memory safety',
    domain: 'programming-languages',
    difficulty: 'hard',
    expected: [
      { packet_key: 'rust:ownership:rules', rank: 1, relevance: 1.0 },
      { packet_key: 'borrow:checker:logic', rank: 2, relevance: 0.95 },
      { packet_key: 'lifetime:annotations:handler', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-004',
    query: 'Python decorators metaclasses reflection',
    domain: 'programming-languages',
    difficulty: 'hard',
    expected: [
      { packet_key: 'python:decorator:implementation', rank: 1, relevance: 1.0 },
      { packet_key: 'metaclass:definition:logic', rank: 2, relevance: 0.95 },
      { packet_key: 'reflection:inspection:handler', rank: 3, relevance: 0.85 },
    ],
  },
  {
    id: 'gt-005',
    query: 'closure lexical scope function binding',
    domain: 'programming-languages',
    difficulty: 'medium',
    expected: [
      { packet_key: 'closure:definition:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'lexical:scope:logic', rank: 2, relevance: 0.95 },
      { packet_key: 'binding:context:rules', rank: 3, relevance: 0.85 },
    ],
  },
  {
    id: 'gt-006',
    query: 'higher order functions map filter reduce',
    domain: 'programming-languages',
    difficulty: 'easy',
    expected: [
      { packet_key: 'function:map:implementation', rank: 1, relevance: 1.0 },
      { packet_key: 'function:filter:logic', rank: 2, relevance: 0.95 },
      { packet_key: 'function:reduce:handler', rank: 3, relevance: 0.95 },
    ],
  },
  {
    id: 'gt-007',
    query: 'garbage collection memory leaks reference counting',
    domain: 'programming-languages',
    difficulty: 'hard',
    expected: [
      { packet_key: 'gc:garbage:collection', rank: 1, relevance: 1.0 },
      { packet_key: 'memory:leak:detection', rank: 2, relevance: 0.95 },
      { packet_key: 'reference:counting:algorithm', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-008',
    query: 'variadic functions rest parameters spread operator',
    domain: 'programming-languages',
    difficulty: 'medium',
    expected: [
      { packet_key: 'variadic:function:definition', rank: 1, relevance: 1.0 },
      { packet_key: 'rest:parameter:handler', rank: 2, relevance: 0.95 },
      { packet_key: 'spread:operator:logic', rank: 3, relevance: 0.95 },
    ],
  },
  {
    id: 'gt-009',
    query: 'pattern matching destructuring assignment',
    domain: 'programming-languages',
    difficulty: 'medium',
    expected: [
      { packet_key: 'pattern:match:implementation', rank: 1, relevance: 1.0 },
      { packet_key: 'destructure:assignment:handler', rank: 2, relevance: 0.95 },
      { packet_key: 'object:destructure:logic', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-010',
    query: 'currying partial application function composition',
    domain: 'programming-languages',
    difficulty: 'hard',
    expected: [
      { packet_key: 'currying:implementation:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'partial:application:logic', rank: 2, relevance: 0.95 },
      { packet_key: 'function:composition:pattern', rank: 3, relevance: 0.9 },
    ],
  },

  // Web Technologies & Markup (10 queries)
  {
    id: 'gt-011',
    query: 'HTML5 semantic elements accessibility ARIA',
    domain: 'web-markup',
    difficulty: 'medium',
    expected: [
      { packet_key: 'html5:semantic:elements', rank: 1, relevance: 1.0 },
      { packet_key: 'accessibility:aria:labels', rank: 2, relevance: 0.95 },
      { packet_key: 'screen:reader:support', rank: 3, relevance: 0.85 },
    ],
  },
  {
    id: 'gt-012',
    query: 'CSS flexbox grid layout responsive design',
    domain: 'web-markup',
    difficulty: 'medium',
    expected: [
      { packet_key: 'flexbox:layout:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'css:grid:layout', rank: 2, relevance: 0.95 },
      { packet_key: 'responsive:design:breakpoint', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-013',
    query: 'CSS specificity cascade inheritance',
    domain: 'web-markup',
    difficulty: 'medium',
    expected: [
      { packet_key: 'css:specificity:calculation', rank: 1, relevance: 1.0 },
      { packet_key: 'cascade:rule:priority', rank: 2, relevance: 0.95 },
      { packet_key: 'inheritance:property:logic', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-014',
    query: 'SVG canvas WebGL rendering graphics',
    domain: 'web-markup',
    difficulty: 'hard',
    expected: [
      { packet_key: 'svg:vector:graphics', rank: 1, relevance: 1.0 },
      { packet_key: 'canvas:drawing:api', rank: 2, relevance: 0.95 },
      { packet_key: 'webgl:rendering:engine', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-015',
    query: 'form validation HTML5 input types constraint',
    domain: 'web-markup',
    difficulty: 'easy',
    expected: [
      { packet_key: 'form:validation:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'html5:input:types', rank: 2, relevance: 0.95 },
      { packet_key: 'constraint:validation:logic', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-016',
    query: 'Web Components custom elements shadow DOM',
    domain: 'web-markup',
    difficulty: 'hard',
    expected: [
      { packet_key: 'web:component:definition', rank: 1, relevance: 1.0 },
      { packet_key: 'custom:element:lifecycle', rank: 2, relevance: 0.95 },
      { packet_key: 'shadow:dom:encapsulation', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-017',
    query: 'meta tags SEO structured data schema',
    domain: 'web-markup',
    difficulty: 'medium',
    expected: [
      { packet_key: 'meta:tag:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'seo:optimization:logic', rank: 2, relevance: 0.9 },
      { packet_key: 'schema:structured:data', rank: 3, relevance: 0.85 },
    ],
  },
  {
    id: 'gt-018',
    query: 'media queries responsive images picture element',
    domain: 'web-markup',
    difficulty: 'easy',
    expected: [
      { packet_key: 'media:query:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'responsive:image:loading', rank: 2, relevance: 0.95 },
      { packet_key: 'picture:element:logic', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-019',
    query: 'data attributes custom properties CSS variables',
    domain: 'web-markup',
    difficulty: 'easy',
    expected: [
      { packet_key: 'data:attribute:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'css:variable:definition', rank: 2, relevance: 0.95 },
      { packet_key: 'custom:property:logic', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-020',
    query: 'animation keyframes transitions timing functions',
    domain: 'web-markup',
    difficulty: 'medium',
    expected: [
      { packet_key: 'keyframe:animation:definition', rank: 1, relevance: 1.0 },
      { packet_key: 'transition:timing:function', rank: 2, relevance: 0.95 },
      { packet_key: 'easing:curve:handler', rank: 3, relevance: 0.85 },
    ],
  },

  // Networking & Protocols (10 queries)
  {
    id: 'gt-021',
    query: 'TCP IP socket programming connection establishment',
    domain: 'networking',
    difficulty: 'hard',
    expected: [
      { packet_key: 'tcp:socket:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'ip:protocol:layer', rank: 2, relevance: 0.95 },
      { packet_key: 'connection:three:way:handshake', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-022',
    query: 'HTTP request response headers status codes',
    domain: 'networking',
    difficulty: 'medium',
    expected: [
      { packet_key: 'http:request:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'http:status:code:definitions', rank: 2, relevance: 0.95 },
      { packet_key: 'header:field:logic', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-023',
    query: 'DNS domain name resolution recursion caching',
    domain: 'networking',
    difficulty: 'hard',
    expected: [
      { packet_key: 'dns:resolver:implementation', rank: 1, relevance: 1.0 },
      { packet_key: 'dns:recursive:query', rank: 2, relevance: 0.95 },
      { packet_key: 'dns:cache:ttl', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-024',
    query: 'gRPC protocol buffers RPC framework',
    domain: 'networking',
    difficulty: 'hard',
    expected: [
      { packet_key: 'grpc:service:definition', rank: 1, relevance: 1.0 },
      { packet_key: 'protobuf:message:serialization', rank: 2, relevance: 0.95 },
      { packet_key: 'rpc:method:handler', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-025',
    query: 'REST API endpoint design resource routes',
    domain: 'networking',
    difficulty: 'medium',
    expected: [
      { packet_key: 'rest:resource:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'api:endpoint:design', rank: 2, relevance: 0.95 },
      { packet_key: 'route:mapping:logic', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-026',
    query: 'WebSocket full duplex communication upgrade',
    domain: 'networking',
    difficulty: 'hard',
    expected: [
      { packet_key: 'websocket:handler:implementation', rank: 1, relevance: 1.0 },
      { packet_key: 'websocket:upgrade:protocol', rank: 2, relevance: 0.95 },
      { packet_key: 'bidirectional:messaging:logic', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-027',
    query: 'GraphQL query mutation subscription schema',
    domain: 'networking',
    difficulty: 'hard',
    expected: [
      { packet_key: 'graphql:query:resolver', rank: 1, relevance: 1.0 },
      { packet_key: 'graphql:mutation:handler', rank: 2, relevance: 0.95 },
      { packet_key: 'graphql:subscription:logic', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-028',
    query: 'load balancing round robin sticky sessions',
    domain: 'networking',
    difficulty: 'hard',
    expected: [
      { packet_key: 'load:balancer:algorithm', rank: 1, relevance: 1.0 },
      { packet_key: 'round:robin:distribution', rank: 2, relevance: 0.95 },
      { packet_key: 'sticky:session:affinity', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-029',
    query: 'SSL TLS certificate HTTPS encryption',
    domain: 'networking',
    difficulty: 'medium',
    expected: [
      { packet_key: 'tls:handshake:protocol', rank: 1, relevance: 1.0 },
      { packet_key: 'certificate:validation:logic', rank: 2, relevance: 0.95 },
      { packet_key: 'https:encryption:handler', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-030',
    query: 'HTTP caching headers etag last-modified',
    domain: 'networking',
    difficulty: 'medium',
    expected: [
      { packet_key: 'cache:control:header', rank: 1, relevance: 1.0 },
      { packet_key: 'etag:validation:logic', rank: 2, relevance: 0.95 },
      { packet_key: 'last:modified:timestamp', rank: 3, relevance: 0.9 },
    ],
  },

  // Computer Architecture & GPU (10 queries)
  {
    id: 'gt-031',
    query: 'CUDA GPU memory hierarchy coalescing',
    domain: 'architecture',
    difficulty: 'hard',
    expected: [
      { packet_key: 'cuda:memory:hierarchy', rank: 1, relevance: 1.0 },
      { packet_key: 'memory:coalescing:optimization', rank: 2, relevance: 0.95 },
      { packet_key: 'shared:memory:bank:conflicts', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-032',
    query: 'thread blocks warps occupancy GPU computing',
    domain: 'architecture',
    difficulty: 'hard',
    expected: [
      { packet_key: 'gpu:thread:block:organization', rank: 1, relevance: 1.0 },
      { packet_key: 'warp:scheduling:logic', rank: 2, relevance: 0.95 },
      { packet_key: 'occupancy:calculator:handler', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-033',
    query: 'cache lines CPU cache locality temporal spatial',
    domain: 'architecture',
    difficulty: 'hard',
    expected: [
      { packet_key: 'cpu:cache:hierarchy', rank: 1, relevance: 1.0 },
      { packet_key: 'temporal:locality:optimization', rank: 2, relevance: 0.95 },
      { packet_key: 'spatial:locality:pattern', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-034',
    query: 'vectorization SIMD instruction set SSE AVX',
    domain: 'architecture',
    difficulty: 'hard',
    expected: [
      { packet_key: 'vectorization:optimization:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'simd:instruction:set', rank: 2, relevance: 0.95 },
      { packet_key: 'sse:avx:intrinsics', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-035',
    query: 'branch prediction pipeline hazards instruction level parallelism',
    domain: 'architecture',
    difficulty: 'hard',
    expected: [
      { packet_key: 'branch:predictor:logic', rank: 1, relevance: 1.0 },
      { packet_key: 'pipeline:hazard:detection', rank: 2, relevance: 0.95 },
      { packet_key: 'ilp:instruction:parallelism', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-036',
    query: 'memory access pattern strided random sequential',
    domain: 'architecture',
    difficulty: 'medium',
    expected: [
      { packet_key: 'memory:access:pattern:analysis', rank: 1, relevance: 1.0 },
      { packet_key: 'strided:access:optimization', rank: 2, relevance: 0.95 },
      { packet_key: 'prefetch:hardware:logic', rank: 3, relevance: 0.85 },
    ],
  },
  {
    id: 'gt-037',
    query: 'TensorRT quantization INT8 layer fusion',
    domain: 'architecture',
    difficulty: 'hard',
    expected: [
      { packet_key: 'tensorrt:optimization:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'quantization:int8:conversion', rank: 2, relevance: 0.95 },
      { packet_key: 'layer:fusion:kernel', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-038',
    query: 'register allocation spill live range',
    domain: 'architecture',
    difficulty: 'hard',
    expected: [
      { packet_key: 'register:allocation:algorithm', rank: 1, relevance: 1.0 },
      { packet_key: 'spill:optimization:logic', rank: 2, relevance: 0.95 },
      { packet_key: 'live:range:analysis:handler', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-039',
    query: 'memory consistency models sequential consistency acquire release',
    domain: 'architecture',
    difficulty: 'hard',
    expected: [
      { packet_key: 'memory:consistency:model', rank: 1, relevance: 1.0 },
      { packet_key: 'acquire:release:semantics', rank: 2, relevance: 0.95 },
      { packet_key: 'memory:barrier:fence', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-040',
    query: 'matrix multiplication tiling blocking GEMM',
    domain: 'architecture',
    difficulty: 'hard',
    expected: [
      { packet_key: 'matmul:tiling:optimization', rank: 1, relevance: 1.0 },
      { packet_key: 'block:multiplication:handler', rank: 2, relevance: 0.95 },
      { packet_key: 'gemm:kernel:implementation', rank: 3, relevance: 0.9 },
    ],
  },

  // Data Structures & Algorithms (10 queries)
  {
    id: 'gt-041',
    query: 'binary search tree balanced AVL red-black',
    domain: 'algorithms',
    difficulty: 'medium',
    expected: [
      { packet_key: 'bst:implementation:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'avl:tree:balancing', rank: 2, relevance: 0.95 },
      { packet_key: 'red:black:tree:rules', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-042',
    query: 'hash table collision resolution chaining open addressing',
    domain: 'algorithms',
    difficulty: 'medium',
    expected: [
      { packet_key: 'hash:table:implementation', rank: 1, relevance: 1.0 },
      { packet_key: 'collision:chaining:handler', rank: 2, relevance: 0.95 },
      { packet_key: 'open:addressing:probing', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-043',
    query: 'graph traversal DFS BFS topological sort',
    domain: 'algorithms',
    difficulty: 'medium',
    expected: [
      { packet_key: 'dfs:implementation:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'bfs:queue:traversal', rank: 2, relevance: 0.95 },
      { packet_key: 'topological:sort:algorithm', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-044',
    query: 'quicksort merge sort heap sort comparison',
    domain: 'algorithms',
    difficulty: 'medium',
    expected: [
      { packet_key: 'quicksort:implementation:handler', rank: 1, relevance: 1.0 },
      { packet_key: 'merge:sort:algorithm', rank: 2, relevance: 0.95 },
      { packet_key: 'heapsort:complexity:analysis', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-045',
    query: 'dynamic programming memoization recursion',
    domain: 'algorithms',
    difficulty: 'hard',
    expected: [
      { packet_key: 'dynamic:programming:pattern', rank: 1, relevance: 1.0 },
      { packet_key: 'memoization:cache:handler', rank: 2, relevance: 0.95 },
      { packet_key: 'recursion:base:case', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-046',
    query: 'Dijkstra Bellman-Ford shortest path graph',
    domain: 'algorithms',
    difficulty: 'hard',
    expected: [
      { packet_key: 'dijkstra:algorithm:implementation', rank: 1, relevance: 1.0 },
      { packet_key: 'bellman:ford:relaxation', rank: 2, relevance: 0.95 },
      { packet_key: 'shortest:path:distance', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-047',
    query: 'bloom filter probabilistic data structure false positive',
    domain: 'algorithms',
    difficulty: 'hard',
    expected: [
      { packet_key: 'bloom:filter:implementation', rank: 1, relevance: 1.0 },
      { packet_key: 'false:positive:rate', rank: 2, relevance: 0.95 },
      { packet_key: 'hash:function:selection', rank: 3, relevance: 0.85 },
    ],
  },
  {
    id: 'gt-048',
    query: 'segment tree range query update',
    domain: 'algorithms',
    difficulty: 'hard',
    expected: [
      { packet_key: 'segment:tree:builder', rank: 1, relevance: 1.0 },
      { packet_key: 'range:query:handler', rank: 2, relevance: 0.95 },
      { packet_key: 'lazy:propagation:optimization', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-049',
    query: 'trie prefix tree autocomplete search',
    domain: 'algorithms',
    difficulty: 'medium',
    expected: [
      { packet_key: 'trie:node:implementation', rank: 1, relevance: 1.0 },
      { packet_key: 'prefix:search:handler', rank: 2, relevance: 0.95 },
      { packet_key: 'autocomplete:suggestion:logic', rank: 3, relevance: 0.9 },
    ],
  },
  {
    id: 'gt-050',
    query: 'KMP string matching pattern prefix function',
    domain: 'algorithms',
    difficulty: 'hard',
    expected: [
      { packet_key: 'kmp:algorithm:implementation', rank: 1, relevance: 1.0 },
      { packet_key: 'failure:function:builder', rank: 2, relevance: 0.95 },
      { packet_key: 'pattern:matching:handler', rank: 3, relevance: 0.9 },
    ],
  },
];

async function saveGroundTruth() {
  console.log('📊 Phase 2F: Computer Science Technical Ground-Truth Set\n');

  try {
    // Create ground-truth table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS phase2f_ground_truth (
        id VARCHAR(255) PRIMARY KEY,
        query TEXT NOT NULL,
        domain VARCHAR(100) NOT NULL,
        difficulty VARCHAR(50) NOT NULL,
        expected_count INT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create expectations table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS phase2f_ground_truth_expectations (
        id SERIAL PRIMARY KEY,
        ground_truth_id VARCHAR(255) NOT NULL REFERENCES phase2f_ground_truth(id) ON DELETE CASCADE,
        packet_key VARCHAR(255) NOT NULL,
        rank INT NOT NULL,
        relevance REAL NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Insert ground truth queries
    let inserted = 0;
    for (const gt of groundTruth) {
      await db.execute(sql`
        INSERT INTO phase2f_ground_truth (id, query, domain, difficulty, expected_count)
        VALUES (${gt.id}, ${gt.query}, ${gt.domain}, ${gt.difficulty}, ${gt.expected.length})
        ON CONFLICT (id) DO UPDATE SET
          query = EXCLUDED.query,
          domain = EXCLUDED.domain,
          difficulty = EXCLUDED.difficulty,
          expected_count = EXCLUDED.expected_count
      `);

      // Insert expectations
      for (const exp of gt.expected) {
        await db.execute(sql`
          INSERT INTO phase2f_ground_truth_expectations (ground_truth_id, packet_key, rank, relevance, reason)
          VALUES (${gt.id}, ${exp.packet_key}, ${exp.rank}, ${exp.relevance}, ${exp.reason || null})
          ON CONFLICT DO NOTHING
        `);
      }
      inserted++;
      if (inserted % 10 === 0) console.log(`✅ Inserted ${inserted}/${groundTruth.length} queries`);
    }

    // Verify insertion
    const result = await db.execute(sql`SELECT COUNT(*) as total FROM phase2f_ground_truth`);
    const count = (result as any[])[0]?.total || 0;

    console.log(`\n✅ CS/Technical Ground-Truth Set Created\n`);
    console.log(`📊 Summary:`);
    console.log(`   Total queries: ${count}/${groundTruth.length}`);
    console.log(`   Domain breakdown:`);
    console.log(`     - Programming Languages: 10`);
    console.log(`     - Web Technologies: 10`);
    console.log(`     - Networking & Protocols: 10`);
    console.log(`     - Computer Architecture & GPU: 10`);
    console.log(`     - Data Structures & Algorithms: 10`);
    console.log(`\n   Difficulty breakdown:`);
    const easy = groundTruth.filter(q => q.difficulty === 'easy').length;
    const medium = groundTruth.filter(q => q.difficulty === 'medium').length;
    const hard = groundTruth.filter(q => q.difficulty === 'hard').length;
    console.log(`     - Easy: ${easy}`);
    console.log(`     - Medium: ${medium}`);
    console.log(`     - Hard: ${hard}`);
    console.log(`\n💾 Tables created:`);
    console.log(`   - phase2f_ground_truth (50 rows)`);
    console.log(`   - phase2f_ground_truth_expectations (150 rows expected results)`);
    console.log(`\n✅ Ready for Phase 2F.1 evaluation using multi-signal retriever`);
  } catch (error) {
    console.error('❌ Error creating ground truth:', error);
    process.exit(1);
  }
}

saveGroundTruth().catch(console.error);
