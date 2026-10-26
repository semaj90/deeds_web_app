# CouchDB Credential Rotation Runbook

Status: **PREPARED, NOT APPROVED FOR EXECUTION**  
Scope: CouchDB application credential remediation. This document contains no credential values.

## Current evidence

- The shared application configuration owner is `sveltekit-frontend/src/lib/server/config/couchdb-config.ts`; it requires a credential-free URL plus explicit user and password environment variables and builds Basic authorization in memory.
- A tracked-file scan found the exposed credential literal in 38 tracked files and a second fallback candidate in 27 tracked files. The sets may overlap. These are file counts, not a claim that each occurrence is an active runtime consumer. Historical reports, generated indexes, tests, copied build output, and executable files are mixed; classify before editing.
- A read-only authenticated `/_all_dbs` request returned HTTP 200 with nine databases. `phase19_tasks` exists; `wiki_cards` does not. This verifies connectivity only, not every application writer or startup cleanup path.
- No credential was rotated, no Git history was rewritten, and no service was restarted as part of this runbook preparation.

## Preconditions

1. Obtain explicit operator approval naming the CouchDB instance, account, maintenance window, and permitted restart scope. This runbook alone is not authorization.
2. Identify all active readers, writers, containers, scheduled jobs, and developer processes from deployment configuration and runtime registrations. Separate active consumers from historical documents and generated copies; record an owner and restart method for each.
3. Confirm every active consumer uses the shared configuration owner or an explicitly reviewed equivalent. Missing credentials must fail closed. Do not retain embedded URL userinfo or fallback credentials.
4. Establish console-level recovery access independent of the application credential. Verify the operator can restore administrator access without relying on the credential being rotated.
5. Store the replacement secret in the approved secret manager. Do not place it in command arguments, shell history, receipts, screenshots, logs, or this repository.
6. Prepare a sanitized baseline receipt: CouchDB `/_up`, authenticated `/_all_dbs` status and database count, app-level read-only probe, DAG-cache cleanup selection/counts, and health of each active consumer. Never record document bodies or authorization headers.
7. Confirm rollback/recovery ownership and a communications channel before changing the server account.

## Controlled rotation

1. Pause credential-dependent writers and scheduled jobs; leave read-only health monitoring available where possible.
2. Using the approved CouchDB administrative channel, rotate the named account to the secret-manager value. Do not issue or log a request containing the plaintext secret from this repository workflow.
3. Update the authoritative environment/secret-manager entry and deployment configuration, keeping the service URL credential-free. Do not update historical reports or generated artifacts as a substitute for rotating the server credential.
4. Restart only the explicitly approved consumers, one at a time. Verify each is using the shared configuration owner and reports no authentication failure before proceeding.
5. Verify `/_up`, authenticated `/_all_dbs`, an application-owned read-only request, DAG-cache startup cleanup counts, and `/api/health`. Service health, authentication, and cleanup correctness are separate checks.
6. From a protected operator session, verify the prior credential is rejected without printing it or including it in process arguments. If this cannot be tested safely, record it as unverified; do not claim rotation complete.
7. Resume writers and scheduled work only after all required readbacks pass. Preserve sanitized before/after evidence with secret values and document bodies excluded.

## Recovery and rollback

- If the new credential fails before server-side rotation, restore the prior secret-manager reference, restart only affected consumers, and re-run the read-only probes.
- If server-side rotation has completed, do **not** re-enable a credential known to be exposed. Use the verified console recovery path to issue a fresh credential, update the secret manager, and roll forward. Keep affected writers paused until successful authentication is independently verified.
- If any consumer cannot be upgraded, pause that consumer rather than restoring an embedded fallback. Record its owner and failure without copying credentials into logs.
- If DAG-cache cleanup selects unexpected documents, stop cleanup-dependent startup actions, preserve the sanitized selection/count receipt, and use the existing reviewed recovery owner. Do not perform ad hoc bulk deletion or restore from an unverified backup.
- Git-history rewriting is a separate coordinated operation. Rotation does not erase historical copies; do not force-push or rewrite shared history under this runbook.

## Completion evidence

The operator records approval reference, affected consumer list, sanitized before/after health and cleanup results, old-credential rejection result (or explicit unverified status), restart outcomes, recovery test result, and exact configuration revision. Completion requires all active consumers to use the centralized secret source and all required checks to pass. A passing TCP or `/_up` probe alone is insufficient.
