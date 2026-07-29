# Domain Classification v1

Canonical source:
- `sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts`

Rules:
- Domain classification is multi-label.
- Primary domain is optional when confidence is weak.
- Learned labels must not overwrite authoritative syntax facts.

Outputs:
- `primary_domain`
- `secondary_domains`
- `labels`
- `confidence`
- `evidence`
