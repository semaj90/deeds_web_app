FROM nvidia/cuda:13.4.1-devel-ubuntu24.04@sha256:a3f014424ccc86cf66c84d700d2896491424205dd9457e3116ed4f0e96381311

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /opt/atlas-cuda134-simt

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY native/cutile-ace-level2/glyph_kernels_bench.cu ./glyph_kernels_bench.cu
COPY native/cutile-ace-level3/glyph_fused_tile.cu ./glyph_fused_tile.cu
COPY docker/atlas-cuda134-simt/run-fixtures.sh /usr/local/bin/run-fixtures

RUN nvcc -arch=sm_86 -O2 -o /usr/local/bin/glyph-kernels-simt glyph_kernels_bench.cu \
    && nvcc -enable-tile -std=c++20 -arch=sm_86 -O2 \
      -o /usr/local/bin/glyph-fused-tile glyph_fused_tile.cu \
    && chmod 0555 /usr/local/bin/run-fixtures

ENTRYPOINT ["/usr/local/bin/run-fixtures"]
