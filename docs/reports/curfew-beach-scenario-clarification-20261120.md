# Curfew Beach Scenario Clarification

## Scenario boundary

This is a synthetic curfew-report scenario, not a finding that any attendee committed a crime. The supplied context says curfew begins at 22:00; the ordinance, jurisdiction, date, exceptions, and applicability remain unverified. Witness reports place unidentified people and a bonfire at the beach approximately 23:00–02:00. Separate reports allege possible alcohol use and possible underage attendance. The reports do not establish who drank, anyone's age, or a link to a specific POI.

## Fixture update

- Added two independent `reported-presence` events, one for each witness clock.
- Kept the two bonfire reports and two possible-alcohol-use reports separate.
- Left every report's actor links empty and retained the four generic POI handles as unlinked.
- Clarified that rendered POI proxies are illustrative blockout objects and are not source-identified or source-placed.
- Kept overnight times monotonic past midnight and retained the scenario-only curfew status.

## Verification

- Focused fixture tests: 3 passed.
- `git diff --check`: passed; Git emitted only the existing LF-to-CRLF notice for `tasks.md`.
- Native Svelte check was not rerun in this clarification because the latest attempt exhausted Windows virtual memory before diagnostics. Prior diagnostics and browser smoke remain as recorded in the OpenSpec ledger; this change does not prove browser or persistence behavior.

## Open work

Review controls, source-backed real media, a timeline-visible-state browser assertion, authorized scene save/reopen, and independent persistence readback remain open. The OpenSpec task stays partial.
