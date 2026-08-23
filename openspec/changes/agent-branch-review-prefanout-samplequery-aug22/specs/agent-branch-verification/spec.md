## ADDED Requirements

### Requirement: Claimed test counts from a non-executing agent SHALL be verified against the actual spec file, not trusted at face value
When a session that cannot execute tests reports a test count (e.g. "15/15 focused tests passed"), a session that CAN execute tests SHALL run the real suite and record the actual count, flagging any mismatch rather than silently repeating the unverified claim.

#### Scenario: A claimed test count does not match the spec file's actual test blocks
- **WHEN** a prior agent's transcript claims a specific passing test count for a named spec file
- **THEN** the verifying session counts `it()`/`test()` blocks in the actual file and runs the suite for real, recording both numbers if they differ

### Requirement: Shared-environment tooling failures SHALL be diagnosed before being treated as code bugs
When `npx`/`.bin`-based tool invocation fails in a heavily-shared, concurrently-mutated working environment, the failure SHALL be checked against the possibility of a concurrent process transiently mutating shared state (`node_modules/.bin`, `.svelte-kit`) before assuming a code or configuration defect.

#### Scenario: An empty node_modules/.bin directory is diagnosed as concurrency, not breakage
- **WHEN** `npx vitest` fails to resolve in a shared `node_modules` directory during a session with many concurrent agent processes
- **THEN** the session checks whether `node_modules/.bin` is anomalously sparse (evidence of an in-flight `npm install` elsewhere) before concluding the package installation itself is broken, and works around it via direct entry-point invocation rather than reinstalling
