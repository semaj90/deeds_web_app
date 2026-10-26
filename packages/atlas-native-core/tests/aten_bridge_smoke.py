from __future__ import annotations

import gc
import sys
from pathlib import Path

import torch

sys.path.insert(0, sys.argv[1])
import _atlas_aten_bridge


def main() -> None:
    source_blocks = [bytes(range(128)), bytes(reversed(range(128)))]
    tensor = _atlas_aten_bridge.materialize_lod_blocks_cpu(source_blocks)
    del source_blocks
    gc.collect()

    assert tensor.device.type == "cpu"
    assert tensor.dtype == torch.uint8
    assert tuple(tensor.shape) == (2, 128)
    assert tensor.is_contiguous()
    assert tensor.data_ptr() % 64 == 0
    assert tensor[0, 0].item() == 0
    assert tensor[0, 127].item() == 127
    assert tensor[1, 0].item() == 127
    assert tensor[1, 127].item() == 0
    tensor[0, 0] = 91
    assert tensor[0, 0].item() == 91

    try:
        _atlas_aten_bridge.materialize_lod_blocks_cpu([])
    except ValueError as error:
        assert "LOD_BLOCKS_MUST_NOT_BE_EMPTY" in str(error)
    else:
        raise AssertionError("empty LOD block list was accepted")

    try:
        _atlas_aten_bridge.materialize_lod_blocks_cpu([b"short"])
    except ValueError as error:
        assert "EACH_LOD_TEXTURE_BLOCK_MUST_BE_128_BYTES" in str(error)
    else:
        raise AssertionError("malformed LOD block was accepted")

    print(f"ATen CPU tensor bridge PASS (torch={torch.__version__}, alignment=64)")


if __name__ == "__main__":
    main()
