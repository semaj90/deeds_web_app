## Candidate requirements (not admitted)

### Requirement: v2 SHALL preserve all v1 domain bytes and NES display colors
The versioned `atlas.nes-domain-palette.v2` candidate extends ten v1 domains with
`compiler=0x0B`, `devops=0x0C`, `error-handling=0x0D` and `test=0x0E`.
The new proposed display colors are respectively 0x17, 0x28, 0x26 and 0x2B.
`0x00` remains exclusively UNRESOLVED; `general=0x0A` is never a fallback
for unknown ontology groups. The v1 palette and all stored v1 rows remain unchanged.

### Requirement: ontology-to-NES crosswalk SHALL be derived, not authoritative
All 17 source ontology group IDs SHALL map to a 14-domain presentation/analysis
candidate crosswalk; four child groups inherit their parent. Approved rollups
are `api→network`, `frontend→ui`, `gpu→ml`, `machine-learning→ml`.
Retain the original group ID alongside the palette domain: `gpu→ml` is lossy.
No classification is a gold label until a real reviewer accepts it.
The generated `.okf` ontology snapshot is not the palette owner and SHALL NOT
be changed by this migration.

### Requirement: persistence SHALL be version-qualified and reversible
Rows SHALL be INSERTED under `lut_revision=atlas.nes-lut.v2-candidate` into the
existing `atlas_nes_lut_v1` table, which is a non-canonical, multiversion LUT.
No v1 UPDATE, DELETE or overwrite; no ontology writes. Scratch rehearsal requires
PostgreSQL 18+, a loopback *_scratch DB, explicit operator opt-in and independent
post-ROLLBACK verification. Scratch COMMIT additionally requires separate opt-in
and exact independent readback. Production deployment requires a later reviewed
migration, workspace authorization and compatibility verification.
