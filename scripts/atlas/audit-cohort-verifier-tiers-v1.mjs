#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const OPENSPEC_COHORT_JSONL_REL = '.tmp/atlas/openspec-cohort-6527-current-source-bindings-v1.jsonl';
const NEXTSTEPS_COHORT_JSONL_REL = '.tmp/atlas/next-steps-task-extract-v1/20261108T181650Z/tasks.jsonl';
const BRIDGE_REPORT_REL = '.tmp/atlas/kanban-task-bridge-20261109T002152Z.json';
const OPENSPEC_OUTPUT_JSONL_REL = '.tmp/atlas/cohort-6527-verifier-tiers-v1.jsonl';
const NEXTSTEPS_OUTPUT_JSONL_REL = '.tmp/atlas/nextsteps-3105-verifier-tiers-v1.jsonl';
const OUTPUT_REPORT_REL = 'docs/reports/cohort-verifier-tier-audit-v1.json';

const CHECKBOX_RE = /^\s*[-*]\s*\[([ xX~])\]/;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FILE_PATH_RE =
  /(?:sveltekit-frontend\/)?(?:src|scripts|python|packages)\/[A-Za-z0-9_.\/-]+\.(?:ts|tsx|js|mjs|cjs|py|hpp|cpp|cc|svelte)/g;
const TEST_OR_VERIFIER_PATH_RE =
  /(?:\.(?:spec|test)\.(?:ts|tsx|js|mjs|cjs)$|\/test_[A-Za-z0-9_]+\.py$|^scripts\/(?:atlas\/)?(?:verify|audit|prove|validate)-[A-Za-z0-9_.-]+\.m?js$|^sveltekit-frontend\/scripts\/(?:verify|audit)-[A-Za-z0-9_.-]+\.(?:m?js|ts)$)/i;

