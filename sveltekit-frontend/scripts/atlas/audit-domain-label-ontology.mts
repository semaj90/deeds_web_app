#!/usr/bin/env node

/**
 * Audit Domain Label Ontology
 *
 * Loads all unique domain_class values from atlas_packets, detects:
 * - Case mismatches
 * - Aliases (e.g., "Graph" vs "graph", "Database" vs "database")
 * - Parent/child hints (e.g., "graph" is likely parent of "graph_topology")
 * - Support count per label
 *
 * Generates domain_label_audit_v1.json for manual review.
 *
 * Usage:
 *   npx tsx audit-domain-label-ontology.mts
 *   npx tsx audit-domain-label-ontology.mts --limit=10000
 */

import { Client } from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

interface LabelAuditEntry {
  label: string;
  count: number;
  lowercase: string;
  suspected_aliases: string[];
  suspected_parent: string | null;
  suspected_children: string[];
  case_variants: string[];
  tier_hint: 'domain_family' | 'domain_class' | 'feature_label' | 'unknown';
}

interface AuditReport {
  total_unique_labels: number;
  total_packets: number;
  timestamp: string;
  labels: LabelAuditEntry[];
  case_mismatch_groups: Array<{ canonical: string; variants: string[] }>;
  potential_hierarchy: Array<{ parent: string; potential_children: string[] }>;
  unresolved: string[];
}

async function auditDomainLabels(limit?: number): Promise<AuditReport> {
  const client = new Client({
    connectionString: 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db',
  });

  await client.connect();

  try {
    // Load all unique domain_class values with counts
    const query = `
      SELECT
        domain_class,
        COUNT(*) as count
      FROM atlas_packets
      WHERE domain_class IS NOT NULL AND domain_class <> ''
      GROUP BY domain_class
      ORDER BY count DESC
      ${limit ? `LIMIT $1` : ''}
    `;

    const result = await client.query(query, limit ? [limit] : []);
    const labels = result.rows;

    // Count total packets
    const totalQuery = 'SELECT COUNT(*) as total FROM atlas_packets WHERE domain_class IS NOT NULL AND domain_class <> \'\'';
    const totalResult = await client.query(totalQuery);
    const totalPackets = parseInt(totalResult.rows[0].total, 10);

    // Build audit entries
    const entries: LabelAuditEntry[] = [];
    const caseGroups = new Map<string, Set<string>>();
    const parentCandidates = new Map<string, Set<string>>();

    for (const row of labels) {
      const label = row.domain_class;
      const lowercase = label.toLowerCase();
      const tierHint = inferTierHint(label);

      // Detect case variants
      if (!caseGroups.has(lowercase)) {
        caseGroups.set(lowercase, new Set());
      }
      caseGroups.get(lowercase)!.add(label);

      // Detect parent/child relationships
      const parts = lowercase.split(/[_\-]/);
      if (parts.length > 1) {
        const potential_parent = parts[0];
        if (!parentCandidates.has(potential_parent)) {
          parentCandidates.set(potential_parent, new Set());
        }
        parentCandidates.get(potential_parent)!.add(label);
      }

      entries.push({
        label,
        count: row.count,
        lowercase,
        suspected_aliases: [],
        suspected_parent: null,
        suspected_children: [],
        case_variants: Array.from(caseGroups.get(lowercase)!),
        tier_hint: tierHint,
      });
    }

    // Populate aliases (case variants)
    for (const entry of entries) {
      entry.case_variants = Array.from(caseGroups.get(entry.lowercase)!).filter(v => v !== entry.label);
      entry.suspected_aliases = entry.case_variants;
    }

    // Populate parent/child hints
    for (const entry of entries) {
      const lowercase = entry.lowercase;
      const parts = lowercase.split(/[_\-]/);

      if (parts.length > 1) {
        const potentialParent = parts[0];
        // Check if parent exists in labels
        if (labels.some(l => l.domain_class.toLowerCase() === potentialParent)) {
          entry.suspected_parent = potentialParent;
        }
      }

      // Find children
      for (const label of labels) {
        const labelLower = label.domain_class.toLowerCase();
        if (labelLower.startsWith(lowercase + '_') || labelLower.startsWith(lowercase + '-')) {
          entry.suspected_children.push(label.domain_class);
        }
      }
    }

    // Build case mismatch groups
    const caseMismatchGroups = Array.from(caseGroups.entries())
      .filter(([_, variants]) => variants.size > 1)
      .map(([canonical, variants]) => ({
        canonical,
        variants: Array.from(variants),
      }));

    // Build potential hierarchy
    const hierarchyMap = new Map<string, string[]>();
    for (const [parent, children] of parentCandidates.entries()) {
      if (children.size > 0) {
        hierarchyMap.set(parent, Array.from(children));
      }
    }
    const potentialHierarchy = Array.from(hierarchyMap.entries()).map(([parent, children]) => ({
      parent,
      potential_children: children,
    }));

    // Identify unresolved (single char, too short, or unclear)
    const unresolved = entries
      .filter(e => e.label.length < 3 || !e.tier_hint || e.tier_hint === 'unknown')
      .map(e => e.label);

    const report: AuditReport = {
      total_unique_labels: labels.length,
      total_packets: totalPackets,
      timestamp: new Date().toISOString(),
      labels: entries.sort((a, b) => b.count - a.count),
      case_mismatch_groups: caseMismatchGroups,
      potential_hierarchy: potentialHierarchy,
      unresolved,
    };

    return report;
  } finally {
    await client.end();
  }
}

