#!/usr/bin/env node
/**
 * Font Download Script for Legal AI Platform
 * Downloads Google Fonts locally to prevent timeout issues
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FONTS_DIR = join(__dirname, '../static/fonts');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

// Google Fonts CSS URLs - these return different font files based on user agent
const FONT_URLS = {
  'inter': 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'jetbrains-mono': 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap',
  'ibm-plex-sans': 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap',
  'press-start-2p': 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
  'ms-gothic': 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500&display=swap' // MS Gothic alternative
};

async function downloadFont(name, url) {
  try {
    console.log(`📥 Downloading ${name}...`);

    // Fetch the CSS file to get font URLs
    const cssResponse = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT
      }
    });

    if (!cssResponse.ok) {
      throw new Error(`Failed to fetch CSS: ${cssResponse.status}`);
    }

    const cssContent = await cssResponse.text();
    console.log(`✅ Got CSS for ${name}`);

    // Extract font URLs from CSS
    const fontUrls = [...cssContent.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)]
      .map(match => match[1]);

    if (fontUrls.length === 0) {
      console.warn(`⚠️ No font URLs found in CSS for ${name}`);
      return;
    }

    // Download each font file
    const downloadedFonts = [];
    for (let i = 0; i < fontUrls.length; i++) {
      const fontUrl = fontUrls[i];
      const fileName = `${name}-${i + 1}.${fontUrl.includes('.woff2') ? 'woff2' : 'woff'}`;
      const filePath = join(FONTS_DIR, fileName);

      try {
        const fontResponse = await fetch(fontUrl);
        if (!fontResponse.ok) {
          throw new Error(`Failed to fetch font: ${fontResponse.status}`);
        }

        const fontBuffer = await fontResponse.arrayBuffer();
        writeFileSync(filePath, new Uint8Array(fontBuffer));

        downloadedFonts.push({
          originalUrl: fontUrl,
          localPath: `/fonts/${fileName}`,
          fileName
        });

        console.log(`  ✅ Downloaded ${fileName}`);
      } catch (error) {
        console.error(`  ❌ Failed to download ${fileName}:`, error.message);
      }
    }

    // Generate local CSS
    let localCss = cssContent;
    downloadedFonts.forEach(font => {
      localCss = localCss.replace(font.originalUrl, font.localPath);
    });

    // Save local CSS file
    const cssFilePath = join(FONTS_DIR, `${name}.css`);
    writeFileSync(cssFilePath, localCss);
    console.log(`  📄 Saved CSS: ${name}.css`);

    return { name, downloadedFonts, localCss };

  } catch (error) {
    console.error(`❌ Failed to download ${name}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('🔤 Legal AI Platform Font Downloader');
  console.log('=====================================');

  // Ensure fonts directory exists
  if (!existsSync(FONTS_DIR)) {
    mkdirSync(FONTS_DIR, { recursive: true });
    console.log(`📁 Created fonts directory: ${FONTS_DIR}`);
  }

  const results = [];

  // Download all fonts
  for (const [name, url] of Object.entries(FONT_URLS)) {
    const result = await downloadFont(name, url);
    if (result) {
      results.push(result);
    }

    // Add delay to be respectful to Google's servers
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Generate master CSS file
  const masterCss = results
    .map(result => `/* ${result.name.toUpperCase()} */\n${result.localCss}`)
    .join('\n\n');

  const masterCssPath = join(FONTS_DIR, 'fonts.css');
  writeFileSync(masterCssPath, masterCss);

  console.log('\n✅ Font download complete!');
  console.log(`📄 Master CSS file: ${masterCssPath}`);
  console.log(`🎯 Total fonts downloaded: ${results.reduce((acc, r) => acc + r.downloadedFonts.length, 0)}`);
  console.log('\n📋 Next steps:');
  console.log('1. Update app.css to use local fonts');
  console.log('2. Update uno.config.ts to disable web fonts');
  console.log('3. Test font loading without network dependency');
}

main().catch(console.error);