const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

class VisualRegressionDetector {
  constructor(options = {}) {
    this.baselineDir = options.baselineDir || './baselines';
    this.threshold = options.threshold || 0.01; // 1% difference threshold
    this.diffDir = options.diffDir || './diffs';
    this.screenshotDir = options.screenshotDir || './screenshots';
  }

  async initialize() {
    await fs.mkdir(this.baselineDir, { recursive: true });
    await fs.mkdir(this.diffDir, { recursive: true });
    await fs.mkdir(this.screenshotDir, { recursive: true });
  }

  async captureBaseline(route, screenshotBuffer, metadata = {}) {
    const hash = this.generateHash(screenshotBuffer);
    const filename = `${route.replace(/\//g, '_')}_${hash}.png`;
    const filepath = path.join(this.baselineDir, filename);

    await fs.writeFile(filepath, screenshotBuffer);

    const baseline = {
      route,
      hash,
      filepath,
      captured: new Date().toISOString(),
      metadata: {
        ...metadata,
        dimensions: await this.getImageDimensions(screenshotBuffer)
      }
    };

    await this.saveBaselineInfo(baseline);
    return baseline;
  }

  async compareWithBaseline(route, screenshotBuffer, metadata = {}) {
    const baseline = await this.findBaseline(route);
    if (!baseline) {
      console.log(`No baseline found for ${route}, creating new baseline`);
      return await this.captureBaseline(route, screenshotBuffer, metadata);
    }

    const baselineBuffer = await fs.readFile(baseline.filepath);
    const diffResult = await this.calculateDifference(baselineBuffer, screenshotBuffer);

    const comparison = {
      route,
      baseline: baseline.hash,
      current: this.generateHash(screenshotBuffer),
      difference: diffResult.difference,
      threshold: this.threshold,
      isRegression: diffResult.difference > this.threshold,
      diffPath: diffResult.diffPath,
      metadata: {
        ...metadata,
        baselineCaptured: baseline.captured,
        comparisonTime: new Date().toISOString()
      }
    };

    if (comparison.isRegression) {
      console.warn(`⚠️ Visual regression detected for ${route}: ${diffResult.difference.toFixed(4)} > ${this.threshold}`);
    }

    return comparison;
  }

  async calculateDifference(image1Buffer, image2Buffer) {
    // Resize images to same dimensions for comparison
    const [img1, img2] = await Promise.all([
      sharp(image1Buffer).resize(1920, 1080, { fit: 'inside' }).png().toBuffer(),
      sharp(image2Buffer).resize(1920, 1080, { fit: 'inside' }).png().toBuffer()
    ]);

    // Calculate pixel difference
    const img1Pixels = await sharp(img1).raw().toBuffer();
    const img2Pixels = await sharp(img2).raw().toBuffer();

    const { width, height } = await sharp(img1).metadata();
    let totalDifference = 0;
    let pixelCount = 0;

    for (let i = 0; i < img1Pixels.length; i += 3) {
      const r1 = img1Pixels[i];
      const g1 = img1Pixels[i + 1];
      const b1 = img1Pixels[i + 2];

      const r2 = img2Pixels[i];
      const g2 = img2Pixels[i + 1];
      const b2 = img2Pixels[i + 2];

      // Calculate Euclidean distance in RGB space
      const diff = Math.sqrt(
        Math.pow(r1 - r2, 2) +
        Math.pow(g1 - g2, 2) +
        Math.pow(b1 - b2, 2)
      );

      totalDifference += diff;
      pixelCount++;
    }

    const averageDifference = totalDifference / pixelCount;
    const normalizedDifference = averageDifference / Math.sqrt(3 * Math.pow(255, 2)); // Normalize to 0-1

    // Generate diff image
    const diffPath = await this.generateDiffImage(img1, img2, width, height);

    return {
      difference: normalizedDifference,
      diffPath,
      totalPixels: pixelCount,
      averageDifference
    };
  }

  async generateDiffImage(img1Buffer, img2Buffer, width, height) {
    const img1Pixels = await sharp(img1Buffer).raw().toBuffer();
    const img2Pixels = await sharp(img2Buffer).raw().toBuffer();

    const diffPixels = Buffer.alloc(img1Pixels.length);

    for (let i = 0; i < img1Pixels.length; i += 3) {
      const r1 = img1Pixels[i];
      const g1 = img1Pixels[i + 1];
      const b1 = img1Pixels[i + 2];

      const r2 = img2Pixels[i];
      const g2 = img2Pixels[i + 1];
      const b2 = img2Pixels[i + 2];

      // Highlight differences in red
      const threshold = 30; // Minimum difference to highlight
      const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);

      if (diff > threshold) {
        diffPixels[i] = 255;     // Red channel
        diffPixels[i + 1] = 0;   // Green channel
        diffPixels[i + 2] = 0;   // Blue channel
      } else {
        // Blend the two images
        diffPixels[i] = Math.abs(r1 - r2);
        diffPixels[i + 1] = Math.abs(g1 - g2);
        diffPixels[i + 2] = Math.abs(b1 - b2);
      }
    }