const RAW_COMMAND_MENTION_RE =
  /`[^`\r\n]*?(?:\bvitest\b|\bpytest\b|\bctest\b|\bplaywright\b|\bnode\s+--test\b|\bnode\s+scripts\/|\bnpm\s+(?:run|exec)\b|\bcargo\s+test\b|\bgo\s+test\b)[^`\r\n]*`/i;

const MUTATION_OR_UNSAFE_CMD_RE =
  /(?:--apply\b|--write\b|--execute\b|--force\b|--live\b|\bindex-full-repo\b|\bSPEC\b|<[^>]+>|\s-[ec]\s|[|><`]|\n|\r)/i;

const RUNNABLE_SUBCMD_PATTERNS = [
  /^(?:npm\s+exec(?:\s+--)?|npx)\s+vitest\s+run\b/i,
  /^(?:.\\)?node_modules(?:\\|\/)\.bin(?:\\|\/)vitest(?:\.cmd)?\s+run\b/i,
  /^(?:python[3]?\s+-m\s+)?pytest\b/i,
  /^ctest\b/i,
  /^node\s+--test\s+/i,
  /^node\s+scripts\/(?:atlas\/(?:verify|audit|prove)-[A-Za-z0-9_.-]+\.m?js|validate-[A-Za-z0-9_.-]+\.m?js)\b/i,
  /^npm\s+run\s+(?:check|test(?::[A-Za-z0-9_:-]+)*)\b/i,
];

function sha256File(absPath) {
  return `sha256:${createHash('sha256').update(readFileSync(absPath)).digest('hex')}`;
}

function normalizePosix(p) {
  return p.replace(/\\/g, '/');
}

function resolveRepoOrFrontendPath(rawPath) {
  const clean = normalizePosix(rawPath).replace(/^[./]+/, '');
  const candidates = clean.startsWith('sveltekit-frontend/')
    ? [clean]
    : [clean, `sveltekit-frontend/${clean}`];
  for (const rel of candidates) {
    const abs = path.join(REPO_ROOT, rel);
    if (existsSync(abs)) {
      return { exists: true, resolvedRel: rel };
    }
  }
  return { exists: false, resolvedRel: clean };
}

function parseSourceRef(ref) {
  const idx = ref.lastIndexOf('#L');
  if (idx === -1) {
    return { relFile: normalizePosix(ref), lineNumber: null };
  }
  const relFile = normalizePosix(ref.slice(0, idx));
  const lineStr = ref.slice(idx + 2).split('-')[0];
  const lineNumber = Number.parseInt(lineStr, 10);
  return {
    relFile,
    lineNumber: Number.isFinite(lineNumber) && lineNumber > 0 ? lineNumber : null,
  };
}

function createLineCache() {
  const lineCache = new Map();
  const shaCache = new Map();
  return {
    getLines(relFile) {
      if (!lineCache.has(relFile)) {
        const abs = path.join(REPO_ROOT, relFile);
        if (!existsSync(abs)) {
          lineCache.set(relFile, null);
        } else {
          const bytes = readFileSync(abs);
          shaCache.set(relFile, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
          lineCache.set(relFile, bytes.toString('utf8').split(/\r?\n/));
        }
      }
      return lineCache.get(relFile);
    },
    getFileSha256(relFile) {
      this.getLines(relFile);
      return shaCache.get(relFile) ?? null;
    },
  };
}

function extractTaskBlock(lines, zeroBasedIdx, maxContinuation = 4) {
  if (!lines || zeroBasedIdx < 0 || zeroBasedIdx >= lines.length) {
    return [];
  }
  const first = lines[zeroBasedIdx];
  const baseIndent = first.search(/\S|$/);
  const block = [first];
  for (let i = 1; i <= maxContinuation && zeroBasedIdx + i < lines.length; i++) {
    const nxt = lines[zeroBasedIdx + i];
    if (!nxt.trim()) break;
    if (CHECKBOX_RE.test(nxt) && nxt.search(/\S|$/) <= baseIndent) break;
    if (HEADING_RE.test(nxt)) break;
    block.push(nxt);
  }
  return block;
}

function loadDeclaredNpmScripts() {
  const scripts = new Set();
  for (const pkgRel of ['package.json', 'sveltekit-frontend/package.json']) {
    const abs = path.join(REPO_ROOT, pkgRel);
    if (!existsSync(abs)) continue;
    const pkg = JSON.parse(readFileSync(abs, 'utf8'));
    for (const key of Object.keys(pkg.scripts || {})) {
      scripts.add(key);
    }
  }
  return scripts;
}

const DECLARED_NPM_SCRIPTS = loadDeclaredNpmScripts();

function validateCandidateCommandSpan(rawSpan) {
  const trimmed = rawSpan.trim();
  if (!trimmed || MUTATION_OR_UNSAFE_CMD_RE.test(trimmed)) {
    return null;
  }

  const segments = trimmed
    .split(/\s*(?:&&|;)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;

  let workingPrefix = '';
  const runnableParts = [];
  for (const seg of segments) {
    const cdMatch = /^cd\s+([A-Za-z0-9_./-]+)$/i.exec(seg);
    if (cdMatch) {
      workingPrefix = cdMatch[1];
      continue;
    }
    if (!RUNNABLE_SUBCMD_PATTERNS.some((re) => re.test(seg))) {
      return null;
    }
    runnableParts.push(seg);
  }

  if (runnableParts.length === 0) return null;

  const missingTargets = [];
  const verifiedTargets = [];
  for (const part of runnableParts) {
    const npmRunMatch = /^npm\s+run\s+([A-Za-z0-9_:-]+)/i.exec(part);
    if (npmRunMatch) {
      const scriptName = npmRunMatch[1];
      if (!DECLARED_NPM_SCRIPTS.has(scriptName)) {
        missingTargets.push(`npm-script:${scriptName}`);
      } else {
        verifiedTargets.push(`npm-script:${scriptName}`);
      }
    }
    const paths = part.match(FILE_PATH_RE) || [];
    for (const p of paths) {
      const candidatePath =
        workingPrefix && !p.startsWith(`${workingPrefix}/`)
          ? `${workingPrefix}/${p}`
          : p;
      const check = resolveRepoOrFrontendPath(candidatePath);
      if (check.exists) {
        verifiedTargets.push(check.resolvedRel);
      } else {
        missingTargets.push(p);
      }
    }
  }

  return {
    command: trimmed,
    verifiedTargets,
    missingTargets,
    valid: missingTargets.length === 0,
  };
}

function auditCohortEntries(entries, cache, outJsonlRel) {
  const tierCounts = {
    T0_RUNNABLE_VERIFIER: 0,
    T1_SPEC_FILE_ON_DISK: 0,
    T2_DIAGNOSE_ONLY: 0,
    STALE_NON_CHECKBOX_LOCATOR: 0,
  };
  const sourceMatchCounts = {};
  const checkboxStateCounts = {};

  let t2WithDiskSourceTarget = 0;
  let brokenCommandRows = 0;
  let missingPathRefRows = 0;
  let rawCommandMentionRows = 0;
  let sourceDriftRows = 0;

  const samples = {
    T0_RUNNABLE_VERIFIER: [],
    T1_SPEC_FILE_ON_DISK: [],
    STALE_NON_CHECKBOX_LOCATOR: [],
    brokenCommands: [],
  };

  const outJsonlLines = [];

  for (const entry of entries) {
    sourceMatchCounts[entry.sourceMatch] = (sourceMatchCounts[entry.sourceMatch] || 0) + 1;

    const { relFile, lineNumber } = parseSourceRef(entry.sourceRef);
    const lines = cache.getLines(relFile);
    const currentFileSha = cache.getFileSha256(relFile);
    const sourceDrifted =
      Boolean(entry.recordedFileSha256) &&
      currentFileSha !== entry.recordedFileSha256;
    if (sourceDrifted) {
      sourceDriftRows++;
    }

    const idx = lineNumber !== null ? lineNumber - 1 : -1;
    const blockLines = extractTaskBlock(lines, idx, 4);
    const firstLine = blockLines[0] ?? '';
    const cbMatch = CHECKBOX_RE.exec(firstLine);
    const checkboxState = cbMatch ? cbMatch[1].toLowerCase() : null;
    checkboxStateCounts[checkboxState ?? 'NONE'] =
      (checkboxStateCounts[checkboxState ?? 'NONE'] || 0) + 1;

    const joinedBlock = blockLines.join('\n');
    if (RAW_COMMAND_MENTION_RE.test(joinedBlock)) {
      rawCommandMentionRows++;
    }

    const runnableCommands = [];
    const brokenCommands = [];
    const backtickRe = /`([^`\r\n]+)`/g;
    for (const m of joinedBlock.matchAll(backtickRe)) {
      const checked = validateCandidateCommandSpan(m[1]);
      if (!checked) continue;
      if (checked.valid) {
        if (!runnableCommands.includes(checked.command)) {
          runnableCommands.push(checked.command);
        }
      } else {
        brokenCommands.push({
          command: checked.command,
          missingTargets: checked.missingTargets,
        });
      }
    }

    const rawPaths = [...new Set(joinedBlock.match(FILE_PATH_RE) || [])];
    const diskTestTargets = [];
    const diskSourceTargets = [];
    const missingPathRefs = [];
    for (const p of rawPaths) {
      const res = resolveRepoOrFrontendPath(p);
      if (res.exists) {
        if (TEST_OR_VERIFIER_PATH_RE.test(res.resolvedRel) || TEST_OR_VERIFIER_PATH_RE.test(p)) {
          diskTestTargets.push(res.resolvedRel);
        } else {
          diskSourceTargets.push(res.resolvedRel);
        }
      } else {
        missingPathRefs.push(p);
      }
    }

    if (brokenCommands.length > 0) {
      brokenCommandRows++;
      if (samples.brokenCommands.length < 10) {
        samples.brokenCommands.push({
          canonicalTaskKey: entry.taskKey,
          sourceRef: entry.sourceRef,
          brokenCommands,
        });
      }
    }
    if (missingPathRefs.length > 0) {
      missingPathRefRows++;
    }

    let tier;
    if (!cbMatch || !lines || idx < 0 || idx >= lines.length) {
      tier = 'STALE_NON_CHECKBOX_LOCATOR';
    } else if (runnableCommands.length > 0) {
      tier = 'T0_RUNNABLE_VERIFIER';
    } else if (diskTestTargets.length > 0) {
      tier = 'T1_SPEC_FILE_ON_DISK';
    } else {
      tier = 'T2_DIAGNOSE_ONLY';
      if (diskSourceTargets.length > 0) {
        t2WithDiskSourceTarget++;
      }
    }

    tierCounts[tier]++;

    if (tier === 'T0_RUNNABLE_VERIFIER' && samples.T0_RUNNABLE_VERIFIER.length < 15) {
      samples.T0_RUNNABLE_VERIFIER.push({
        canonicalTaskKey: entry.taskKey,
        sourceRef: entry.sourceRef,
        runnableCommands,
      });
    } else if (tier === 'T1_SPEC_FILE_ON_DISK' && samples.T1_SPEC_FILE_ON_DISK.length < 10) {
      samples.T1_SPEC_FILE_ON_DISK.push({
        canonicalTaskKey: entry.taskKey,
        sourceRef: entry.sourceRef,
        diskTestTargets,
      });
    } else if (
      tier === 'STALE_NON_CHECKBOX_LOCATOR' &&
      samples.STALE_NON_CHECKBOX_LOCATOR.length < 10
    ) {
      samples.STALE_NON_CHECKBOX_LOCATOR.push({
        canonicalTaskKey: entry.taskKey,
        sourceRef: entry.sourceRef,
        sourceMatch: entry.sourceMatch,
        linePreview: firstLine.slice(0, 140),
      });
    }

    outJsonlLines.push(
      JSON.stringify({
        taskOrdinal: entry.taskOrdinal,
        canonicalTaskKey: entry.taskKey,
        sourceRef: entry.sourceRef,
        sourceMatch: entry.sourceMatch,
        sourceDrifted,
        checkboxState,
        tier,
        runnableCommands,
        brokenCommands,
        diskTestTargets,
        diskSourceTargets,
        missingPathRefs,
        canonicalAuthority: false,
      })
    );
  }

  const outJsonlAbs = path.join(REPO_ROOT, outJsonlRel);
  mkdirSync(path.dirname(outJsonlAbs), { recursive: true });
  writeFileSync(outJsonlAbs, `${outJsonlLines.join('\n')}\n`, 'utf8');

  return {
    summary: {
      totalRows: entries.length,
      tierCounts,
      tierSharePct: Object.fromEntries(
        Object.entries(tierCounts).map(([k, v]) => [
          k,
          Number(((v / entries.length) * 100).toFixed(3)),
        ])
      ),
      sourceMatchCounts,
      checkboxStateCounts,
      t2WithDiskSourceTarget,
      rawCommandMentionRows,
      brokenCommandRows,
      missingPathRefRows,
      sourceDriftRows,
    },
    samples,
  };
}

function loadOpenSpecEntries() {
  const abs = path.join(REPO_ROOT, OPENSPEC_COHORT_JSONL_REL);
  return readFileSync(abs, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const row = JSON.parse(line);
      return {
        taskOrdinal: row.task_ordinal,
        taskKey: row.canonical_task_key,
        sourceRef: row.source_ref,
        sourceMatch: row.source_match ?? 'EXACT',
        recordedFileSha256: null,
      };
    });
}

function loadNextStepsEntries() {
  const abs = path.join(REPO_ROOT, NEXTSTEPS_COHORT_JSONL_REL);
  return readFileSync(abs, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((line, index) => {
      const row = JSON.parse(line);
      return {
        taskOrdinal: index,
        taskKey: row.taskKey,
        sourceRef: `${normalizePosix(row.docPath)}#L${row.line}`,
        sourceMatch: row.status ?? 'open',
        recordedFileSha256: row.sourceRevision ?? null,
      };
    });
}

function inspectBlockedNextStepsCandidates(cache) {
  const bridgeAbs = path.join(REPO_ROOT, BRIDGE_REPORT_REL);
  const bridge = JSON.parse(readFileSync(bridgeAbs, 'utf8'));
  const results = [];

  for (const cohort of bridge.cohortsEvaluated || []) {
    for (const cand of cohort.claimedCandidates || []) {
      const ref = (cand.sourceRefs && cand.sourceRefs[0]) || '';
      const { relFile, lineNumber } = parseSourceRef(ref);
      const lines = cache.getLines(relFile);
      const idx = lineNumber !== null ? lineNumber - 1 : -1;
      const lineText = lines && idx >= 0 && idx < lines.length ? lines[idx].trim() : '';

      let sectionHeading = null;
      let parentLabel = null;
      if (lines && idx >= 0) {
        const currentIndent = lines[idx].search(/\S|$/);
        for (let i = idx - 1; i >= 0; i--) {
          const prev = lines[i];
          const trimmed = prev.trim();
          if (!trimmed) continue;
          if (
            !parentLabel &&
            !HEADING_RE.test(prev) &&
            (prev.search(/\S|$/) < currentIndent || /^[A-Za-z][A-Za-z0-9 _/-]*:\s*$/.test(trimmed))
          ) {
            parentLabel = trimmed;
          }
          if (HEADING_RE.test(prev)) {
            sectionHeading = trimmed;
            break;
          }
        }
      }

      let disposition = 'NON_ACTIONABLE_DECISION_OR_DEFERRAL_BULLET';
      if (/^-\s*\[[ xX~]\]\s*Record current\b/i.test(lineText)) {
        disposition = 'OPERATOR_CONFIG_RECORD_ONLY';
      }

      results.push({
        taskId: cand.taskId,
        sourceRef: ref,
        bridgeAction: cand.action,
        hasRevisionBoundPrefill: Boolean(cand.hasRevisionBoundPrefill),
        hasRunnableValidation: Boolean(cand.hasRunnableValidation),
        sectionHeading,
        parentLabel,
        lineText,
        verifierTier: 'T2_DIAGNOSE_ONLY',
        verifierCmd: null,
        disposition,
      });
    }
  }

  return results;
}

function main() {
  const cache = createLineCache();
  const openspecAudit = auditCohortEntries(loadOpenSpecEntries(), cache, OPENSPEC_OUTPUT_JSONL_REL);
  const nextstepsAudit = auditCohortEntries(loadNextStepsEntries(), cache, NEXTSTEPS_OUTPUT_JSONL_REL);
  const nextstepsBlockedCandidates = inspectBlockedNextStepsCandidates(cache);

  const report = {
    schema: 'atlas.cohort-verifier-tier-audit.v1',
    generatedAt: new Date().toISOString(),
    writesPerformed: false,
    canonicalAuthority: false,
    promotionEligible: false,
    sources: {
      openspecCohortJsonl: OPENSPEC_COHORT_JSONL_REL,
      openspecCohortSha256: sha256File(path.join(REPO_ROOT, OPENSPEC_COHORT_JSONL_REL)),
      openspecPerRowJsonl: OPENSPEC_OUTPUT_JSONL_REL,
      nextstepsCohortJsonl: NEXTSTEPS_COHORT_JSONL_REL,
      nextstepsCohortSha256: sha256File(path.join(REPO_ROOT, NEXTSTEPS_COHORT_JSONL_REL)),
      nextstepsPerRowJsonl: NEXTSTEPS_OUTPUT_JSONL_REL,
      bridgeReportJson: BRIDGE_REPORT_REL,
      bridgeReportSha256: sha256File(path.join(REPO_ROOT, BRIDGE_REPORT_REL)),
    },
    openspecCohortSummary: openspecAudit.summary,
    openspecSamples: openspecAudit.samples,
    nextstepsCohortSummary: nextstepsAudit.summary,
    nextstepsSamples: nextstepsAudit.samples,
    nextstepsBlockedCandidates,
    verifierGapsIdentified: [
      `OpenSpec 6,527: ${openspecAudit.summary.tierCounts.T2_DIAGNOSE_ONLY} of ${openspecAudit.summary.totalRows} rows are T2_DIAGNOSE_ONLY (${openspecAudit.summary.tierCounts.T0_RUNNABLE_VERIFIER} T0 runnable, ${openspecAudit.summary.tierCounts.T1_SPEC_FILE_ON_DISK} T1 spec-on-disk, ${openspecAudit.summary.tierCounts.STALE_NON_CHECKBOX_LOCATOR} STALE_NON_CHECKBOX_LOCATOR, ${openspecAudit.summary.rawCommandMentionRows} loose command mentions vs ${openspecAudit.summary.brokenCommandRows} broken command row(s)).`,
      `NextSteps 3,105: ${nextstepsAudit.summary.tierCounts.T2_DIAGNOSE_ONLY} of ${nextstepsAudit.summary.totalRows} rows are T2_DIAGNOSE_ONLY (${nextstepsAudit.summary.tierCounts.T0_RUNNABLE_VERIFIER} T0 runnable, ${nextstepsAudit.summary.tierCounts.T1_SPEC_FILE_ON_DISK} T1 spec-on-disk, ${nextstepsAudit.summary.tierCounts.STALE_NON_CHECKBOX_LOCATOR} STALE_NON_CHECKBOX_LOCATOR, ${nextstepsAudit.summary.sourceDriftRows} file-sha drift rows, ${nextstepsAudit.summary.rawCommandMentionRows} loose command mentions, ${nextstepsAudit.summary.brokenCommandRows} broken command row(s)).`,
      `All ${nextstepsBlockedCandidates.length} blocked nextsteps DAG candidates are non-runnable operational config notes, architectural decisions, negative constraints, or Defer bullets without a T0 verifier.`,
    ],
  };

  const reportAbs = path.join(REPO_ROOT, OUTPUT_REPORT_REL);
  mkdirSync(path.dirname(reportAbs), { recursive: true });
  writeFileSync(reportAbs, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        status: 'PASS_VERIFIER_TIER_AUDIT',
        openspecTotalRows: openspecAudit.summary.totalRows,
        openspecTierCounts: openspecAudit.summary.tierCounts,
        nextstepsTotalRows: nextstepsAudit.summary.totalRows,
        nextstepsTierCounts: nextstepsAudit.summary.tierCounts,
        nextstepsSourceDriftRows: nextstepsAudit.summary.sourceDriftRows,
        nextstepsBlockedCount: nextstepsBlockedCandidates.length,
        reportPath: OUTPUT_REPORT_REL,
        writesPerformed: false,
        canonicalAuthority: false,
      },
      null,
      2
    )
  );
}

main();
