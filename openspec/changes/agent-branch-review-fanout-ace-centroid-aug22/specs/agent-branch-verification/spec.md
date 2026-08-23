## ADDED Requirements

### Requirement: Concurrent-agent branch review SHALL verify claims against actual diffs, not operator prose alone
Before recording an operator-reported summary of another agent branch's work as verified, the reviewing session SHALL independently inspect the actual diff/commit content for each claimed defect and fix, and SHALL run any commands the operator describes as safe/read-only in an isolated worktree rather than the shared working directory.

#### Scenario: A claimed syntax defect is checked against the real file content
- **WHEN** an operator reports that a migration file had a specific SQL syntax defect and was fixed
- **THEN** the reviewing session reads the actual pre-fix and post-fix file content via `git show`/`git diff` before recording the claim as confirmed

#### Scenario: A proposed verification command referencing a nonexistent file is caught, not silently accepted
- **WHEN** an operator's proposed next-step command references a specific test file path
- **THEN** the reviewing session confirms the file exists on the target branch before running it, and records a correction if it does not

### Requirement: Real infrastructure actions from a branch review SHALL be deferred pending explicit confirmation
A review pass that verifies a branch's static/unit-testable claims SHALL NOT proceed to real infrastructure actions (Docker container creation, live migration application, production-adjacent runtime replay) without a separate explicit go-ahead, even when the underlying plan describes those actions as low-risk or disposable.

#### Scenario: Disposable database proof is not auto-started
- **WHEN** a branch review confirms a set of static/unit checks pass and the branch's own plan describes a follow-on disposable-database migration proof
- **THEN** that migration proof is recorded as a deferred task, not executed as part of the same review pass
