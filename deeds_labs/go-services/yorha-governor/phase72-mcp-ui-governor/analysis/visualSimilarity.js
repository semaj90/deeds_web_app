const fs = require("fs/promises");
const crypto = require("crypto");
const sharp = require("sharp");

class VisualSimilarityAnalyzer {
  constructor() {
    this.cache = new Map();
  }

  async compare(sample, reference) {
    try {
      // Load and process images
      const [sampleBuffer, referenceBuffer] = await Promise.all([
        fs.readFile(sample),
        fs.readFile(reference)
      ]);

      // Calculate perceptual hashes
      const [sampleHash, referenceHash] = await Promise.all([
        this.calculatePHash(sampleBuffer),
        this.calculatePHash(referenceBuffer)
      ]);

      // Calculate Hamming distance
      const distance = this.hammingDistance(sampleHash, referenceHash);
      const maxDistance = 64; // 8x8 hash = 64 bits

      // Convert to similarity score (0-1, where 1 is identical)
      const similarity = 1 - (distance / maxDistance);

      return Math.max(0, Math.min(1, similarity));

    } catch (error) {
      console.error(`Error comparing images ${sample} vs ${reference}:`, error);
      return 0;
    }
  }

  async calculatePHash(buffer) {
    try {
      // Resize to 8x8 for perceptual hash
      const resized = await sharp(buffer)
        .resize(8, 8, { withoutEnlargement: true })
        .greyscale()
        .raw()
        .toBuffer();

      // Calculate DCT (simplified)
      const pixels = Array.from(resized);
      const dct = this.dct2D(this.arrayToMatrix(pixels, 8), 8);

      // Calculate median
      const flatDct = dct.flat().sort((a, b) => a - b);
      const median = flatDct[32]; // Middle value

      // Generate hash
      let hash = '';
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          hash += dct[i][j] > median ? '1' : '0';
        }
      }

      return hash;

    } catch (error) {
      console.error('Error calculating pHash:', error);
      return '0'.repeat(64);
    }
  }

  arrayToMatrix(array, size) {
    const matrix = [];
    for (let i = 0; i < size; i++) {
      matrix[i] = array.slice(i * size, (i + 1) * size);
    }
    return matrix;
  }

  dct2D(matrix, size) {
    const result = Array(size).fill().map(() => Array(size).fill(0));

    for (let u = 0; u < size; u++) {
      for (let v = 0; v < size; v++) {
        let sum = 0;
        for (let x = 0; x < size; x++) {
          for (let y = 0; y < size; y++) {
            const cu = u === 0 ? 1 / Math.sqrt(size) : Math.sqrt(2 / size);
            const cv = v === 0 ? 1 / Math.sqrt(size) : Math.sqrt(2 / size);
            sum += matrix[x][y] * Math.cos((2 * x + 1) * u * Math.PI / (2 * size)) *
                                  Math.cos((2 * y + 1) * v * Math.PI / (2 * size));
          }
        }
        result[u][v] = sum;
      }
    }

    return result;
  }

  hammingDistance(hash1, hash2) {
    let distance = 0;
    for (let i = 0; i < Math.min(hash1.length, hash2.length); i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }
    return distance;
  }

  async compareMultiple(sample, references) {
    const comparisons = [];

    for (const reference of references) {
      const similarity = await this.compare(sample, reference);
      comparisons.push({
        reference,
        similarity,
        match: similarity > 0.8 // 80% similarity threshold
      });
    }

    return comparisons.sort((a, b) => b.similarity - a.similarity);
  }

  async findBestMatch(sample, candidates) {
    const comparisons = await this.compareMultiple(sample, candidates);
    return comparisons[0] || null;
  }

  async detectChanges(beforeImage, afterImage) {
    const similarity = await this.compare(beforeImage, afterImage);

    return {
      similarity,
      changed: similarity < 0.95, // Consider changed if less than 95% similar
      changeLevel: similarity > 0.95 ? 'none' :
                   similarity > 0.8 ? 'minor' :
                   similarity > 0.6 ? 'moderate' : 'major'
    };
  }

  async batchCompare(beforeDir, afterDir) {
    try {
      const [beforeFiles, afterFiles] = await Promise.all([
        fs.readdir(beforeDir),
        fs.readdir(afterDir)
      ]);

      const results = [];

      for (const file of beforeFiles) {
        if (file.endsWith('.png') || file.endsWith('.jpg')) {
          const beforePath = `${beforeDir}/${file}`;
          const afterPath = `${afterDir}/${file}`;

          try {
            await fs.access(afterPath);
            const change = await this.detectChanges(beforePath, afterPath);
            results.push({
              file,
              ...change
            });
          } catch {
            results.push({
              file,
              similarity: 0,
              changed: true,
              changeLevel: 'removed'
            });
          }
        }
      }

      // Check for new files
      for (const file of afterFiles) {
        if (file.endsWith('.png') || file.endsWith('.jpg')) {
          const beforePath = `${beforeDir}/${file}`;
          try {
            await fs.access(beforePath);
          } catch {
            results.push({
              file,
              similarity: 0,
              changed: true,
              changeLevel: 'added'
            });
          }
        }
      }

      return results;

    } catch (error) {
      console.error('Error in batch comparison:', error);
      return [];
    }
  }

  async generateSimilarityMatrix(images) {
    const matrix = {};

    for (let i = 0; i < images.length; i++) {
      matrix[images[i]] = {};

      for (let j = 0; j < images.length; j++) {
        if (i === j) {
          matrix[images[i]][images[j]] = 1.0;
        } else if (j > i) {
          const similarity = await this.compare(images[i], images[j]);
          matrix[images[i]][images[j]] = similarity;
          matrix[images[j]][images[i]] = similarity;
        }
      }
    }

    return matrix;
  }

  async clusterSimilarImages(images, threshold = 0.8) {
    const clusters = [];
    const processed = new Set();

    for (const image of images) {
      if (processed.has(image)) continue;

      const cluster = [image];
      processed.add(image);

      for (const otherImage of images) {
        if (processed.has(otherImage)) continue;

        const similarity = await this.compare(image, otherImage);
        if (similarity >= threshold) {
          cluster.push(otherImage);
          processed.add(otherImage);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }
}

async function compare(sample, reference) {
  const analyzer = new VisualSimilarityAnalyzer();
  return await analyzer.compare(sample, reference);
}

module.exports = { VisualSimilarityAnalyzer, compare };