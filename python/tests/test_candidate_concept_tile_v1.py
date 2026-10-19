import json
import struct
import unittest
from pathlib import Path

from atlas_compute.candidate_concept_tile_v1 import (
    FEATURES,
    PAD_ORDINAL,
    bind_batch_to_sealed_map,
    materialize,
    materialize_batch,
    score_batch_cpu,
    scoring_receipt,
    sealed_ordinal_map_checksum,
    stable_top_k,
    verify_sealed_ordinal_map,
)


def fixture(i):
    return dict(packet_key=f"p{i}", source_revision="sr", workspace_revision="wr",
      graph_revision="gr", representation_revision="rr", domain_taxonomy_revision="dr",
      feature_schema_revision="fr", revision_status="PROVEN",
      exact_match=1., nary_facts=[dict(fact_id="f", checksum="abc", evidence_refs=["e"],
      participant_ids=["p1", "p2"], participant_roles=["subject", "object"], graph_revision="gr")])


def groups_of_four(n):
    """n candidates -> groups of <= 4 rows and aligned ordinals (ordinal i for fixture(i))."""
    rows = [fixture(i) for i in range(n)]
    groups = [rows[k:k + 4] for k in range(0, n, 4)]
    ords = [list(range(k, min(k + 4, n))) for k in range(0, n, 4)]
    return groups, ords


def sealed_map_for(n, snapshot="snapshot"):
    candidates = [dict(candidateOrdinal=i, canonicalId=f"c{i}", packetKey=f"p{i}",
                       sourceRevision="sr", workspaceRevision="wr",
                       candidateSnapshotRevision=snapshot) for i in range(n)]
    ordinal_map = dict(candidateSnapshotRevision=snapshot, workspaceRevision="wr",
                        rowCount=n, candidates=candidates)
    ordinal_map["ordinalMapChecksum"] = sealed_ordinal_map_checksum(ordinal_map)
    return ordinal_map


class ConceptTileTests(unittest.TestCase):
    def test_padding_masks_determinism(self):
        a = materialize([fixture(2), fixture(1)])
        b = materialize([fixture(1), fixture(2)])
        self.assertEqual(a.checksum, b.checksum)
        self.assertEqual(a.valid_rows, (1, 1, 0, 0))
        self.assertEqual(a.missing[2], (1,) * 6)
        self.assertEqual(len(a.values), 4)

    def test_fact_revision_rejects(self):
        a = fixture(1)
        a["nary_facts"][0]["graph_revision"] = "stale"
        with self.assertRaisesRegex(ValueError, "REVISION"):
            materialize([a])

    def test_duplicate_rejects(self):
        with self.assertRaisesRegex(ValueError, "DUPLICATE"):
            materialize([fixture(1), fixture(1)])


