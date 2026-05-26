# Feature Card CouchDB Design

Generated: 2026-05-26T23:19:17.153Z
DB: feature_cards
Design doc: _design/feature_cards
Dry run: no
Changed: no
Upserted: no

## Views
- by_kind
- by_feature_key
- by_term
- by_audit_status

## Warm Checks
- /_design/feature_cards/_view/by_kind?limit=1 (200)
- /_design/feature_cards/_view/by_feature_key?limit=1 (200)
- /_design/feature_cards/_view/by_term?limit=1 (200)
- /_design/feature_cards/_view/by_audit_status?reduce=true&group=true&limit=1 (200)