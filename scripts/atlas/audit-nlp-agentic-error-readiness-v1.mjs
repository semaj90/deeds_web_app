#!/usr/bin/env node
/**
 * Read-only bridge from the existing NLP FastAPI sidecar to the governed
 * agentic-error fixing lane.
 *
 * This is an audit/receipt producer, not a second NLP or retrieval owner.
 * It deliberately does not call Ollama chat, write a database/cache/vector
 * store, refresh Graphify, or mutate an OpenSpec ledger.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const reportPath = path.join(root, '.tmp', 'atlas-nlp-agentic-error-readiness-v1.json');
mkdirSync(path.dirname(reportPath), { recursive: true });
const fixture = {
  sourceRef: 'fixture/agentic-error-readiness.ts',
  sourceRevision: `sha256:${'a'.repeat(64)}`,
  workspaceRevision: `sha256:${'b'.repeat(64)}`,
  packetKey: 'fixture:agentic-error-readiness',
  treeNodeId: 'fixture:agentic-error-readiness:1',
};

function readControllerAwareness() {
  const controllerPath = path.join(root, 'docs', 'reports', 'openspec-execution-controller-v1.json');
  if (!existsSync(controllerPath)) {
    return { status: 'CONTROLLER_REPORT_UNAVAILABLE', reportPath: 'docs/reports/openspec-execution-controller-v1.json' };
  }
  try {
    const raw = readFileSync(controllerPath, 'utf8');
    const report = JSON.parse(raw);
    const tasks = Array.isArray(report.allTasks) ? report.allTasks : [];
    const nlpChanges = new Set(['parent-atlas-nlp-sidecar-feature-compiler', 'parent-atlas-workstation-domain-classifier']);
    const ownerTasks = tasks.filter((task) => nlpChanges.has(task.change));
    const envelopes = Array.isArray(report.completionEnvelopes) ? report.completionEnvelopes : [];
    const waitingGate = envelopes.flatMap((envelope) => Array.isArray(envelope.requiredGates) ? envelope.requiredGates : [])
      .find((gate) => gate?.status === 'WAITING_ON_DEPENDENCY' || gate?.status === 'WAITING_ON_AUTHORITY');
    return {
      status: waitingGate ? waitingGate.status : 'READY_OR_REVIEW_REQUIRED',
      checksum: `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`,
      reportPath: path.relative(root, controllerPath).replaceAll('\\', '/'),
      ownerTaskCounts: {
        total: ownerTasks.length,
        actionable: ownerTasks.filter((task) => task?.controller?.state === 'ACTIONABLE').length,
        waiting: ownerTasks.filter((task) => String(task?.controller?.state ?? '').startsWith('WAITING_')).length,
        proven: ownerTasks.filter((task) => ['PROVEN', 'INVARIANT'].includes(task?.controller?.state)).length,
      },
      nextGate: waitingGate ? {
        gateId: waitingGate.gateId ?? null,
        status: waitingGate.status,
        receipt: waitingGate.receipt ?? null,
      } : null,
    };
  } catch (error) {
    return { status: 'CONTROLLER_REPORT_INVALID', reportPath: 'docs/reports/openspec-execution-controller-v1.json', error: String(error) };
  }
}

const python = String.raw`
import asyncio
import json
from httpx import ASGITransport, AsyncClient
from miniforge_nlp_sidecar import app

body = {
  "text": "The retrieval route joins PostgreSQL source revisions to an AST symbol and prepares an ACE context packet.",
  "sourceRef": "fixture/agentic-error-readiness.ts",
  "sourceRevision": "sha256:" + ("a" * 64),
  "workspaceRevision": "sha256:" + ("b" * 64),
  "sourceNamespace": "fixture",
  "treeNodeId": "fixture:agentic-error-readiness:1",
  "packetKey": "fixture:agentic-error-readiness",
  "language": "typescript",
  "runModelChallenger": True,
}

async def main():
  transport = ASGITransport(app=app)
  async with AsyncClient(transport=transport, base_url="http://atlas-nlp-audit") as client:
    health = await client.get("/health")
    capabilities = await client.get("/capabilities")
    analysis = await client.post("/analyze", json={
      "text": body["text"],
      "source_ref": body["sourceRef"],
      "source_revision": body["sourceRevision"],
      "workspace_revision": body["workspaceRevision"],
      "source_namespace": body["sourceNamespace"],
      "tree_node_id": body["treeNodeId"],
      "packet_key": body["packetKey"],
      "source_type": "codebase",
      "language": body["language"],
      "extraction_mode": "full",
      "passes": ["structural", "linguistic", "sequence", "classify"],
      "grounded_extraction_required": False,
    })
    classification = await client.post("/classify", json=body)
    return {
      "health": {"status": health.status_code, "body": health.json()},
      "capabilities": {"status": capabilities.status_code, "body": capabilities.json()},
      "analysis": {"status": analysis.status_code, "body": analysis.json()},
      "classification": {"status": classification.status_code, "body": classification.json()},
    }

print(json.dumps(asyncio.run(main()), sort_keys=True))
`;

const result = spawnSync('python', ['-c', python], {
  cwd: path.join(root, 'python'),
  encoding: 'utf8',
  timeout: 120_000,
  maxBuffer: 16 * 1024 * 1024,
});

const base = {
  schema: 'atlas.nlp-agentic-error-readiness.v1',
  producerRevision: 'atlas-nlp-agentic-error-readiness-v1',
  owner: 'python/miniforge_nlp_sidecar.py',
  canonicalAuthority: false,
  promotionAuthorized: false,
  writesPerformed: false,
  mutationMode: 'READ_ONLY_FIXTURE',
  reportPath: path.relative(root, reportPath).replaceAll('\\', '/'),
};

  if (result.status !== 0) {
  const report = {
    ...base,
    status: 'NLP_AGENTIC_ERROR_READINESS_ENVIRONMENT_UNAVAILABLE',
    error: String(result.stderr || result.error || `python exited ${result.status}`).slice(-4000),
    retrievalNextSteps: [
      'Restore the existing FastAPI sidecar environment and rerun this bounded audit.',
      'Do not promote classifier, ontology, or retrieval output from an unavailable sidecar.',
    ],
    ornithSummarization: { owner: 'llama-server:8090', model: 'Ornith', invoked: false, status: 'NOT_INVOKED' },
    pytorchUnsupervised: { status: 'TODO', authority: 'SHADOW_ONLY', promotionAuthorized: false },
    controllerAwareness: readControllerAwareness(),
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify({ status: report.status, reportPath: base.reportPath }, null, 2));
  process.exitCode = 1;
} else {
  let output;
  try {
    output = JSON.parse(String(result.stdout).trim());
  } catch (error) {
    const report = { ...base, status: 'NLP_AGENTIC_ERROR_READINESS_INVALID_SIDEcar_JSON', error: String(error), writesPerformed: false };
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error(JSON.stringify({ status: report.status, reportPath: base.reportPath }, null, 2));
    process.exitCode = 1;
    output = null;
  }

  if (output) {
    const analysis = output.analysis?.body ?? {};
    const proposal = analysis.classification_proposal ?? {};
    const classification = output.classification?.body ?? {};
    const trained = classification.trainedClassifier ?? {};
    const passResults = Array.isArray(analysis.pass_results) ? analysis.pass_results : [];
    const structuralEvidence = {
      chunks: Array.isArray(analysis.chunks) ? analysis.chunks.length : 0,
      entities: Array.isArray(analysis.entities) ? analysis.entities.length : 0,
      relationships: Array.isArray(analysis.relationships) ? analysis.relationships.length : 0,
      concepts: Array.isArray(analysis.concepts) ? analysis.concepts.length : 0,
      passFamilies: passResults.map((pass) => pass.family ?? pass.pass ?? null).filter(Boolean),
      capabilities: analysis.capabilities ?? {},
    };
    const okf = {
      schema: proposal.okfSchemaRevision ?? 'atlas.okf-v02',
      proposalChecksum: proposal.proposalChecksum ?? null,
      sourceRef: proposal.sourceRef ?? null,
      sourceRevision: proposal.sourceRevision ?? null,
      workspaceRevision: proposal.workspaceRevision ?? null,
      domain: proposal.domain ?? null,
      ontologyLabels: Array.isArray(proposal.ontologyLabels) ? proposal.ontologyLabels : [],
      linkedTupleStatus: proposal.linkedTupleProposal?.status ?? null,
      evidenceRefs: proposal.signal?.evidenceRefs ?? [],
      canonicalAuthority: proposal.canonicalAuthority === true,
      writesPerformed: proposal.writesPerformed === true,
    };
    const safe = output.health?.status === 200
      && output.capabilities?.status === 200
      && output.analysis?.status === 200
      && output.classification?.status === 200
      && okf.sourceRef
      && okf.sourceRevision
      && okf.linkedTupleStatus === 'PROPOSAL_ONLY'
      && okf.canonicalAuthority === false
      && okf.writesPerformed === false
      && classification.hmmWorkflow?.promotionAuthorized === false;
    const report = {
      ...base,
      status: safe ? 'NLP_AGENTIC_ERROR_READINESS_PROVEN_FIXTURE' : 'NLP_AGENTIC_ERROR_READINESS_REVIEW_REQUIRED',
      source: {
        ...fixture,
      },
      controllerAwareness: readControllerAwareness(),
      structuralEvidence,
      classification: {
        domain: proposal.domain ?? null,
        ontologyLabels: proposal.ontologyLabels ?? [],
        mappingRevision: proposal.signal?.mappingRevision ?? null,
        ontologyRevision: proposal.signal?.ontologyRevision ?? null,
        trainedClassifier: trained,
        classifierAuthority: trained.authority ?? 'SHADOW_ONLY',
        promotionAuthorized: classification.hmmWorkflow?.promotionAuthorized ?? false,
      },
      okfClaimProposal: okf,
      linkedOntologyTuples: proposal.linkedTupleProposal ? [proposal.linkedTupleProposal] : [],
      retrievalNextSteps: [
        'Use this proposal only as evidence-qualified input to an approved CompletionEnvelope.',
        'Normalize structural evidence before any CandidateOrdinal or retrieval admission.',
        'Keep source/workspace revision joinback as the upstream authority gate.',
        'Run agentic error fixing through the existing controller and allowlisted smoke profiles.',
        'Do not treat LogisticRegression/Naive Bayes output as canonical classification authority.',
      ],
      agenticErrorFixing: {
        workflow: 'verified-claim -> evidence-packet -> repair-candidate -> allowlisted-smoke -> receipt',
        readiness: safe ? 'READY_FOR_READ_ONLY_FIXTURE_REPLAY' : 'BLOCKED_OR_REVIEW_REQUIRED',
        promotionAuthorized: false,
        writesPerformed: false,
      },
      gan: {
        created: true,
        wired: true,
        proven: safe,
        done: false,
        proofRefs: [
          'scripts/atlas/audit-nlp-agentic-error-readiness-v1.mjs',
          '.tmp/atlas-nlp-agentic-error-readiness-v1.json',
          'python/test_atlas_nlp_classification_helper_v1.py',
        ],
        acceptance: 'REVIEW_REQUIRED_READ_ONLY_FIXTURE',
      },
      ornithSummarization: {
        owner: 'llama-server:8090',
        model: 'Ornith',
        invoked: false,
        status: 'OPTIONAL_DEFERRED',
        note: 'This audit does not call chat or persist generated summaries; use an approved synthesis route later.',
      },
      pytorchUnsupervised: {
        status: 'TODO_PYTORCH_UNSUPERVISED_01',
        authority: 'SHADOW_ONLY',
        promotionAuthorized: false,
        writesPerformed: false,
        nextGate: 'FROZEN_REVISION_QUALIFIED_FEATURE_SNAPSHOT',
      },
    };
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ status: report.status, domain: report.classification.domain, reportPath: base.reportPath }, null, 2));
    if (!safe) process.exitCode = 1;
  }
}
