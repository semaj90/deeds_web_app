// chr97_rune.h - CHR97 Binary Rune Format
#pragma once
#include <stdint.h>

#pragma pack(push, 1)
typedef struct Chr97Rune {
    // --- IDs / indices (16 bytes) ---
    uint32_t id;           // global rune id (matches Qdrant payload id)
    uint32_t case_id_hash; // hash of case_id string
    uint32_t chunk_index;  // chunk index inside case
    uint32_t cluster_id;   // cluster for manifold/graph

    // --- 4D manifold (16 bytes) ---
    float manifold[4];     // [u, v, w, t]

    // --- heat + flags (8 bytes) ---
    uint16_t heat_u16;     // 0..65535, avg heat
    uint16_t flags;        // bit flags (is_image, is_text, etc.)
    uint32_t reserved0;    // padding / future

    // --- 16D projection (64 bytes) ---
    float emb16[16];       // 16 x 4 bytes = 64

    // --- tag / label indices into side string table (16 bytes) ---
    uint32_t tag_offset;   // byte offset into tag pool
    uint16_t tag_len;      // length in bytes
    uint32_t label_offset; // byte offset into label pool
    uint16_t label_len;    // length in bytes

    uint32_t image_meta_offset; // optional image meta block
    uint32_t reserved1;
} Chr97Rune;
#pragma pack(pop)

static const uint32_t CHR97_RUNE_SIZE = sizeof(Chr97Rune); // should be 128

#pragma pack(push, 1)
typedef struct Chr97Header {
    char magic[8];        // "CHR97BIN"
    uint32_t version;     // 1
    uint32_t rune_count;  // N
    uint32_t rune_stride; // sizeof(Chr97Rune) == 128
    uint32_t string_pool_offset; // from file start
    uint32_t string_pool_size;
    uint32_t reserved[4];
} Chr97Header;
#pragma pack(pop)

static const uint32_t CHR97_HEADER_SIZE = sizeof(Chr97Header); // should be 32

// Flag bits for Chr97Rune.flags
#define CHR97_FLAG_IS_IMAGE  (1 << 0)
#define CHR97_FLAG_IS_TEXT   (1 << 1)
#define CHR97_FLAG_HAS_CITES (1 << 2)
#define CHR97_FLAG_IS_SEARCH (1 << 3)
#define CHR97_FLAG_IS_SAVED  (1 << 4)
#define CHR97_FLAG_GPU_READY (1 << 5)