import { describe, expect, it } from 'vitest';
import {
  buildAtlasSkillAdmissionReceipt,
  hashSkillSourceTree,
  sha256Bytes,
  skillAdmissionStillValid,
} from './atlas-skill-admission.js';

const permissions = {
  networkAccess: 'HOST_BRIDGE_ONLY' as const,
  filesystemAccess: 'NONE' as const,
  subprocessExecution: false,
  nativeExtensionAccess: false,
  environmentSecretsAccess: false,
  requiredGpuLibraries: [],
  approvedExternalServices: [],
};

function admittedFixture() {
  const skillMd = '# semantic-search\n';
  const pyproject = '[project]\nname="parent-atlas-skill-semantic-search"\n';
  const sourceFiles = [{ path: 'src/semantic_search/__init__.py', content: 'async def run(): pass\n' }];
  return {
    skillMd,
    pyproject,
    sourceFiles,
    receipt: buildAtlasSkillAdmissionReceipt({
      skillName: 'semantic-search',
      importName: 'semantic_search',
      packageRevision: '0.1.0',
      skillMdSha256: sha256Bytes(skillMd),
      pyprojectSha256: sha256Bytes(pyproject),
      sourceTreeSha256: hashSkillSourceTree(sourceFiles),
      dependencyLockSha256: null,
      declaredHostRequests: ['RETRIEVE'],
      permissions,
      lintPassed: true,
      metadataPassed: true,
      importPassed: true,
      fixturePassed: true,
      dependenciesResolved: true,
      instructionReviewPassed: true,
      approvedByHostPolicy: true,
      producerRevision: 'test',
    }),
  };
}

describe('Atlas skill admission', () => {
  it('admits only when every mandatory gate is true', () => {
    const fixture = admittedFixture();
    expect(fixture.receipt.admitted).toBe(true);
  });

  it('keeps an unreviewed skill unadmitted even when it imports', () => {
    const skillMd = '# unsafe\n';
    const pyproject = '[project]\nname="x"\n';
    const sourceFiles = [{ path: 'src/x/__init__.py', content: 'def run(): return 1\n' }];
    const receipt = buildAtlasSkillAdmissionReceipt({
      skillName: 'unsafe-skill',
      importName: 'unsafe_skill',
      packageRevision: '0.1.0',
      skillMdSha256: sha256Bytes(skillMd),
      pyprojectSha256: sha256Bytes(pyproject),
      sourceTreeSha256: hashSkillSourceTree(sourceFiles),
      dependencyLockSha256: null,
      declaredHostRequests: ['RETRIEVE'],
      permissions,
      lintPassed: true,
      metadataPassed: true,
      importPassed: true,
      fixturePassed: true,
      dependenciesResolved: true,
      instructionReviewPassed: false,
      approvedByHostPolicy: true,
      producerRevision: 'test',
    });
    expect(receipt.admitted).toBe(false);
  });

  it('revokes admission when SKILL.md, pyproject, source tree, or lock changes', () => {
    const fixture = admittedFixture();
    expect(skillAdmissionStillValid({
      receipt: fixture.receipt,
      skillMd: fixture.skillMd,
      pyproject: fixture.pyproject,
      sourceFiles: fixture.sourceFiles,
    })).toBe(true);

    expect(skillAdmissionStillValid({
      receipt: fixture.receipt,
      skillMd: `${fixture.skillMd}\nchanged`,
      pyproject: fixture.pyproject,
      sourceFiles: fixture.sourceFiles,
    })).toBe(false);

    expect(skillAdmissionStillValid({
      receipt: fixture.receipt,
      skillMd: fixture.skillMd,
      pyproject: fixture.pyproject,
      sourceFiles: [{ path: 'src/semantic_search/__init__.py', content: 'async def run(): return 2\n' }],
    })).toBe(false);
  });

  it('hashes source trees independently of input enumeration order', () => {
    const a = [
      { path: 'src/x/b.py', content: 'b' },
      { path: 'src/x/a.py', content: 'a' },
    ];
    const b = [...a].reverse();
    expect(hashSkillSourceTree(a)).toBe(hashSkillSourceTree(b));
  });

  it('rejects duplicate and parent-traversal source paths', () => {
    expect(() => hashSkillSourceTree([
      { path: 'src/x/a.py', content: 'a' },
      { path: 'src/x/a.py', content: 'b' },
    ])).toThrow(/duplicate skill source path/);
    expect(() => hashSkillSourceTree([{ path: '../escape.py', content: 'x' }])).toThrow(/invalid skill source path/);
  });

  it('requires explicit external-service allowlisting for external network access', () => {
    expect(() => buildAtlasSkillAdmissionReceipt({
      skillName: 'external-skill',
      importName: 'external_skill',
      packageRevision: '0.1.0',
      skillMdSha256: 'a'.repeat(64),
      pyprojectSha256: 'b'.repeat(64),
      sourceTreeSha256: 'c'.repeat(64),
      dependencyLockSha256: null,
      declaredHostRequests: ['RETRIEVE'],
      permissions: {
        ...permissions,
        networkAccess: 'APPROVED_EXTERNAL',
        approvedExternalServices: [],
      },
      lintPassed: true,
      metadataPassed: true,
      importPassed: true,
      fixturePassed: true,
      dependenciesResolved: true,
      instructionReviewPassed: true,
      approvedByHostPolicy: true,
      producerRevision: 'test',
    })).toThrow(/requires at least one approved external service/);
  });
});
