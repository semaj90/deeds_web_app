# Latent & SOM Join-Key Coverage Audit

Report generated at: `2026-06-20T00:40:04.874Z`

## Database Stats (`atlas_packets` Table)

| Metric | Count |
| :--- | :--- |
| **Total packets in Postgres** | **17985** |
| Packets with `packet_key` | 17985 |
| Packets with `source_ref` | 17985 |
| Packets with `qdrant_point_id` | 0 |
| Packets with Qdrant ID in `payload` | 77 |
| Packets with Qdrant ID in `metadata` | 0 |
| **Packets with `latent_64` populated** | **3136** |
| **Packets with `som_index` populated** | **4109** |

## Coverage Diagnostics

### Autoencoder Latent Index Coverage

* **Total unique Qdrant entries in Latent Index**: 781
* **Matched against database packets**: 781 (100.00%)
* **Unmatched (skipped)**: 0


### SOM Assignments Coverage

* **Total unique entries in SOM Assignments**: 781
* **Matched against database packets**: 781 (100.00%)
* **Unmatched (skipped)**: 0


### Identity Join Reason Classification


* **Addressable latent vectors**: 781
* **Matched addressable latent vectors**: 781 (100.00%)
* **Reason counts**: `{"matched":781,"qdrant_point_not_found":0,"non_packet_vector":0,"missing_identity_payload":0,"identity_not_in_postgres":0}`



* **Addressable SOM vectors**: 781
* **Matched addressable SOM vectors**: 781 (100.00%)
* **Reason counts**: `{"matched":781,"qdrant_point_not_found":0,"non_packet_vector":0,"missing_identity_payload":0,"identity_not_in_postgres":0}`


---

## Action Plan & Alignment status

* **AE training**: `COMPLETE` — CUDA-trained weights are present.
* **latent_64 generation**: `COMPLETE / WRITEBACK PARTIAL`
* **SOM training**: `IMPLEMENTATION READY / EXISTING ASSIGNMENTS REQUIRE IDENTITY REVIEW`
* **Redis/Valkey latent cache**: `CLOSED`
* **Postgres writeback**: `PARTIAL` — use canonical packet vectors, not all Qdrant surfaces, as the repair denominator.
