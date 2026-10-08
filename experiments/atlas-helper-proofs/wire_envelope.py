"""Versioned integrity-checked experiment envelope. Not a canonical packet or QUIC framing."""
import hashlib
import struct

MAGIC = b'ATXP'
VERSION = 1
MAX_PAYLOAD = 2_000_000
HEADER = struct.Struct('>4sBI32s')  # magic, version, uint32 payload length, SHA-256

def encode(payload: bytes) -> bytes:
    if not isinstance(payload, bytes) or len(payload) > MAX_PAYLOAD:
        raise ValueError('INVALID_PAYLOAD')
    return HEADER.pack(MAGIC, VERSION, len(payload), hashlib.sha256(payload).digest()) + payload

def decode(wire: bytes) -> bytes:
    if not isinstance(wire, bytes) or len(wire) < HEADER.size:
        raise ValueError('TRUNCATED_HEADER')
    magic, version, length, digest = HEADER.unpack(wire[:HEADER.size])
    if magic != MAGIC or version != VERSION:
        raise ValueError('UNSUPPORTED_ENVELOPE')
    if length > MAX_PAYLOAD or len(wire) != HEADER.size + length:
        raise ValueError('INVALID_LENGTH')
    payload = wire[HEADER.size:]
    if hashlib.sha256(payload).digest() != digest:
        raise ValueError('CHECKSUM_MISMATCH')
    return payload
