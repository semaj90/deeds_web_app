# Clariti / Salesforce Master Fee Sync

Internal admin route: `/admin/fee-sync`

## V1 scope

- Admin-only SvelteKit page.
- Upload official Master Fee Schedule PDF.
- Native `pdfjs-dist` text extraction first; Granite-Docling fallback when configured.
- Read active `MUSW__Master_Fee_List__c` records from Salesforce using server-side OAuth.
- Match PDF Fee No. to `SSF_Code__c`.
- Block duplicate Salesforce/PDF identities.
- Automatically propose **flat-fee** changes only.
- Formula and tier fees remain review-only until deterministic parsers are implemented.
- Create a SHA-256 approval manifest.
- DEV deployment is guarded by an explicit server feature flag.
- Re-query `LastModifiedDate` before write to detect source drift.
- Read back updated records and verify actual values.

## Salesforce authentication

Create a dedicated Salesforce External Client App and integration user/permission set. Keep secrets server-side.

Required environment variables:

```env
SALESFORCE_LOGIN_URL=https://your-domain.my.salesforce.com
SALESFORCE_CLIENT_ID=...
SALESFORCE_CLIENT_SECRET=...
SALESFORCE_API_VERSION=v67.0

# Analysis/read-only is the default.
FEE_SYNC_SALESFORCE_WRITE_ENABLED=false
FEE_SYNC_PDF_MAX_PAGES=80
```

Do not enable writes until the Salesforce object/field permissions, external/canonical keys, DEV sandbox, approval control, and rollback procedure are verified.

## Safety model

1. PDF/AI extraction can propose data.
2. Deterministic matching decides whether a record is uniquely addressable.
3. Only `CHANGED_FLAT` rows can be approved in V1.
4. Approval creates a hash-bound manifest.
5. Deploy rejects non-DEV manifests.
6. Deploy rejects changed `LastModifiedDate` values (`SOURCE_DRIFT`).
7. The Salesforce adapter rejects all writes unless `FEE_SYNC_SALESFORCE_WRITE_ENABLED=true`.
8. After PATCH, the service queries Salesforce again and verifies each expected value.

## Next implementation lanes

- Specialized Master Fee Schedule table extractor with page/section evidence.
- Deterministic multiplier-formula tokenizer/AST and literal mutation invariants.
- Tier/Tier Item Salesforce query adapter and name-first PDF section matcher.
- Persist immutable manifests and before/after snapshots to approved storage.
- Environment promotion DEV -> QA -> UAT -> PROD using the same logical manifest and environment-specific record resolution.
- Review workbook export.
