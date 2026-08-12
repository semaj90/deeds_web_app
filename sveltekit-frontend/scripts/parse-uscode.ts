/**
 * Parse U.S. Code XML for Titles 18 & 28
 * Extracts sections, subsections, and text for ingestion
 */

import AdmZip from 'adm-zip';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseStringPromise } from 'xml2js';
import { fileURLToPath } from 'node:url';

const ZIP_PATH = '/tmp/uscxml.zip';
const EXTRACT_DIR = '/tmp/uscode-extracted';
const TITLES_TO_EXTRACT = ['18', '28'];

export interface ParsedStatute {
  title: string;
  section: string;
  subsection?: string;
  jurisdiction: string;
  category: string;
  body: string;
  sourceUrl: string;
}

/**
 * Extract ZIP file
 */
function extractZip(): void {
  console.log('📦 Extracting U.S. Code XML...');

  try {
    const zip = new AdmZip(ZIP_PATH);
    const entries = zip.getEntries();

    // Create extract directory
    if (!fs.existsSync(EXTRACT_DIR)) {
      fs.mkdirSync(EXTRACT_DIR, { recursive: true });
    }

    let extracted = 0;

    for (const entry of entries) {
      // Only extract Title 18 and 28
      if (TITLES_TO_EXTRACT.some((title) => entry.entryName.includes(`usc${title}`))) {
        const targetPath = path.join(EXTRACT_DIR, path.basename(entry.entryName));
        fs.writeFileSync(targetPath, entry.getData());
        console.log(`✅ Extracted: ${entry.entryName}`);
        extracted++;
      }
    }

    console.log(`✅ Extracted ${extracted} files`);
  } catch (error) {
    console.error('❌ Failed to extract ZIP:', error);
    throw error;
  }
}

/**
 * Parse XML statute file
 */
async function parseStatuteXML(filePath: string): Promise<ParsedStatute[]> {
  try {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = await parseStringPromise(xmlContent);

    const statutes: ParsedStatute[] = [];
    const titleMatch = filePath.match(/usc(\d+)/i);
    const titleNum = titleMatch ? titleMatch[1] : 'unknown';

    // Navigate XML structure (varies by source, this is a common pattern)
    const sections = parsed.uscode?.section || [];

    for (const section of sections) {
      const sectionNum = section.$.num || '';
      const sectionTitle = section.heading?.[0] || '';
      const sectionBody = section.text?.[0] || '';

      if (sectionNum && sectionBody) {
        statutes.push({
          title: `${titleNum} U.S.C. § ${sectionNum}`,
          section: `§ ${sectionNum}`,
          jurisdiction: 'US-Federal',
          category: titleNum === '18' ? 'criminal' : 'judicial',
          body: sectionBody.trim(),
          sourceUrl: `https://www.law.cornell.edu/uscode/text/${titleNum}/${sectionNum}`,
        });
      }
    }

    return statutes;
  } catch (error) {
    console.error(`❌ Failed to parse ${filePath}:`, error);
    return [];
  }
}

/**
 * Parse all extracted statute files
 */
async function parseAllStatutes(): Promise<ParsedStatute[]> {
  console.log('\n📖 Parsing statute XML files...');

  const allStatutes: ParsedStatute[] = [];

  try {
    const files = fs.readdirSync(EXTRACT_DIR);

    for (const file of files) {
      if (file.endsWith('.xml')) {
        const filePath = path.join(EXTRACT_DIR, file);
        console.log(`📄 Parsing: ${file}`);

        const statutes = await parseStatuteXML(filePath);
        allStatutes.push(...statutes);

        console.log(`✅ Found ${statutes.length} sections in ${file}`);
      }
    }

    console.log(`\n✅ Total statutes parsed: ${allStatutes.length}`);
    return allStatutes;
  } catch (error) {
    console.error('❌ Failed to parse statutes:', error);
    throw error;
  }
}

/**
 * Save parsed statutes to JSON
 */
function saveStatutesJSON(statutes: ParsedStatute[], outputPath: string): void {
  try {
    fs.writeFileSync(outputPath, JSON.stringify(statutes, null, 2));
    console.log(`✅ Saved ${statutes.length} statutes to ${outputPath}`);
  } catch (error) {
    console.error('❌ Failed to save JSON:', error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    console.log('🚀 Starting U.S. Code XML parsing...\n');

    // Extract ZIP
    extractZip();

    // Parse all statutes
    const statutes = await parseAllStatutes();

    // Save to JSON
    const outputPath = path.join(EXTRACT_DIR, 'parsed-statutes.json');
    saveStatutesJSON(statutes, outputPath);

    console.log('\n✅ U.S. Code parsing complete!');
    console.log(`📍 Output: ${outputPath}`);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { extractZip, parseStatuteXML, parseAllStatutes, saveStatutesJSON };
