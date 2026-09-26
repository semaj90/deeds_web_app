#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, '.tmp', 'atlas-nlp-classification-fastapi-smoke-v1.json');
mkdirSync(path.dirname(reportPath), { recursive: true });

function readTrainingReadiness() {
  const readinessPath = path.join(root, 'docs', 'reports', 'domain-classifier-training-readiness-v1.json');
  try {
    if (existsSync(readinessPath)) return JSON.parse(readFileSync(readinessPath, 'utf8'));
  } catch {
    // Fall through to the bounded bundle read below.
  }
  const bundlePath = path.join(root, 'docs', 'reports', 'domain-classifier-weak-label-bundle-v1.json');
  try {
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
    const rows = Array.isArray(bundle.rows) ? bundle.rows : [];
    const labels = [...new Set(rows.map((row) => row.weakLabel).filter(Boolean))].sort();
    const revisionQualified = rows.filter((row) => typeof row.sourceRevision === 'string' && row.sourceRevision.length > 0).length;
    return {
      status: revisionQualified === rows.length && labels.length >= 2 ? 'REVIEW_REQUIRED_OPERATOR_THRESHOLD' : 'DOMAIN_CLASSIFIER_TRAINING_READY_FALSE',
      bundlePath: path.relative(root, bundlePath).replaceAll('\\', '/'),
      rowCount: rows.length,
      labelCount: labels.length,
      labels,
      revisionQualifiedRows: revisionQualified,
      operatorApprovedMinimumCoverage: false,
      checkpointWriteAuthorized: false,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  } catch (error) {
    return { status: 'TRAINING_BUNDLE_UNAVAILABLE', error: String(error), checkpointWriteAuthorized: false, canonicalAuthority: false, writesPerformed: false };
  }
}

const py = spawnSync('python', ['-c', `
import asyncio
import json
import httpx
from miniforge_nlp_sidecar import app

body = {
  'text': 'Qdrant embedding retrieval uses PostgreSQL evidence and an AST graph relation.',
  'sourceRef': 'fixture/nlp-classification.py',
  'sourceRevision': 'sha256:' + ('1' * 64),
  'workspaceRevision': 'sha256:' + ('2' * 64),
  'sourceNamespace': 'fixture',
  'treeNodeId': 'fixture:node:1',
  'language': 'python',
  'runModelChallenger': True
}

async def main():
  transport = httpx.ASGITransport(app=app)
  async with httpx.AsyncClient(transport=transport, base_url='http://testserver') as client:
    health = await client.get('/health')
    analysis = await client.post('/analyze', json={
      'text': body['text'],
      'source_ref': body['sourceRef'],
      'source_revision': body['sourceRevision'],
      'workspace_revision': body['workspaceRevision'],
      'source_namespace': body['sourceNamespace'],
      'tree_node_id': body['treeNodeId'],
      'source_type': 'codebase',
      'language': body['language'],
      'extraction_mode': 'full',
      'passes': ['structural', 'linguistic', 'sequence', 'classify'],
    })
    result = await client.post('/classify', json=body)
    return health, analysis, result

health, analysis, result = asyncio.run(main())
analysis_payload = analysis.json()
payload = result.json()
print(json.dumps({
  'healthStatus': health.status_code,
  'analysisStatus': analysis.status_code,
  'classifyStatus': result.status_code,
  'analysisCapabilities': analysis_payload.get('capabilities', {}),
  'analysisProposal': analysis_payload.get('classification_proposal'),
  'payload': payload,
  'canonicalAuthority': payload.get('canonicalAuthority'),
  'writesPerformed': payload.get('writesPerformed'),
  'promotionAuthorized': payload.get('hmmWorkflow', {}).get('promotionAuthorized'),
  'proposalChecksum': payload.get('proposalChecksum'),
}, sort_keys=True))
`], { cwd: path.join(root, 'python'), encoding: 'utf8' });

if (py.status !== 0) {
  const report = { schema: 'atlas.nlp-classification-fastapi-smoke.v1', status: 'ENVIRONMENT_UNAVAILABLE', pythonStatus: py.status, stderr: py.stderr, writesPerformed: false, canonicalAuthority: false };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report));
  process.exitCode = 1;
} else {
  const output = JSON.parse(py.stdout.trim());
  const report = {
    schema: 'atlas.nlp-classification-fastapi-smoke.v1',
    status: output.healthStatus === 200 && output.analysisStatus === 200 && output.classifyStatus === 200 && output.analysisProposal?.canonicalAuthority === false && output.analysisProposal?.writesPerformed === false && output.canonicalAuthority === false && output.writesPerformed === false && output.promotionAuthorized === false ? 'NLP_FASTAPI_CLASSIFICATION_PROVEN' : 'NLP_FASTAPI_CLASSIFICATION_REVIEW_REQUIRED',
    healthStatus: output.healthStatus,
    analysisStatus: output.analysisStatus,
    classifyStatus: output.classifyStatus,
    analysisCapabilities: output.analysisCapabilities,
    analysisProposal: output.analysisProposal,
    proposalChecksum: output.proposalChecksum,
    domain: output.payload?.domain ?? null,
    ontologyLabels: output.payload?.ontologyLabels ?? [],
    linkedTupleStatus: output.payload?.linkedTupleProposal?.status ?? null,
    modelChallenger: output.payload?.modelChallenger ?? null,
    trainedClassifier: output.payload?.trainedClassifier ?? null,
    trainingReadiness: readTrainingReadiness(),
    hmmWorkflow: output.payload?.hmmWorkflow ?? null,
    canonicalAuthority: false,
    writesPerformed: false,
    promotionAuthorized: false,
    nextGate: 'GROUNDED_SOURCE_READBACK_AND_TRAINING_ADMISSION',
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, domain: report.domain, reportPath }, null, 2));
  if (report.status !== 'NLP_FASTAPI_CLASSIFICATION_PROVEN') process.exitCode = 1;
}
