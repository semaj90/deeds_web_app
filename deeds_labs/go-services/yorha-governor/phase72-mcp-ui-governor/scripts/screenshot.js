const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

class ScreenshotAnalyzer {
  constructor() {
    this.outputDir = 'analysis/screenshots';
    this.analysisDir = 'analysis/visual';
  }

  async ensureDirectories() {
    await fs.mkdir(this.outputDir, { recursive: true });
    await fs.mkdir(this.analysisDir, { recursive: true });
  }

  async analyzeScreenshot(imagePath, routeName) {
    try {
      const image = sharp(imagePath);
      const metadata = await image.metadata();

      const analysis = {
        dimensions: {
          width: metadata.width,
          height: metadata.height
        },
        format: metadata.format,
        size: metadata.size,
        density: metadata.density,
        colorspace: metadata.space,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation
      };

      // Generate thumbnail
      const thumbnailPath = path.join(this.analysisDir, `${routeName}-thumb.jpg`);
      await image
        .resize(300, null, { withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      analysis.thumbnail = thumbnailPath;

      // Extract dominant colors (simplified)
      const stats = await image.stats();
      analysis.colors = {
        dominant: this.rgbToHex(stats.dominant),
        channels: stats.channels
      };

      return analysis;

    } catch (error) {
      console.error(`Error analyzing screenshot ${imagePath}:`, error);
      return null;
    }
  }

  rgbToHex(rgb) {
    return `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;
  }

  async compareScreenshots(screenshot1, screenshot2) {
    try {
      // This would use a more sophisticated image comparison library
      // For now, we'll do basic metadata comparison

      const img1 = sharp(screenshot1);
      const img2 = sharp(screenshot2);

      const [meta1, meta2] = await Promise.all([
        img1.metadata(),
        img2.metadata()
      ]);

      const differences = {
        dimensionChange: meta1.width !== meta2.width || meta1.height !== meta2.height,
        sizeChange: Math.abs(meta1.size - meta2.size),
        formatChange: meta1.format !== meta2.format
      };

      return differences;

    } catch (error) {
      console.error(`Error comparing screenshots:`, error);
      return null;
    }
  }

  async generateVisualReport(screenshots) {
    const report = {
      timestamp: new Date().toISOString(),
      totalScreenshots: screenshots.length,
      analyses: {}
    };

    for (const screenshot of screenshots) {
      const routeName = path.basename(screenshot, path.extname(screenshot));
      const analysis = await this.analyzeScreenshot(screenshot, routeName);

      if (analysis) {
        report.analyses[routeName] = analysis;
      }
    }

    // Calculate summary statistics
    const dimensions = Object.values(report.analyses).map(a => a.dimensions);
    const avgWidth = dimensions.reduce((sum, d) => sum + d.width, 0) / dimensions.length;
    const avgHeight = dimensions.reduce((sum, d) => sum + d.height, 0) / dimensions.length;

    report.summary = {
      averageDimensions: {
        width: Math.round(avgWidth),
        height: Math.round(avgHeight)
      },
      totalSize: Object.values(report.analyses).reduce((sum, a) => sum + a.size, 0),
      formats: [...new Set(Object.values(report.analyses).map(a => a.format))]
    };

    return report;
  }

  async batchAnalyze(directory = this.outputDir) {
    await this.ensureDirectories();

    try {
      const files = await fs.readdir(directory);
      const screenshots = files.filter(file => file.endsWith('.png') || file.endsWith('.jpg'));

      console.log(`📸 Found ${screenshots.length} screenshots to analyze`);

      const report = await this.generateVisualReport(
        screenshots.map(file => path.join(directory, file))
      );

      // Save report
      const reportPath = path.join(this.analysisDir, 'visual-analysis.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

      console.log(`✅ Visual analysis complete. Report saved to: ${reportPath}`);
      return report;

    } catch (error) {
      console.error('Error in batch analysis:', error);
      return null;
    }
  }

  async detectLayoutShifts(beforeScreenshot, afterScreenshot) {
    // This would implement layout shift detection
    // For now, return basic comparison
    const comparison = await this.compareScreenshots(beforeScreenshot, afterScreenshot);

    if (!comparison) return null;

    const shifts = {
      hasShifts: comparison.dimensionChange || comparison.sizeChange > 10000,
      dimensionChange: comparison.dimensionChange,
      sizeDifference: comparison.sizeChange,
      severity: comparison.sizeChange > 50000 ? 'high' :
                comparison.sizeChange > 10000 ? 'medium' : 'low'
    };

    return shifts;
  }
}

async function analyzeScreenshots() {
  const analyzer = new ScreenshotAnalyzer();
  return await analyzer.batchAnalyze();
}

async function compareBeforeAfter(beforeDir, afterDir) {
  const analyzer = new ScreenshotAnalyzer();

  try {
    const [beforeFiles, afterFiles] = await Promise.all([
      fs.readdir(beforeDir),
      fs.readdir(afterDir)
    ]);

    const comparisons = [];

    for (const file of beforeFiles) {
      if (file.endsWith('.png')) {
        const beforePath = path.join(beforeDir, file);
        const afterPath = path.join(afterDir, file);

        try {
          await fs.access(afterPath);
          const comparison = await analyzer.detectLayoutShifts(beforePath, afterPath);
          comparisons.push({
            file,
            comparison
          });
        } catch {
          console.log(`⚠️ No matching after screenshot for ${file}`);
        }
      }
    }

    return comparisons;

  } catch (error) {
    console.error('Error comparing screenshots:', error);
    return null;
  }
}

module.exports = {
  ScreenshotAnalyzer,
  analyzeScreenshots,
  compareBeforeAfter
};