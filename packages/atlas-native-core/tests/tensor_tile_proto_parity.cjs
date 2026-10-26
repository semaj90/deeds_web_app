const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createRequire } = require('node:module');

const executable = process.argv[2];
if (!executable) throw new Error('NATIVE_SMOKE_EXECUTABLE_REQUIRED');

const workspaceRequire = createRequire(path.join(process.cwd(), 'package.json'));
const protobuf = workspaceRequire('protobufjs');
const schemaPath = path.resolve(__dirname, '../../../proto/active/tensor_tile_v1.proto');
const frozenSchemaSha256 = 'd75610577e636210d9f4ef88634164a88f4535f872080164656bd2351cf58d6f';

async function main() {
  const schemaBytes = require('node:fs').readFileSync(schemaPath);
  assert.equal(createHash('sha256').update(schemaBytes).digest('hex'), frozenSchemaSha256);
  const root = await protobuf.load(schemaPath);
  const messageType = root.lookupType('atlas.tensor.v1.TensorTileV1');
  const encodedHex = execFileSync(executable, ['--emit-tensor-tile-v1-fixture'], { encoding: 'utf8' }).trim();
  assert.match(encodedHex, /^(?:[0-9a-f]{2})+$/);
  const encoded = Buffer.from(encodedHex, 'hex');
  const decoded = messageType.decode(encoded);
  const fixture = messageType.toObject(decoded, { bytes: Buffer });

  assert.equal(fixture.schemaVersion, 'atlas.tensor-tile.v1');
  assert.equal(fixture.workspaceRevision, `sha256:${'1'.repeat(64)}`);
  assert.equal(fixture.sourceSnapshotDigest, `sha256:${'2'.repeat(64)}`);
  assert.equal(fixture.ordinalMapDigest, `sha256:${'3'.repeat(64)}`);
  assert.equal(fixture.representationRevision, 'fixture-repr.v1');
  assert.equal(fixture.logicalDimension, 128);
  assert.equal(fixture.quantization, messageType.Quantization.INT2_AFFINE);
  assert.equal(fixture.layout, messageType.TileLayout.TURBOVEC_INT2_128);
  assert.deepEqual(fixture.payload, Buffer.from(Array.from({ length: 32 }, (_, index) => index)));
  assert.equal(fixture.payloadSha256, `sha256:${createHash('sha256').update(fixture.payload).digest('hex')}`);
  assert.equal(fixture.candidateOrdinal, 7);
  assert.equal(fixture.proposalOnly, true);
  assert.equal(messageType.verify(fixture), null);

  const reencoded = messageType.encode(messageType.create(fixture)).finish();
  assert.deepEqual(Buffer.from(reencoded), encoded);
  process.stdout.write(`C++ -> protobufjs TensorTileV1 parity PASS (${encoded.length} bytes)\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
