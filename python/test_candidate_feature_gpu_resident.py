import hashlib
import struct
import unittest

from python.parent_atlas_candidate_feature_gpu_resident import (
    resident_physical_checksums,
    verify_pack_source_checksums,
)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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


if __name__ == '__main__':
    unittest.main()