    const timestamp = Date.now();
    const diffPath = path.join(this.diffDir, `diff_${timestamp}.png`);

    await sharp(diffPixels, {
      raw: { width, height, channels: 3 }
    }).png().toFile(diffPath);

    return diffPath;
  }

  async findBaseline(route) {
    try {
      const baselines = await fs.readdir(this.baselineDir);
      const routeBaselines = baselines.filter(file =>
        file.startsWith(route.replace(/\//g, '_') + '_') && file.endsWith('.png')
      );

      if (routeBaselines.length === 0) return null;

      // Get the most recent baseline
      const latestBaseline = routeBaselines.sort().pop();
      const baselinePath = path.join(this.baselineDir, latestBaseline);

      // Load baseline info
      const infoPath = baselinePath.replace('.png', '.json');
      const info = JSON.parse(await fs.readFile(infoPath, 'utf8'));

      return {
        ...info,
        filepath: baselinePath
      };
    } catch (error) {
      console.error(`Error finding baseline for ${route}:`, error);
      return null;
    }
  }

  async saveBaselineInfo(baseline) {
    const infoPath = baseline.filepath.replace('.png', '.json');
    await fs.writeFile(infoPath, JSON.stringify(baseline, null, 2));
  }

  generateHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 8);
  }

  async getImageDimensions(buffer) {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format
    };
  }

  async analyzeRegression(comparison) {
    const analysis = {
      route: comparison.route,
      regressionDetected: comparison.isRegression,
      severity: this.calculateSeverity(comparison.difference),
      difference: comparison.difference,
      threshold: comparison.threshold,
      recommendations: []
    };

    if (analysis.regressionDetected) {
      analysis.recommendations = this.generateRecommendations(comparison);
    }

    return analysis;
  }

  calculateSeverity(difference) {
    if (difference < 0.01) return 'none';
    if (difference < 0.05) return 'minor';
    if (difference < 0.15) return 'moderate';
    return 'severe';
  }

  generateRecommendations(comparison) {
    const recommendations = [];

    if (comparison.difference > 0.15) {
      recommendations.push({
        type: 'critical',
        action: 'Review layout changes that may affect user experience',
        priority: 'high'
      });
    }

    if (comparison.difference > 0.05) {
      recommendations.push({
        type: 'review',
        action: 'Check for unintended style changes or component updates',
        priority: 'medium'
      });
    }

    recommendations.push({
      type: 'update',
      action: 'Update baseline if changes are intentional',
      priority: 'low'
    });

    return recommendations;
  }

  async batchCompare(routes, screenshotBuffers, metadata = {}) {
    const results = [];

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const buffer = screenshotBuffers[i];

      try {
        const comparison = await this.compareWithBaseline(route, buffer, metadata);
        const analysis = await this.analyzeRegression(comparison);

        results.push({
          route,
          comparison,
          analysis
        });
      } catch (error) {
        console.error(`Error comparing ${route}:`, error);
        results.push({
          route,
          error: error.message,
          comparison: null,
          analysis: null
        });
      }
    }

    return results;
  }

  async cleanupOldDiffs(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days
    try {
      const files = await fs.readdir(this.diffDir);
      const now = Date.now();

      for (const file of files) {
        const filepath = path.join(this.diffDir, file);
        const stats = await fs.stat(filepath);

        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filepath);
          console.log(`Cleaned up old diff: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old diffs:', error);
    }
  }

  async getRegressionReport(results) {
    const regressions = results.filter(r => r.analysis?.regressionDetected);
    const severities = results.reduce((acc, r) => {
      if (r.analysis?.severity && r.analysis.severity !== 'none') {
        acc[r.analysis.severity] = (acc[r.analysis.severity] || 0) + 1;
      }
      return acc;
    }, {});

    return {
      totalRoutes: results.length,
      regressionsDetected: regressions.length,
      regressionRate: (regressions.length / results.length) * 100,
      severities,
      topRegressions: regressions
        .sort((a, b) => b.comparison.difference - a.comparison.difference)
        .slice(0, 10)
        .map(r => ({
          route: r.route,
          difference: r.comparison.difference,
          severity: r.analysis.severity
        }))
    };
  }
}

async function detectVisualRegressions(routes, screenshotBuffers, options = {}) {
  const detector = new VisualRegressionDetector(options);
  await detector.initialize();

  const results = await detector.batchCompare(routes, screenshotBuffers);
  const report = await detector.getRegressionReport(results);

  return {
    results,
    report,
    detector
  };
}

module.exports = { VisualRegressionDetector, detectVisualRegressions };