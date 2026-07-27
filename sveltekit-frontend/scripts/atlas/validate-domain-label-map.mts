#!/usr/bin/env node

/**
 * Validate Domain Label Map
 *
 * Verifies that domain_label_map_v1.json:
 * 1. Is valid JSON with required fields
 * 2. Has no duplicate labels
 * 3. Covers all domain_class and domain_family entries
 * 4. All lifecycle_state values are valid
 * 5. All labels in unclassified_labels exist in audit
 * 6. No coverage gaps (all audit labels mapped)
 *
 * Usage:
 *   npx tsx validate-domain-label-map.mts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

interface ValidationGate {
  name: string;
  passed: boolean;
  details: string;
}

interface DomainLabelMap {
  schema_version: string;
  domain_families: Array<{
    domain_family: string;
    canonical_label: string;
    lifecycle_state: string;
    domain_classes: Array<{
      domain_class: string;
      canonical_label: string;
      lifecycle_state: string;
    }>;
  }>;
  flat_domain_classes: Array<{
    domain_class: string;
    canonical_label: string;
    lifecycle_state: string;
  }>;
  unclassified_labels: Array<{
    original_label: string;
    canonical_label: string;
    lifecycle_state: string;
  }>;
  normalization_rules: {
    lifecycle_states: Record<string, string>;
  };
}

interface AuditReport {
  total_unique_labels: number;
  labels: Array<{
    label: string;
    count: number;
  }>;
}

function validateLabelMap(): ValidationGate[] {
  const gates: ValidationGate[] = [];

  try {
    // Gate 1: Load and parse files
    const mapPath = resolve(process.cwd(), 'sveltekit-frontend', 'artifacts', 'domain_label_map_v1.json');
    const auditPath = resolve(process.cwd(), 'sveltekit-frontend', 'artifacts', 'domain_label_audit_v1.json');

    const mapText = readFileSync(mapPath, 'utf-8');
    const auditText = readFileSync(auditPath, 'utf-8');

    const map = JSON.parse(mapText) as DomainLabelMap;
    const audit = JSON.parse(auditText) as AuditReport;

    gates.push({
      name: 'G1: JSON Parse',
      passed: true,
      details: 'Both map and audit files parse successfully',
    });

    // Gate 2: Schema version match
    gates.push({
      name: 'G2: Schema Version',
      passed: map.schema_version === '1.0.0',
      details: `Map schema_version = ${map.schema_version}`,
    });

    // Gate 3: No duplicate canonical labels
    const allLabels = new Set<string>();
    const duplicates: string[] = [];

    for (const family of map.domain_families) {
      if (allLabels.has(family.canonical_label)) {
        duplicates.push(family.canonical_label);
      }
      allLabels.add(family.canonical_label);

      for (const cls of family.domain_classes) {
        if (allLabels.has(cls.canonical_label)) {
          duplicates.push(cls.canonical_label);
        }
        allLabels.add(cls.canonical_label);
      }
    }

    for (const cls of map.flat_domain_classes) {
      if (allLabels.has(cls.canonical_label)) {
        duplicates.push(cls.canonical_label);
      }
      allLabels.add(cls.canonical_label);
    }

    for (const unc of map.unclassified_labels) {
      if (allLabels.has(unc.canonical_label)) {
        duplicates.push(unc.canonical_label);
      }
      allLabels.add(unc.canonical_label);
    }

    gates.push({
      name: 'G3: No Duplicates',
      passed: duplicates.length === 0,
      details: duplicates.length === 0 ? 'All canonical labels are unique' : `Duplicates: ${duplicates.join(', ')}`,
    });

    // Gate 4: Valid lifecycle states
    const validStates = new Set(Object.keys(map.normalization_rules.lifecycle_states));
    const invalidStates: string[] = [];

    for (const family of map.domain_families) {
      if (!validStates.has(family.lifecycle_state)) {
        invalidStates.push(`${family.domain_family}: ${family.lifecycle_state}`);
      }
      for (const cls of family.domain_classes) {
        if (!validStates.has(cls.lifecycle_state)) {
          invalidStates.push(`${cls.domain_class}: ${cls.lifecycle_state}`);
        }
      }
    }

    for (const cls of map.flat_domain_classes) {
      if (!validStates.has(cls.lifecycle_state)) {
        invalidStates.push(`${cls.domain_class}: ${cls.lifecycle_state}`);
      }
    }

    for (const unc of map.unclassified_labels) {
      if (!validStates.has(unc.lifecycle_state)) {
        invalidStates.push(`${unc.original_label}: ${unc.lifecycle_state}`);
      }
    }

    gates.push({
      name: 'G4: Valid Lifecycle States',
      passed: invalidStates.length === 0,
      details: invalidStates.length === 0 ? 'All lifecycle states are valid' : `Invalid: ${invalidStates.join(', ')}`,
    });

    // Gate 5: Coverage of audit labels
    const mappedLabels = new Set<string>();

    for (const family of map.domain_families) {
      mappedLabels.add(family.canonical_label.toLowerCase());
      for (const cls of family.domain_classes) {
        mappedLabels.add(cls.canonical_label.toLowerCase());
      }
    }

    for (const cls of map.flat_domain_classes) {
      mappedLabels.add(cls.canonical_label.toLowerCase());
    }

    for (const unc of map.unclassified_labels) {
      mappedLabels.add(unc.original_label.toLowerCase());
    }

    const unmapped: string[] = [];
    for (const label of audit.labels) {
      const canonical = label.label.toLowerCase();
      if (!mappedLabels.has(canonical)) {
        unmapped.push(label.label);
      }
    }

    gates.push({
      name: 'G5: Coverage of Audit Labels',
      passed: unmapped.length === 0,
      details: unmapped.length === 0 ? `All ${audit.total_unique_labels} audit labels mapped` : `Unmapped: ${unmapped.join(', ')}`,
    });

    // Gate 6: Unclassified labels exist in audit
    const auditLabelSet = new Set(audit.labels.map(l => l.label.toLowerCase()));
    const missingFromAudit: string[] = [];

    for (const unc of map.unclassified_labels) {
      if (!auditLabelSet.has(unc.original_label.toLowerCase())) {
        missingFromAudit.push(unc.original_label);
      }
    }

    gates.push({
      name: 'G6: Unclassified Labels in Audit',
      passed: missingFromAudit.length === 0,
      details: missingFromAudit.length === 0 ? `All ${map.unclassified_labels.length} unclassified labels found in audit` : `Not in audit: ${missingFromAudit.join(', ')}`,
    });

    // Gate 7: ACTIVE/PROPOSED coverage is reasonable
    const activeCount = map.domain_families.reduce((sum, f) => {
      const familyActive = f.lifecycle_state === 'ACTIVE' ? 1 : 0;
      const childrenActive = f.domain_classes.filter(c => c.lifecycle_state === 'ACTIVE').length;
      return sum + familyActive + childrenActive;
    }, 0);

    const flatActive = map.flat_domain_classes.filter(c => c.lifecycle_state === 'ACTIVE').length;
    const totalActive = activeCount + flatActive;

    gates.push({
      name: 'G7: Active Labels Count',
      passed: totalActive >= 15 && totalActive <= 25,
      details: `${totalActive} active labels (target: 15-25). Good distribution.`,
    });

    // Print results
    const overallPass = gates.every(g => g.passed);

    console.log('\n' + '='.repeat(60));
    console.log('DOMAIN LABEL MAP VALIDATION REPORT');
    console.log('='.repeat(60));

    for (const gate of gates) {
      const status = gate.passed ? '[OK]' : '[FAIL]';
      console.log(`${status} ${gate.name}: ${gate.details}`);
    }

    console.log('\n' + '='.repeat(60));
    if (overallPass) {
      console.log('[OK] All validation gates PASSED');
      console.log(`Map covers ${audit.total_unique_labels} audit labels`);
      console.log(`Active labels: ${totalActive}`);
      console.log(`Unresolved labels: ${map.unclassified_labels.filter(u => u.lifecycle_state === 'UNRESOLVED').length}`);
    } else {
      console.log('[FAIL] One or more gates failed');
    }
    console.log('='.repeat(60));

    return gates;
  } catch (err) {
    console.error('[FAIL]', err);
    process.exit(1);
  }
}

const gates = validateLabelMap();
const allPass = gates.every(g => g.passed);
process.exit(allPass ? 0 : 1);
