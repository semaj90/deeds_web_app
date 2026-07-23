# Atlas Contracts

`@deeds/atlas-contracts` owns portable ESM contracts and pure helpers shared by
operational scripts and application packages. It must not own database clients,
service adapters, background workers, or executable migrations.

Current exports:

- `@deeds/atlas-contracts/packet-identity`
- `@deeds/atlas-contracts/packet-registry`

The rerank TypeScript interfaces remain application-source contracts until this
package receives a dedicated TypeScript declaration/build step. They are not
advertised as Node runtime exports.

The full ownership map is in `docs/architecture/PARENT_ATLAS_PACKAGE_BOUNDARIES.md`.
