"""GPU-MINI-FABRIC-01 proving ground.

A small, synthetic, frozen-fixture GPU test laboratory that exercises exact
vs approximate retrieval, ACE-BitFrost residency simulation, and radix
grouping/LOD promotion without touching canonical production data.

Naming note (2026-09-01): NVIDIA's cuVS HNSW build API also uses the acronym
"ACE" (Augmented Core Extraction) -- unrelated to this repo's Atlas context/
residency system. Contracts here use `AtlasAceResidency*` names, never a bare
`Ace*`, to keep the two unambiguous. See root CLAUDE.md's "ACE naming
collision" note.

See openspec/changes/parent-atlas-gpu-mini-fabric-01/ for the phased design.
"""
