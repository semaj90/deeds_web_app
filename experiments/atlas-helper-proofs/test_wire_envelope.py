import unittest
from wire_envelope import encode, decode, HEADER, MAX_PAYLOAD

class EnvelopeTests(unittest.TestCase):
    def test_roundtrip(self):
        for body in (b'', b'123', bytes(range(256))):
            self.assertEqual(decode(encode(body)), body)
    def test_modified_payload(self):
        wire = bytearray(encode(b'ab'))
        wire[-1] ^= 1
        with self.assertRaisesRegex(ValueError, 'CHECKSUM_MISMATCH'):
            decode(bytes(wire))
    def test_truncated(self):
        with self.assertRaisesRegex(ValueError, 'TRUNCATED_HEADER'):
            decode(b'bad')
    def test_length_mismatch(self):
        with self.assertRaisesRegex(ValueError, 'INVALID_LENGTH'):
            decode(encode(b'a') + b'x')
    def test_oversized(self):
        with self.assertRaisesRegex(ValueError, 'INVALID_PAYLOAD'):
            encode(b'x' * (MAX_PAYLOAD + 1))
    def test_version(self):
        wire = bytearray(encode(b'a'))
        wire[4] = 99
        with self.assertRaisesRegex(ValueError, 'UNSUPPORTED_ENVELOPE'):
            decode(bytes(wire))
if __name__ == '__main__': unittest.main()
