## Memory/agent reconciliation design — 2026-09-05

Record attention KV, recurrent/SSM execution state, and server-managed prompt reuse
as distinct mechanisms. This tranche does not serialize any of them into Atlas stores.
PrefixIdentityV1 is a descriptor of eligible exact inputs, not a copy of hidden state.
Hash canonical structured revision fields and exact rendered prefix bytes; use observed
server telemetry to measure reuse. An eligible prefix may still miss due to eviction.
Application response-cache identity is owned by ace-bitfrost-cache-correctness.
