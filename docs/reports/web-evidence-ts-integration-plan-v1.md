# Web Evidence TypeScript Integration Plan V1

Status: IMPLEMENTATION_IN_PROGRESS

Target: route existing TypeScript LDR acquisition through the proven 8095 `/evidence/web` endpoint without changing evidence authority.

Planned changes:
- classify `/evidence/web` as an explicit sidecar web-extraction route in `langextract-client.ts`;
- add a bounded `crawlViaEvidenceSidecar()` adapter in `web-crawl.ts`;
- preserve URL validation before any network call;
- require sidecar responses to remain non-authoritative and read-only;
- preserve `/extract/web` and native HTTP extraction as fallbacks;
- leave indexing, exact promotion, CandidateOrdinal, and mutation authorization unchanged.
