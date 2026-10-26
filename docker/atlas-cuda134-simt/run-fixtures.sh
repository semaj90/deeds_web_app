#!/usr/bin/env bash
set -euo pipefail

fixture_dir="${ATLAS_CUDA134_FIXTURE_DIR:-/fixtures}"
for count in 256 1000 4000; do
  glyphs="${fixture_dir}/glyphs-n${count}.bin"
  scores="${fixture_dir}/glyph-scores-n${count}-reference.bin"
  keys="${fixture_dir}/packed-keys-n${count}-reference.bin"
  for path in "$glyphs" "$scores" "$keys"; do
    if [[ ! -r "$path" ]]; then
      printf 'missing read-only fixture: %s\n' "$path" >&2
      exit 2
    fi
  done
  printf '{"schema":"atlas.cuda134-simt-run.v1","cudaToolkit":"13.4","sm":"8.6","n":%s,"executor":"simt"}\n' "$count"
  /usr/local/bin/glyph-kernels-simt "$glyphs" "$scores" "$keys" "$count"
  printf '{"schema":"atlas.cuda134-simt-run.v1","cudaToolkit":"13.4","sm":"8.6","n":%s,"executor":"cuda_tile_cpp"}\n' "$count"
  /usr/local/bin/glyph-fused-tile "$glyphs" "$scores" "$keys" "$count"
done
