import hashlib
import json
import struct
import unittest

from python.parent_atlas_candidate_feature_gpu_resident import (
    GpuResidentLeaseError,
    load_candidate_feature_pack_cpu,
    resident_physical_checksums,
    verify_pack_source_checksums,
)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def cpu_pack_fixture():
    values = [0.5, 0.0, 1.0, 0.25, 0.0, 0.0, 0.0, 0.0]
    presence = [1, 0, 1, 1, 0, 0, 0, 0]
    valid = [1, 1, 0, 0]
    lane = [3, 7, 0, 0]
    degraded = [0, 1, 0, 0]
    pack = {
        'schema': 'atlas.candidate-feature-gpu-pack.v2',
        'candidateSnapshotRevision': 'candidate-snapshot:test:v1',
        'ordinalMapChecksum': '1' * 64,
        'featureSnapshotChecksum': '2' * 64,
        'workspaceRevision': 'workspace:test:v1',
        'featureRevision': 'feature:test:v1',
        'sourceRevisions': ['source:a:v1', 'source:b:v1'],
        'columnarChecksum': '3' * 64,
        'candidateOrdinalsChecksum': '4' * 64,
        'rowIdentityChecksum': '5' * 64,
        'logicalRows': 2,
        'physicalRows': 4,
        'paddingRows': 2,
        'rowAlignment': 4,
        'featureCount': 2,
        'featureNames': ['semanticRelevance', 'lexicalRelevance'],
        'featureValues': values,
        'featurePresence': presence,
        'validMask': valid,
        'laneMaskU16': lane,
        'degradedIdentity': degraded,
        'byteOrder': 'little-endian',
        'featureDtype': 'float32',
        'presenceDtype': 'uint8',
        'validMaskDtype': 'uint8',
        'laneMaskSourceDtype': 'uint16',
        'paddingPolicy': 'ZERO_INVALID_MASKED_V1',
        'logicalOrdinalEqualsPhysicalRowForValidPrefix': True,
        'paddedRowsCarryIdentity': False,
        'gpuResident': False,
        'identityAuthority': False,
        'canonicalOwnerChanged': False,
        'producerRevision': 'producer:test:v1',
    }
    pack.update({
        'featureValuesChecksum': sha(b''.join(struct.pack('<f', value) for value in values)),
        'featurePresenceChecksum': sha(bytes(presence)),
        'validMaskChecksum': sha(bytes(valid)),
        'laneMaskChecksum': sha(b''.join(struct.pack('<H', value) for value in lane)),
        'degradedIdentityChecksum': sha(bytes(degraded)),
    })
    pack['gpuPackChecksum'] = sha(json.dumps({
        'candidateSnapshotRevision': pack['candidateSnapshotRevision'],
        'ordinalMapChecksum': pack['ordinalMapChecksum'],
        'featureSnapshotChecksum': pack['featureSnapshotChecksum'],
        'columnarChecksum': pack['columnarChecksum'],
        'candidateOrdinalsChecksum': pack['candidateOrdinalsChecksum'],
        'rowIdentityChecksum': pack['rowIdentityChecksum'],
        'logicalRows': pack['logicalRows'],
        'physicalRows': pack['physicalRows'],
        'rowAlignment': pack['rowAlignment'],
        'featureNames': pack['featureNames'],
        'sourceRevisions': pack['sourceRevisions'],
        'featureValuesChecksum': pack['featureValuesChecksum'],
        'featurePresenceChecksum': pack['featurePresenceChecksum'],
        'validMaskChecksum': pack['validMaskChecksum'],
        'laneMaskChecksum': pack['laneMaskChecksum'],
        'degradedIdentityChecksum': pack['degradedIdentityChecksum'],
        'paddingPolicy': pack['paddingPolicy'],
    }, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    binding = {field: pack[field] for field in (
        'candidateSnapshotRevision', 'ordinalMapChecksum', 'featureSnapshotChecksum',
        'workspaceRevision', 'featureRevision', 'columnarChecksum', 'logicalRows',
        'candidateOrdinalsChecksum', 'rowIdentityChecksum', 'featureCount', 'featureNames', 'sourceRevisions',
    )}
    return pack, binding


class CandidateFeatureGpuResidentChecksumTest(unittest.TestCase):
    def test_source_and_resident_lane_checksums_are_distinct_when_staged_as_i32(self):
        values = [0.5, 1.0, 0.0, 0.0]
        presence = [1, 1, 0, 0]
        valid = [1, 1, 0, 0]
        lane = [3, 7, 0, 0]
        degraded = [0, 1, 0, 0]
        f32 = b''.join(struct.pack('<f', value) for value in values)
        u16 = b''.join(struct.pack('<H', value) for value in lane)
        pack = {
            'featureValues': values,
            'featurePresence': presence,
            'validMask': valid,
            'laneMaskU16': lane,
            'degradedIdentity': degraded,
            'featureValuesChecksum': sha(f32),
            'featurePresenceChecksum': sha(bytes(presence)),
            'validMaskChecksum': sha(bytes(valid)),
            'laneMaskChecksum': sha(u16),
            'degradedIdentityChecksum': sha(bytes(degraded)),
        }
        verify_pack_source_checksums(pack)
        resident = resident_physical_checksums(pack)
        expected_i32 = sha(b''.join(struct.pack('<i', value) for value in lane))
        self.assertEqual(resident['LANE_MASK_U16'], expected_i32)
        self.assertNotEqual(resident['LANE_MASK_U16'], pack['laneMaskChecksum'])
        self.assertEqual(resident['FEATURE_VALUES'], pack['featureValuesChecksum'])

    def test_cpu_loader_checks_binding_and_returns_exact_cpu_tensors(self):
        pack, binding = cpu_pack_fixture()
        tensors = load_candidate_feature_pack_cpu(pack, binding)
        self.assertEqual(tensors['featureValues'].device.type, 'cpu')
        self.assertEqual(tuple(tensors['featureValues'].shape), (4, 2))
        self.assertEqual(tensors['featureValues'].tolist(), [[0.5, 0.0], [1.0, 0.25], [0.0, 0.0], [0.0, 0.0]])
        self.assertEqual(tensors['featurePresence'].tolist(), [[1, 0], [1, 1], [0, 0], [0, 0]])
        self.assertEqual(tensors['validMask'].tolist(), [1, 1, 0, 0])

    def test_cpu_loader_rejects_unexpected_ordinal_map_before_tensor_creation(self):
        pack, binding = cpu_pack_fixture()
        binding['ordinalMapChecksum'] = 'f' * 64
        with self.assertRaisesRegex(GpuResidentLeaseError, 'BINDING_ORDINALMAPCHECKSUM_MISMATCH'):
            load_candidate_feature_pack_cpu(pack, binding)

    def test_cpu_loader_rejects_candidate_identity_and_ordinal_checksums_before_tensor_creation(self):
        for field, error in (
            ('rowIdentityChecksum', 'BINDING_ROWIDENTITYCHECKSUM_MISMATCH'),
            ('candidateOrdinalsChecksum', 'BINDING_CANDIDATEORDINALSCHECKSUM_MISMATCH'),
        ):
            pack, binding = cpu_pack_fixture()
            binding[field] = 'f' * 64
            with self.subTest(field=field), self.assertRaisesRegex(GpuResidentLeaseError, error):
                load_candidate_feature_pack_cpu(pack, binding)

    def test_cpu_loader_rejects_tampered_metadata_and_payload(self):
        pack, binding = cpu_pack_fixture()
        pack['featureRevision'] = 'feature:stale:v0'
        with self.assertRaisesRegex(GpuResidentLeaseError, 'BINDING_FEATUREREVISION_MISMATCH'):
            load_candidate_feature_pack_cpu(pack, binding)

        pack, binding = cpu_pack_fixture()
        pack['featureValues'][0] = 0.75
        with self.assertRaisesRegex(GpuResidentLeaseError, 'FEATUREVALUESCHECKSUM_MISMATCH'):
            load_candidate_feature_pack_cpu(pack, binding)

    def test_cpu_loader_rejects_wrong_endianness_and_padding(self):
        pack, binding = cpu_pack_fixture()
        pack['byteOrder'] = 'big-endian'
        with self.assertRaisesRegex(GpuResidentLeaseError, 'FEATURE_REPRESENTATION_INVALID'):
            load_candidate_feature_pack_cpu(pack, binding)

        pack, binding = cpu_pack_fixture()
        pack['validMask'][2] = 1
        with self.assertRaisesRegex(GpuResidentLeaseError, 'VALID_MASK_NOT_PREFIX'):
            load_candidate_feature_pack_cpu(pack, binding)


if __name__ == '__main__':
    unittest.main()