function inferTierHint(label: string): 'domain_family' | 'domain_class' | 'feature_label' | 'unknown' {
  const lower = label.toLowerCase();

  // Common domain families
  const families = ['graph', 'retrieval', 'auth', 'evidence', 'database', 'cache', 'vector'];
  if (families.some(f => lower === f)) {
    return 'domain_family';
  }

  // Common domain classes (contains underscore or hyphen)
  if (lower.includes('_') || lower.includes('-')) {
    return 'domain_class';
  }

  // Feature labels (specific, often compound)
  if (lower.length > 15 || lower.includes('packet') || lower.includes('index')) {
    return 'feature_label';
  }

  return 'unknown';
}

async function main() {
  const args = process.argv.slice(2);
  const limitMatch = args.find(a => a.startsWith('--limit='));
  const limit = limitMatch ? parseInt(limitMatch.split('=')[1], 10) : undefined;

  console.log('[+] Auditing domain label ontology...');
  const report = await auditDomainLabels(limit);

  const outputPath = resolve(process.cwd(), 'artifacts', 'domain_label_audit_v1.json');
  writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`[+] Audit complete: ${report.total_unique_labels} unique labels`);
  console.log(`[+] Total packets: ${report.total_packets}`);
  console.log(`[+] Case mismatch groups: ${report.case_mismatch_groups.length}`);
  console.log(`[+] Potential parent-child hierarchies: ${report.potential_hierarchy.length}`);
  console.log(`[+] Unresolved labels: ${report.unresolved.length}`);
  console.log(`[+] Report written to: ${outputPath}`);

  // Print summary
  console.log('\n=== TOP 10 LABELS BY SUPPORT ===');
  for (const entry of report.labels.slice(0, 10)) {
    console.log(`${entry.label.padEnd(30)} | count: ${String(entry.count).padStart(5)} | tier: ${entry.tier_hint}`);
  }

  console.log('\n=== CASE MISMATCH GROUPS ===');
  for (const group of report.case_mismatch_groups) {
    console.log(`${group.canonical} : ${group.variants.join(', ')}`);
  }

  console.log('\n=== POTENTIAL HIERARCHIES (First 5) ===');
  for (const hier of report.potential_hierarchy.slice(0, 5)) {
    console.log(`${hier.parent} -> ${hier.potential_children.join(', ')}`);
  }

  console.log('\n[+] Next steps: Review artifacts/domain_label_audit_v1.json and manually create domain_label_map_v1.json');
}

main().catch(err => {
  console.error('[FAIL]', err);
  process.exit(1);
});