class ConceptTileBatchTests(unittest.TestCase):
    def test_layout_padding_and_determinism(self):
        groups, ords = groups_of_four(5)
        a = materialize_batch(groups, ordinals=ords, sealed_ordinal_map=sealed_map_for(5))
        b = materialize_batch(groups, ordinals=ords, sealed_ordinal_map=sealed_map_for(5))
        self.assertEqual(a.checksum, b.checksum)
        self.assertEqual(a.tile_count, 2)
        self.assertEqual(len(a.values), 2 * 24)
        self.assertEqual(len(a.slot_ordinals), 8)
        self.assertEqual(a.batch_size, 5)
        self.assertEqual(sorted(a.candidate_ordinals), [0, 1, 2, 3, 4])
        self.assertEqual(a.slot_ordinals[5:], (PAD_ORDINAL,) * 3)
        self.assertEqual(sum(a.present[24 + 6:]), 0)  # padded rows of tile 1 never present
        c = materialize_batch(groups, ordinals=ords, sealed_ordinal_map=sealed_map_for(5, "other-snapshot"))
        self.assertNotEqual(a.order_digest, c.order_digest)

    def test_each_row_is_a_distinct_candidate_with_its_own_ordinal(self):
        groups, ords = groups_of_four(4)
        a = materialize_batch(groups, ordinals=ords, sealed_ordinal_map=sealed_map_for(4))
        self.assertEqual(a.tile_count, 1)
        self.assertEqual(len(set(a.slot_ordinals)), 4)
        self.assertEqual(len(set(a.slot_packet_keys)), 4)

    def test_batch_rejections(self):
        groups, ords = groups_of_four(3)
        with self.assertRaisesRegex(ValueError, "SIZE"):
            materialize_batch([], ordinals=[], sealed_ordinal_map=sealed_map_for(3))
        with self.assertRaisesRegex(ValueError, "SIZE"):
            materialize_batch(groups, ordinals=ords, sealed_ordinal_map=sealed_map_for(3), max_batch=2)
        with self.assertRaisesRegex(ValueError, "DUPLICATE"):
            materialize_batch([[fixture(0), fixture(1)]], ordinals=[[1, 1]], sealed_ordinal_map=sealed_map_for(2))
        with self.assertRaisesRegex(ValueError, "MISMATCH"):
            materialize_batch([[fixture(0), fixture(1)]], ordinals=[[1]], sealed_ordinal_map=sealed_map_for(2))
        with self.assertRaisesRegex(ValueError, "INVALID"):
            materialize_batch([[fixture(0)]], ordinals=[[-1]], sealed_ordinal_map=sealed_map_for(1))
        with self.assertRaisesRegex(ValueError, "NO_CANDIDATES"):
            materialize_batch([[fixture(0)]], ordinals=[[0]], sealed_ordinal_map={})

    def test_batch_bounds_4095_4096_4097(self):
        for n in (4095, 4096):
            groups, ords = groups_of_four(n)
            r = materialize_batch(groups, ordinals=ords, sealed_ordinal_map=sealed_map_for(n))
            self.assertEqual(r.batch_size, n)
            self.assertEqual(r.tile_count, (n + 3) // 4)
        groups, ords = groups_of_four(4097)
        with self.assertRaisesRegex(ValueError, "SIZE"):
            materialize_batch(groups, ordinals=ords, sealed_ordinal_map=sealed_map_for(4097))

    def test_stable_top_k_ties_padding_and_receipt(self):
        self.assertEqual(stable_top_k([0.5, 0.9, 0.9, 0.1], [7, 4, 3, 1], 3), [2, 1, 0])
        with self.assertRaisesRegex(ValueError, "NONFINITE"):
            stable_top_k([float("nan")], [0], 1)
        groups, ords = groups_of_four(5)
        bt = materialize_batch(groups, ordinals=ords, sealed_ordinal_map=sealed_map_for(5))
        scores = [0.2] * 4 + [0.7]
        rc = scoring_receipt(bt, scores, model_revision="m1", top_k=10)
        self.assertEqual(len(rc["topKOrdinals"]), 5)  # padding never appears
        self.assertNotIn(PAD_ORDINAL, rc["topKOrdinals"])
        self.assertFalse(rc["canonicalAuthority"])
        self.assertFalse(rc["writesPerformed"])
        with self.assertRaisesRegex(ValueError, "MISMATCH"):
            scoring_receipt(bt, [0.1], model_revision="m1", top_k=1)

    def test_batch_derives_revision_and_resolves_rows_from_sealed_map(self):
        sealed_map = sealed_map_for(2)
        groups, ords = groups_of_four(2)
        batch = materialize_batch(groups, ordinals=ords, sealed_ordinal_map=sealed_map)
        self.assertEqual(batch.ordinal_map_revision, sealed_map["ordinalMapChecksum"])
        with self.assertRaises(TypeError):
            materialize_batch(groups, ordinals=ords, ordinal_map_revision=sealed_map["ordinalMapChecksum"])
        with self.assertRaisesRegex(ValueError, "PACKET_KEY_MISMATCH"):
            materialize_batch([[fixture(0)]], ordinals=[[1]], sealed_ordinal_map=sealed_map)


class SealedOrdinalMapTests(unittest.TestCase):
    GOLDEN = Path(__file__).resolve().parents[2] / ".tmp" / "atlas" / "ace-golden-candidate-map-v1.json"

    def _synthetic(self, n=3):
        cands = [dict(candidateOrdinal=i, canonicalId=f"c{i}", packetKey=f"p{i}", sourceRevision="sr",
                      workspaceRevision="w", candidateSnapshotRevision="s", note="é ") for i in range(n)]
        m = dict(candidateSnapshotRevision="s", workspaceRevision="w", rowCount=n, candidates=cands)
        m["ordinalMapChecksum"] = sealed_ordinal_map_checksum(m)
        return m

    def test_real_golden_map_checksum_matches_ts_producer(self):
        if not self.GOLDEN.exists():
            self.skipTest("golden map artifact not present")
        m = json.loads(self.GOLDEN.read_text(encoding="utf-8"))
        self.assertEqual(verify_sealed_ordinal_map(m), m["ordinalMapChecksum"])

    def test_tamper_rejections(self):
        import copy
        m = self._synthetic()
        self.assertEqual(verify_sealed_ordinal_map(m), m["ordinalMapChecksum"])
        a = copy.deepcopy(m)
        a["candidates"][1]["canonicalId"] = "zzz"
        with self.assertRaisesRegex(ValueError, "CHECKSUM_MISMATCH"):
            verify_sealed_ordinal_map(a)
        b = copy.deepcopy(m)
        b["candidates"][0]["candidateOrdinal"] = 5
        with self.assertRaisesRegex(ValueError, "CHECKSUM_MISMATCH|NOT_CONTIGUOUS"):
            verify_sealed_ordinal_map(b)
        with self.assertRaisesRegex(ValueError, "NO_CANDIDATES"):
            verify_sealed_ordinal_map(dict(m, candidates=[]))

    def test_row_count_and_candidate_snapshot_revision_are_checked_independently(self):
        import copy
        m = self._synthetic(3)
        wrong_count = copy.deepcopy(m)
        wrong_count["rowCount"] = 2
        with self.assertRaisesRegex(ValueError, "ROW_COUNT_MISMATCH"):
            verify_sealed_ordinal_map(wrong_count)

        mixed_snapshot = copy.deepcopy(m)
        mixed_snapshot["candidates"][1]["candidateSnapshotRevision"] = "other-snapshot"
        mixed_snapshot["ordinalMapChecksum"] = sealed_ordinal_map_checksum(mixed_snapshot)
        with self.assertRaisesRegex(ValueError, "SNAPSHOT_REVISION_MISMATCH"):
            verify_sealed_ordinal_map(mixed_snapshot)

    def test_bind_batch(self):
        m = self._synthetic(6)
        ck = m["ordinalMapChecksum"]
        ok_groups = [[fixture(2), fixture(0)], [fixture(5)]]
        ok = materialize_batch(ok_groups, ordinals=[[2, 0], [5]], sealed_ordinal_map=m)
        bind_batch_to_sealed_map(ok, m)
        with self.assertRaisesRegex(ValueError, "NOT_IN_SEALED_MAP"):
            materialize_batch([[fixture(0)]], ordinals=[[9]], sealed_ordinal_map=m)
        with self.assertRaisesRegex(ValueError, "PACKET_KEY_MISMATCH"):
            materialize_batch([[fixture(0)]], ordinals=[[1]], sealed_ordinal_map=m)
        other_map = self._synthetic(6)
        other_map["candidateSnapshotRevision"] = "other"
        for candidate in other_map["candidates"]:
            candidate["candidateSnapshotRevision"] = "other"
        other_map["ordinalMapChecksum"] = sealed_ordinal_map_checksum(other_map)
        other = materialize_batch([[fixture(0)]], ordinals=[[0]], sealed_ordinal_map=other_map)
        with self.assertRaisesRegex(ValueError, "CHECKSUM_MISMATCH"):
            bind_batch_to_sealed_map(other, m)


def _f32(v):
    return struct.unpack("f", struct.pack("f", v))[0]


def _feature_value(ordinal, feature_index):
    """Independent re-statement of the TS spec featureValue(): ordinal 5 is made identical to ordinal 2."""
    key = 2 if ordinal == 5 else ordinal
    if (key * 3 + feature_index) % 7 == 0:
        return None
    return ((key * 37 + feature_index * 11) % 101) / 100


class TsAdapterParityTests(unittest.TestCase):
    """The TS adapter (execution/atlas-rank-input-adapter-v1.ts) generates the fixture; Python re-derives it."""
    FIXTURE = Path(__file__).resolve().parent / "fixtures" / "rank_tile_parity_v1.json"

    def test_python_oracle_matches_ts_adapter_fixture(self):
        d = json.loads(self.FIXTURE.read_text(encoding="utf-8"))
        m = d["ordinalMap"]
        # 1. the TS-sealed map checksum is reproduced byte-for-byte by the Python port
        self.assertEqual(verify_sealed_ordinal_map(m), d["ordinalMapChecksum"])

        ordinals = d["candidateOrdinals"]
        canon_idx = d["tileChannelCanonicalIndex"]
        by_ordinal = {c["candidateOrdinal"]: c for c in m["candidates"]}

        def row(ordinal):
            c = by_ordinal[ordinal]
            r = dict(packet_key=c["packetKey"], source_revision=c["sourceRevision"],
                     workspace_revision=c["workspaceRevision"], graph_revision=c["graphRevision"],
                     representation_revision=c["semanticRevision"], domain_taxonomy_revision="taxonomy:tile:v1",
                     feature_schema_revision=d["featureRevision"], revision_status="PROVEN")
            for channel, name in enumerate(FEATURES):  # numeric parity only: Python channel names differ from TS
                r[name] = _feature_value(ordinal, canon_idx[channel])
            return r

        groups = [[row(o) for o in ordinals[k:k + 4]] for k in range(0, len(ordinals), 4)]
        gords = [ordinals[k:k + 4] for k in range(0, len(ordinals), 4)]
        batch = materialize_batch(groups, ordinals=gords, sealed_ordinal_map=m)
        bind_batch_to_sealed_map(batch, m)

        # 2. tile shape + valid-row mask agree
        self.assertEqual(batch.tile_count, d["tileCount"])
        slot_valid = [0 if o == PAD_ORDINAL else 1 for o in batch.slot_ordinals]
        self.assertEqual(slot_valid, d["validRows"])

        # 3. every candidate's six values/presence equal the TS tile (compared by ordinal; Python orders a tile by identity)
        position = {o: i for i, o in enumerate(ordinals)}
        for slot, ordinal in enumerate(batch.slot_ordinals):
            if ordinal == PAD_ORDINAL:
                continue
            i = position[ordinal]
            base_ts = (i // 4) * 24 + (i % 4) * 6
            for c in range(6):
                self.assertEqual(batch.present[slot * 6 + c], d["tilePresent"][base_ts + c])
                self.assertEqual(_f32(batch.values[slot * 6 + c]), d["tileFeatures"][base_ts + c])

        # 4. scores and stable Top-K agree with the TS path that ran the features/ GEMM
        scores = score_batch_cpu(batch, d["headWeightsByChannel"], d["headBias"])
        by_score = dict(zip(batch.candidate_ordinals, scores))
        for i, ordinal in enumerate(ordinals):
            self.assertAlmostEqual(by_score[ordinal], d["scores"][i], places=6)
        order = stable_top_k(scores, batch.candidate_ordinals, d["topK"])
        self.assertEqual([batch.candidate_ordinals[j] for j in order], d["topKOrdinals"])


if __name__ == "__main__":
    unittest.main()
