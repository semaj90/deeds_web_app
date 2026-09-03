import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checksumDomainClassificationSignalV1, domainClassificationSignalV1Schema } from './domain-classification-signal-v1.js';

const fixturePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../docs/reports/fixtures/domain-classification-admission-v1.json');

describe('DomainClassificationSignalV1 cross-language fixture', () => {
  it('parses the shared fixture and reproduces its checksum', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { signal: unknown; signalChecksum: string };
    const signal = domainClassificationSignalV1Schema.parse(fixture.signal);
    expect(checksumDomainClassificationSignalV1(signal)).toBe(fixture.signalChecksum);
  });

  it('rejects a signal without revision or evidence identity', () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { signal: Record<string, unknown> };
    expect(() => domainClassificationSignalV1Schema.parse({ ...fixture.signal, ontology_revision: undefined })).toThrow();
    expect(() => domainClassificationSignalV1Schema.parse({ ...fixture.signal, evidence_refs: [] })).toThrow();
  });
});
