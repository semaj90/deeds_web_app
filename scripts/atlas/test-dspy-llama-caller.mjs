import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { buildContextManifestV2 } from '../../sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.js';
import { executeDspyLlamaServerRepair } from '../../sveltekit-frontend/src/lib/server/atlas/evals/dspy-llama-server-caller-v1.js';

const manifest = buildContextManifestV2({
  schema: 'atlas.context-manifest.v1',
  requestId: 'req-dspy-caller-1',
  snapshotId: 'snap-1',
  graphRevision: 'graph-r1',
  query: 'repair failed typecheck in auth module',
  candidateBucket: 32,
  candidateCount: 2,
  tokenBudget: 1024,
  selectedNodeKeys: ['symbol:auth_login', 'file:src/auth.ts'],
  evidenceRefs: ['ev:line42', 'src:auth.ts'],
  producerRevision: 'test-producer-r1',
}, {
  selectedOrdinalSetChecksum: 'ord-checksum-1',
  evidenceRevisions: {
    sourceRevision: 'src-rev-1',
    representationRevision: 'rep-rev-1',
    featureRevision: 'feat-rev-1',
    ontologyRevision: null,
    modelRevision: 'ornith-1.5-9b',
    promptTemplateRevision: 'tmpl-rev-1',
  },
  ordinalMapChecksum: 'map-checksum-1',
  retrievalPolicyRevision: 'policy-rev-1',
  acePlaybookRevision: 'playbook-rev-1',
});

test('executeDspyLlamaServerRepair validates output against ContextManifestV2 allowlist', async () => {
  // Mock llama-server endpoint
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const parsedBody = JSON.parse(body);
      assert.equal(parsedBody.model, 'ornith-1.5-9b');
      const requestEnvelope = parsedBody.messages?.find((message) => message.role === 'user')?.content ?? '';
      assert.match(requestEnvelope, /atlas\.dspy-repair-request\.v1/);
      assert.match(requestEnvelope, new RegExp(`sha256:${manifest.identityChecksum}`));
      assert.match(requestEnvelope, /allowedEvidenceRefs/);
      assert.match(requestEnvelope, /PROPOSAL_ONLY/);

      const responsePayload = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                schema: 'atlas.dspy-repair-output.v1',
                contextManifestChecksum: `sha256:${manifest.identityChecksum}`,
                diagnosis: 'Type mismatch in authentication credential type.',
                targetCandidates: ['symbol:auth_login', 'file:src/auth.ts'],
                patchPlan: 'Narrow user auth token input type to non-null.',
                validationPlan: 'npm run test:run -- src/auth.spec.ts',
                evidenceRefs: ['ev:line42', 'src:auth.ts'],
              }),
            },
          },
        ],
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responsePayload));
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const llamaServerUrl = `http://127.0.0.1:${port}`;

  try {
    const result = await executeDspyLlamaServerRepair({
      manifest,
      diagnosisContext: 'Argument of type string | null is not assignable to string.',
      options: {
        llamaServerUrl,
        model: 'ornith-1.5-9b',
      },
    });

    assert.equal(result.status, 'ADMITTED');
    assert.equal(result.kvCachePersisted, false);
    assert.equal(result.canonicalAuthority, false);
    assert.deepEqual(result.proposal.targetCandidates, ['symbol:auth_login', 'file:src/auth.ts']);
    assert.deepEqual(result.proposal.evidenceRefs, ['ev:line42', 'src:auth.ts']);
  } finally {
    server.close();
  }
});

test('executeDspyLlamaServerRepair rejects proposal with hallucinated target candidates', async () => {
  const server = http.createServer((req, res) => {
    const responsePayload = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              schema: 'atlas.dspy-repair-output.v1',
              contextManifestChecksum: `sha256:${manifest.identityChecksum}`,
              diagnosis: 'Invented target attempt.',
              targetCandidates: ['symbol:auth_login', 'invented:malicious:target'],
              patchPlan: 'Unauthorized patch.',
              validationPlan: 'npm test',
              evidenceRefs: ['src:auth.ts'],
            }),
          },
        },
      ],
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(responsePayload));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const llamaServerUrl = `http://127.0.0.1:${port}`;

  try {
    const result = await executeDspyLlamaServerRepair({
      manifest,
      options: { llamaServerUrl, model: 'ornith-1.5-9b' },
    });

    assert.equal(result.status, 'REJECTED_VALIDATION_FAILED');
    assert.equal(result.proposal, null);
    assert.equal(result.error.includes('UNAUTHORIZED_TARGET_ID'), true);
  } finally {
    server.close();
  }
});

test('executeDspyLlamaServerRepair handles offline llama-server cleanly', async () => {
  const result = await executeDspyLlamaServerRepair({
    manifest,
    options: {
      llamaServerUrl: 'http://127.0.0.1:59999', // Closed port
      timeoutMs: 1000,
    },
  });

  assert.equal(result.status, 'LLAMA_SERVER_UNAVAILABLE');
  assert.equal(result.proposal, null);
  assert.equal(result.kvCachePersisted, false);
});

test('executeDspyLlamaServerRepair dispatches to workerUrl and validates output', async () => {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      assert.equal(req.url, '/v1/repair');
      assert.equal(req.method, 'POST');
      const reqJson = JSON.parse(body);
      assert.equal(reqJson.schema, 'atlas.dspy-repair-request.v1');
      assert.equal(reqJson.contextManifestChecksum, `sha256:${manifest.identityChecksum}`);
      assert.equal(reqJson.authority, 'PROPOSAL_ONLY');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        schema: 'atlas.dspy-repair-output.v1',
        contextManifestChecksum: `sha256:${manifest.identityChecksum}`,
        diagnosis: 'Worker diagnosis of authentication credential type mismatch.',
        targetCandidates: ['symbol:auth_login'],
        patchPlan: 'Worker patch plan.',
        validationPlan: 'npm test',
        evidenceRefs: ['src:auth.ts'],
      }));
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const workerUrl = `http://127.0.0.1:${port}`;

  try {
    const result = await executeDspyLlamaServerRepair({
      manifest,
      options: { workerUrl },
    });

    assert.equal(result.status, 'ADMITTED');
    assert.equal(result.endpoint, workerUrl);
    assert.equal(result.kvCachePersisted, false);
    assert.equal(result.canonicalAuthority, false);
    assert.deepEqual(result.proposal.targetCandidates, ['symbol:auth_login']);
    assert.deepEqual(result.proposal.evidenceRefs, ['src:auth.ts']);
  } finally {
    server.close();
  }
});

test('executeDspyLlamaServerRepair handles worker 422 validation failure', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(422, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'VALIDATION_FAILED',
      detail: 'UNAUTHORIZED_TARGET_ID',
    }));
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const workerUrl = `http://127.0.0.1:${port}`;

  try {
    const result = await executeDspyLlamaServerRepair({
      manifest,
      options: { workerUrl },
    });

    assert.equal(result.status, 'REJECTED_VALIDATION_FAILED');
    assert.equal(result.proposal, null);
    assert.equal(result.endpoint, workerUrl);
  } finally {
    server.close();
  }
});
