# Latent & SOM Join-Key Coverage Audit

Report generated at: `2026-08-25T04:51:28.914Z`

## Database Stats (`atlas_packets` Table)

| Metric | Count |
| :--- | :--- |
| **Total packets in Postgres** | **61660** |
| Packets with `packet_key` | 61660 |
| Packets with `source_ref` | 61660 |
| Packets with `qdrant_point_id` | 6451 |
| Packets with Qdrant ID in `payload` | 61 |
| Packets with Qdrant ID in `metadata` | 0 |
| **Packets with `latent_64` populated** | **7522** |
| **Packets with `som_index` populated** | **61660** |

## Coverage Diagnostics

### Autoencoder Latent Index Coverage

* **Total unique Qdrant entries in Latent Index**: 5000
* **Matched against database packets**: 1636 (32.72%)
* **Unmatched (skipped)**: 3364


### SOM Assignments Coverage

* **Total unique entries in SOM Assignments**: 32310
* **Matched against database packets**: 2665 (8.25%)
* **Unmatched (skipped)**: 29645


### Identity Join Reason Classification


* **Addressable latent vectors**: 5000
* **Matched addressable latent vectors**: 5000 (100.00%)
* **Reason counts**: `{"matched":5000,"qdrant_point_not_found":0,"non_packet_vector":0,"missing_identity_payload":0,"identity_not_in_postgres":0}`



* **Addressable SOM vectors**: 32310
* **Matched addressable SOM vectors**: 2665 (8.25%)
* **Reason counts**: `{"matched":2665,"qdrant_point_not_found":0,"non_packet_vector":0,"missing_identity_payload":0,"identity_not_in_postgres":29645}`


---

## Action Plan & Alignment status

* **AE training**: `COMPLETE` — CUDA-trained weights are present.
* **latent_64 generation**: `COMPLETE / WRITEBACK PARTIAL`
* **SOM training**: `IMPLEMENTATION READY / EXISTING ASSIGNMENTS REQUIRE IDENTITY REVIEW`
* **Redis/Valkey latent cache**: `CLOSED`
* **Postgres writeback**: `PARTIAL` — use canonical packet vectors, not all Qdrant surfaces, as the repair denominator.
