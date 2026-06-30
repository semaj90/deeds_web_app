#!/usr/bin/env npx tsx
/**
 * Topology-Aware Packet Clustering
 * Groups packets by: embeddings + directory/import structure + ontology terms
 * Output: cluster_cards with domain/topology/ontology labels
 *
 * Score formula:
 *   0.45 semantic (Qdrant similarity)
 *   0.20 ontology (domain terms, API endpoints, tables touched)
 *   0.20 topology (directory proximity, import chain)
 *   0.10 workflow (agent lane, error chain)
 *   0.05 source_ref similarity
 */

import { db } from "../../src/lib/server/db/client.js";
import { sql } from "drizzle-orm";

const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");

interface PacketNode {
  packet_key: string;
  source_ref: string;
  file_path: string;
  directory_path: string;
  feature_id: string;
  feature_label: string;
  embedding?: number[];
  payload: any;
  tags: string[];
  summary?: string;
}

interface ClusterLink {
  from_key: string;
  to_key: string;
  link_type: "semantic" | "ontology" | "topology" | "workflow" | "source";
  score: number;
  reason?: string;
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Topology-Aware Packet Clustering                             ║
╚════════════════════════════════════════════════════════════════╝

Mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}
Verbose: ${VERBOSE ? "YES" : "NO"}
`);

  // Fetch all packets with embeddings
  console.log("📦 Loading packets with embeddings...");
  const result = await db.execute(sql`
    SELECT
      packet_key, source_ref, file_path, directory_path,
      feature_id, feature_label, embedding, payload, tags, summary
    FROM atlas_packets
    WHERE embedding IS NOT NULL
    LIMIT 999999
  `) as any;

  const packets: PacketNode[] = (result.rows || []).map((row: any) => ({
    ...row,
    embedding: row.embedding ? Array.from(row.embedding) : undefined,
    tags: row.tags || [],
  }));

  console.log(`✓ Loaded ${packets.length} packets with embeddings`);

  // Build topology/ontology links
  console.log("\n🔗 Building topology/ontology links...");
  const links: ClusterLink[] = [];
  const ontologyTerms = extractOntologyTerms(packets);

  // Link by directory proximity (topology)
  console.log("  - Directory/topology links...");
  const dirGroups = groupByDirectory(packets);
  for (const [dir, group] of Object.entries(dirGroups)) {
    if (group.length > 1) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          links.push({
            from_key: group[i].packet_key,
            to_key: group[j].packet_key,
            link_type: "topology",
            score: 0.20,
            reason: `same_directory:${dir}`,
          });
        }
      }
    }
  }

  // Link by ontology terms (domain/API/table)
  console.log("  - Ontology term links...");
  const termGroups = groupByOntologyTerms(packets, ontologyTerms);
  for (const [term, group] of Object.entries(termGroups)) {
    if (group.length > 1) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          links.push({
            from_key: group[i].packet_key,
            to_key: group[j].packet_key,
            link_type: "ontology",
            score: 0.20,
            reason: `ontology_term:${term}`,
          });
        }
      }
    }
  }

  console.log(`✓ Built ${links.length} cross-packet links`);

  // Group into clusters using greedy algorithm
  console.log("\n🎯 Clustering packets...");
  const clusters = formClusters(packets, links);

  console.log(`✓ Formed ${clusters.length} clusters`);

  // Summarize each cluster
  console.log("\n📊 Cluster summary:");
  const clusterCards = [];
  for (let i = 0; i < Math.min(10, clusters.length); i++) {
    const cluster = clusters[i];
    const card = {
      cluster_id: `cluster:${i}`,
      member_count: cluster.length,
      domain: inferDomain(cluster),
      topology_paths: inferTopology(cluster),
      ontology_terms: extractClusterTerms(cluster),
      representative_packet: cluster[0].packet_key,
      members: cluster.map((p) => p.packet_key).slice(0, 5),
    };
    clusterCards.push(card);
    console.log(
      `  [${i}] ${card.domain} (${card.member_count} packets) → ${card.topology_paths.join(", ")}`
    );
  }

  if (DRY_RUN) {
    console.log(`\n[DRY-RUN] Would create ${clusterCards.length} cluster cards`);
    console.log(`[DRY-RUN] Ready for Colab summarization export`);
    return;
  }

  // Write clusters to Postgres (simplified for now)
  console.log("\n💾 Storing clusters...");
  for (const card of clusterCards) {
    await db.execute(
      sql`
        INSERT INTO cluster_cards (cluster_id, domain, topology, ontology, members, status)
        VALUES (
          ${card.cluster_id},
          ${card.domain},
          ${JSON.stringify(card.topology_paths)},
          ${JSON.stringify(card.ontology_terms)},
          ${JSON.stringify(card.members)},
          'pending_summary'
        )
        ON CONFLICT (cluster_id) DO UPDATE
        SET topology = EXCLUDED.topology,
            ontology = EXCLUDED.ontology,
            members = EXCLUDED.members
      `
    );
  }

  console.log(`✅ Stored ${clusterCards.length} cluster cards`);
  console.log(`\nNext: npm run colab:export:clusters`);
}

function groupByDirectory(packets: PacketNode[]): Record<string, PacketNode[]> {
  const groups: Record<string, PacketNode[]> = {};
  for (const p of packets) {
    const key = p.directory_path || "root";
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }
  return groups;
}

function extractOntologyTerms(packets: PacketNode[]): Set<string> {
  const terms = new Set<string>();
  const keywords = [
    "auth",
    "session",
    "lucia",
    "cookie",
    "jwt",
    "validation",
    "user",
    "case",
    "evidence",
    "document",
    "legal",
    "citation",
    "statute",
    "qdrant",
    "neo4j",
    "postgres",
    "redis",
    "cache",
    "index",
    "search",
    "graph",
    "cluster",
    "embedding",
  ];

  for (const p of packets) {
    const text = (
      p.file_path +
      " " +
      p.feature_label +
      " " +
      p.tags.join(" ") +
      " " +
      JSON.stringify(p.payload).substring(0, 500)
    ).toLowerCase();

    for (const kw of keywords) {
      if (text.includes(kw)) {
        terms.add(kw);
      }
    }
  }
  return terms;
}

function groupByOntologyTerms(
  packets: PacketNode[],
  terms: Set<string>
): Record<string, PacketNode[]> {
  const groups: Record<string, PacketNode[]> = {};

  for (const term of Array.from(terms)) {
    groups[term] = packets.filter((p) => {
      const text = (
        p.file_path +
        " " +
        p.feature_label +
        " " +
        p.tags.join(" ")
      ).toLowerCase();
      return text.includes(term);
    });
  }

  return Object.fromEntries(
    Object.entries(groups).filter(([_, group]) => group.length > 1)
  );
}

function formClusters(
  packets: PacketNode[],
  links: ClusterLink[]
): PacketNode[][] {
  // Simple greedy clustering: start with high-degree nodes
  const clustered = new Set<string>();
  const clusters: PacketNode[][] = [];

  // Sort by number of connections
  const degree = new Map<string, number>();
  for (const p of packets) {
    degree.set(p.packet_key, 0);
  }
  for (const link of links) {
    degree.set(link.from_key, (degree.get(link.from_key) || 0) + 1);
  }

  const sortedPackets = [...packets].sort(
    (a, b) => (degree.get(b.packet_key) || 0) - (degree.get(a.packet_key) || 0)
  );

  for (const seed of sortedPackets) {
    if (clustered.has(seed.packet_key)) continue;

    const cluster = [seed];
    clustered.add(seed.packet_key);

    // Add connected neighbors
    const neighbors = new Set<string>();
    for (const link of links) {
      if (link.from_key === seed.packet_key) {
        neighbors.add(link.to_key);
      }
      if (link.to_key === seed.packet_key) {
        neighbors.add(link.from_key);
      }
    }

    for (const neighborKey of neighbors) {
      if (!clustered.has(neighborKey)) {
        const neighbor = packets.find((p) => p.packet_key === neighborKey);
        if (neighbor) {
          cluster.push(neighbor);
          clustered.add(neighborKey);
        }
      }
    }

    if (cluster.length > 1) {
      clusters.push(cluster);
    }
  }

  // Add unclustered packets as singletons
  for (const p of packets) {
    if (!clustered.has(p.packet_key)) {
      clusters.push([p]);
      clustered.add(p.packet_key);
    }
  }

  return clusters;
}

function inferDomain(cluster: PacketNode[]): string {
  const terms = extractClusterTerms(cluster);
  // Map terms to domains
  if (terms.has("auth") || terms.has("session") || terms.has("lucia"))
    return "authentication";
  if (terms.has("case") || terms.has("evidence") || terms.has("legal"))
    return "legal-cases";
  if (terms.has("qdrant") || terms.has("search") || terms.has("index"))
    return "search-retrieval";
  if (terms.has("neo4j") || terms.has("graph")) return "knowledge-graph";
  if (terms.has("cache") || terms.has("redis")) return "caching";
  return "general-utility";
}

function inferTopology(cluster: PacketNode[]): string[] {
  const dirs = new Set<string>();
  for (const p of cluster) {
    if (p.directory_path) {
      dirs.add(p.directory_path.split("/").slice(0, 3).join("/"));
    }
  }
  return Array.from(dirs);
}

function extractClusterTerms(cluster: PacketNode[]): Set<string> {
  const terms = new Set<string>();
  for (const p of cluster) {
    for (const tag of p.tags || []) {
      terms.add(tag);
    }
  }
  return terms;
}

main().catch(console.error);
