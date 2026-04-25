#!/usr/bin/env node

import crypto from 'crypto';
import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config();

const client = new Client({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
});

// Sample evidence files with different types
const sampleEvidence = [
  {
    title: 'Security Camera Footage - Store Entry',
    description: 'CCTV footage showing suspect entering convenience store at 2:15 PM',
    fileName: 'security_cam_001.mp4',
    fileType: 'video/mp4',
    content: 'Sample video content representing security camera footage of store entry',
  },
  {
    title: 'Fingerprint Analysis Report',
    description: 'Laboratory analysis of fingerprints found on evidence item #47',
    fileName: 'fingerprint_report_047.pdf',
    fileType: 'application/pdf',
    content:
      'FINGERPRINT ANALYSIS REPORT\nEvidence Item: #47\nAnalyst: Dr. Sarah Johnson\nDate: June 27, 2025\nResults: Positive match with suspect database',
  },
  {
    title: 'Witness Statement - John Doe',
    description: 'Written statement from eyewitness John Doe regarding incident on Main Street',
    fileName: 'witness_statement_john_doe.txt',
    fileType: 'text/plain',
    content:
      'WITNESS STATEMENT\nName: John Doe\nDate: June 27, 2025\nI was walking down Main Street when I saw...',
  },
  {
    title: 'Crime Scene Photo - Evidence Table',
    description: 'Photograph of evidence table showing items collected from crime scene',
    fileName: 'crime_scene_evidence_table.jpg',
    fileType: 'image/jpeg',
    content:
      'Binary image data representing crime scene photograph of evidence table with collected items',
  },
  {
    title: 'DNA Analysis Results',
    description: 'Laboratory DNA analysis results from blood sample collected at scene',
    fileName: 'dna_analysis_blood_sample.pdf',
    fileType: 'application/pdf',
    content:
      'DNA ANALYSIS REPORT\nSample ID: BLOOD_001\nAnalyst: Dr. Michael Chen\nResults: 13 STR loci analyzed\nConclusion: Strong match with suspect profile',
  },
  {
    title: 'Phone Records - Suspect Mobile',
    description: 'Cell phone records showing calls and text messages during incident timeframe',
    fileName: 'phone_records_suspect.csv',
    fileType: 'text/csv',
    content:
      'Time,Number,Type,Duration\n14:10,555-0123,Outgoing,120s\n14:25,555-0456,Incoming,45s\n14:30,555-0789,Text,N/A',
  },
];

async function createSampleEvidence() {
  console.log('📁 Creating Sample Evidence for Testing...\n');

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Get a user ID for the uploadedBy field
    const userResult = await client.query('SELECT id FROM users LIMIT 1');
    const userId = userResult.rows[0]?.id;

    if (!userId) {
      console.log('❌ No users found in database. Creating admin user first...');
      return;
    }

    console.log('👤 Using user ID:', userId);

    for (const evidence of sampleEvidence) {
      // Calculate hash for the content
      const hash = crypto.createHash('sha256').update(evidence.content, 'utf8').digest('hex');

      // Insert evidence
      const result = await client.query(
        `
        INSERT INTO evidence (
          title, description, file_name, hash, file_type, file_size,
          file_url, uploaded_by, tags
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, title, hash
      `,
        [
          evidence.title,
          evidence.description,
          evidence.fileName,
          hash,
          evidence.fileType,
          evidence.content.length,
          `/evidence/files/${evidence.fileName}`,
          userId,
          JSON.stringify(['sample', 'test', evidence.fileType.split('/')[0]]),
        ]
      );

      const evidenceId = result.rows[0].id;
      console.log(`✅ Created: ${evidence.title}`);
      console.log(`   📄 File: ${evidence.fileName}`);
      console.log(`   🔒 Hash: ${hash.substring(0, 16)}...`);
      console.log(`   🆔 ID: ${evidenceId}\n`);

      // Create some verification history for demonstration
      if (Math.random() > 0.3) {
        // 70% chance of having verification history
        await client.query(
          `
          INSERT INTO hash_verifications (
            evidence_id, verified_hash, stored_hash, result,
            verification_method, verified_by, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
          [
            evidenceId,
            hash,
            hash,
            true,
            'initial_upload',
            userId,
            'Automatic verification during evidence upload',
          ]
        );
        console.log(`   ✅ Added verification record\n`);
      }
    }

    // Create some additional verification records for testing dashboard
    console.log('📊 Creating additional verification records for dashboard testing...');

    const evidenceList = await client.query(
      'SELECT id, hash FROM evidence WHERE hash IS NOT NULL LIMIT 3'
    );

    for (const evidence of evidenceList.rows) {
      // Create a manual verification
      await client.query(
        `
        INSERT INTO hash_verifications (
          evidence_id, verified_hash, stored_hash, result,
          verification_method, verified_by, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          evidence.id,
          evidence.hash,
          evidence.hash,
          true,
          'manual',
          userId,
          'Manual verification by evidence clerk',
        ]
      );

      // Create one failed verification for testing (wrong hash)
      if (Math.random() > 0.7) {
        // 30% chance
        const wrongHash = evidence.hash.replace(/.$/, '0'); // Change last character
        await client.query(
          `
          INSERT INTO hash_verifications (
            evidence_id, verified_hash, stored_hash, result,
            verification_method, verified_by, notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
          [
            evidence.id,
            wrongHash,
            evidence.hash,
            false,
            'manual',
            userId,
            'Failed verification - possible file tampering detected',
          ]
        );
        console.log('   ❌ Added failed verification record');
      }
    }

    // Show summary statistics
    console.log('\n📈 Sample Data Summary:');
    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM evidence WHERE hash IS NOT NULL) as evidence_with_hash,
        (SELECT COUNT(*) FROM evidence WHERE hash IS NULL) as evidence_without_hash,
        (SELECT COUNT(*) FROM hash_verifications) as total_verifications,
        (SELECT COUNT(*) FROM hash_verifications WHERE result = true) as successful_verifications,
        (SELECT COUNT(*) FROM hash_verifications WHERE result = false) as failed_verifications
    `);

    const summary = stats.rows[0];
    console.log(`✅ Evidence with hash: ${summary.evidence_with_hash}`);
    console.log(`⚠️  Evidence without hash: ${summary.evidence_without_hash}`);
    console.log(`📊 Total verifications: ${summary.total_verifications}`);
    console.log(`✅ Successful verifications: ${summary.successful_verifications}`);
    console.log(`❌ Failed verifications: ${summary.failed_verifications}`);

    console.log('\n🎉 Sample Evidence Created Successfully!');
    console.log('\n🌐 Test the UI now:');
    console.log('📋 Evidence List: http://localhost:5174/evidence');
    console.log('🔍 Hash Verification: http://localhost:5174/evidence/hash');
    console.log('📊 Dashboard: http://localhost:5174/dashboard');
    console.log('🎨 Interactive Canvas: http://localhost:5174/interactive-canvas');
  } catch (error) {
    console.error('❌ Error creating sample evidence:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createSampleEvidence();
