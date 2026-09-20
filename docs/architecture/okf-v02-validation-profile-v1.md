# OKF v0.2 validation profile

This is a read-only validation profile for the repository's internal OKF
bundle. It does not claim to implement an external Open Knowledge Format
standard and it does not repair or promote `.okf` metadata.

Every bundle document is checked for `provenance`, `trust`, and `lifecycle`.
The audit also compares manifest-declared domain files with the actual
`.okf/domains/` directory. Missing fields and manifest drift are reported as
review findings. A passing profile still remains derived documentation; it
does not create packet, source, ontology, vector, graph, or cache authority.
