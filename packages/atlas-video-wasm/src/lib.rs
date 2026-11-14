const FILMCRAFT_TICKS_PER_MILLISECOND: u64 = 254_016_000;

fn pixel(words: &[u64; 9], index: usize) -> u8 {
    let word = words[index / 8];
    ((word >> ((index % 8) * 8)) & 0xff) as u8
}

fn compute_dhash_gray_9x8(words: &[u64; 9]) -> u64 {
    let mut hash = 0_u64;
    for row in 0..8 {
        for col in 0..8 {
            let left = pixel(words, row * 9 + col);
            let right = pixel(words, row * 9 + col + 1);
            if left < right {
                hash |= 1_u64 << (row * 8 + col);
            }
        }
    }
    hash
}

#[no_mangle]
pub extern "C" fn atlas_video_wasm_abi_version() -> u32 {
    1
}

/// Milliseconds to FilmCraft's exact 254,016,000,000 ticks-per-second timebase.
#[no_mangle]
pub extern "C" fn ms_to_filmcraft_ticks(ms: u32) -> u64 {
    u64::from(ms) * FILMCRAFT_TICKS_PER_MILLISECOND
}

/// Hamming distance for two 64-bit dHashes. Hash bytes use LSB0 bit numbering.
#[no_mangle]
pub extern "C" fn dhash_hamming_distance(hash_a: u64, hash_b: u64) -> u32 {
    (hash_a ^ hash_b).count_ones()
}

/// Computes dHash from 72 grayscale pixels packed 8 pixels per u64, low byte first.
/// The nine arguments contain the row-major 9x8 sample from left to right, top to bottom.
#[no_mangle]
pub extern "C" fn dhash_gray_9x8(
    word_0: u64,
    word_1: u64,
    word_2: u64,
    word_3: u64,
    word_4: u64,
    word_5: u64,
    word_6: u64,
    word_7: u64,
    word_8: u64,
) -> u64 {
    compute_dhash_gray_9x8(&[
        word_0, word_1, word_2, word_3, word_4, word_5, word_6, word_7, word_8,
    ])
}

#[cfg(test)]
mod tests {
    use super::{compute_dhash_gray_9x8, dhash_hamming_distance, ms_to_filmcraft_ticks};

    fn pack_pixels(pixels: &[u8; 72]) -> [u64; 9] {
        let mut words = [0_u64; 9];
        for (index, value) in pixels.iter().enumerate() {
            words[index / 8] |= u64::from(*value) << ((index % 8) * 8);
        }
        words
    }

    #[test]
    fn filmcraft_timebase_is_exact_for_integer_milliseconds() {
        assert_eq!(ms_to_filmcraft_ticks(1), 254_016_000);
        assert_eq!(ms_to_filmcraft_ticks(1_000), 254_016_000_000);
        assert_eq!(ms_to_filmcraft_ticks(60_000), 15_240_960_000_000);
    }

    #[test]
    fn hamming_distance_uses_xor_popcount() {
        assert_eq!(dhash_hamming_distance(0, 0), 0);
        assert_eq!(dhash_hamming_distance(0, u64::MAX), 64);
        assert_eq!(dhash_hamming_distance(0b1010, 0b0011), 2);
    }

    #[test]
    fn gradient_and_flat_samples_have_stable_lsb0_hashes() {
        let mut gradient = [0_u8; 72];
        for row in 0..8 {
            for col in 0..9 {
                gradient[row * 9 + col] = (col * 20) as u8;
            }
        }
        assert_eq!(compute_dhash_gray_9x8(&pack_pixels(&gradient)), u64::MAX);
        assert_eq!(compute_dhash_gray_9x8(&pack_pixels(&[42; 72])), 0);
    }

    #[test]
    fn cross_row_pixel_packing_preserves_horizontal_comparisons() {
        let mut sample = [0_u8; 72];
        sample[7] = 1;
        sample[8] = 2;
        assert_eq!(compute_dhash_gray_9x8(&pack_pixels(&sample)), 3_u64 << 6);
    }
}
