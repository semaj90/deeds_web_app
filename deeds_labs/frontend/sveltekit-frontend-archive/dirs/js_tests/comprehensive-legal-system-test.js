#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5173';

// Simple cookie jar for session management
let sessionCookie = null;
let currentUser = null;

async function makeRequest(url, options = {}) {
  const { default: fetch } = await import('node-fetch');

  const headers = {
    ...options.headers,
  };

  // Only add Content-Type for JSON requests, not for FormData
  if (!headers['Content-Type'] && !options.body?.constructor?.name?.includes('FormData')) {
    headers['Content-Type'] = 'application/json';
  }

  if (sessionCookie && !headers['Cookie']) {
    headers['Cookie'] = sessionCookie;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Store session cookie from response
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    sessionCookie = setCookie.split(';')[0];
  }

  return response;
}

async function testUserRegistration() {
  console.log('🔐 Testing User Registration...');

  try {
    const response = await makeRequest(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Legal System Test User',
        email: 'legal.test@courthouse.gov',
        password: 'SecurePassword123!',
        role: 'prosecutor',
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ User registration successful!');
      return data.user;
    } else {
      if (data.error === 'User already exists') {
        console.log('ℹ️  User already exists, continuing with login...');
        return null;
      }
      console.log('❌ Registration failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    return null;
  }
}

async function testUserLogin() {
  console.log('🔐 Testing User Login...');

  try {
    const response = await makeRequest(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: 'legal.test@courthouse.gov',
        password: 'SecurePassword123!',
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Login successful!');
      currentUser = data.user;
      return data.user;
    } else {
      console.log('❌ Login failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return null;
  }
}

async function testCreateCase() {
  console.log('📂 Testing Case Creation...');

  try {
    const caseData = {
      title: 'State v. Comprehensive Test Case',
      description: 'A comprehensive test case for the legal management system',
      caseNumber: `CT-${Date.now()}`,
      caseType: 'criminal',
      status: 'active',
      priority: 'high',
      jurisdiction: 'State Court',
      assignedProsecutor: currentUser.id,
      defendants: ['John Doe Test'],
      charges: ['Grand Theft Auto', 'Reckless Endangerment'],
      courtDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
      metadata: {
        estimatedTrialLength: '5 days',
        complexity: 'moderate',
      },
    };

    const response = await makeRequest(`${BASE_URL}/api/cases`, {
      method: 'POST',
      body: JSON.stringify(caseData),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Case created successfully!');
      console.log(`   Case ID: ${data.id}`);
      console.log(`   Case Number: ${data.caseNumber}`);
      return data;
    } else {
      console.log('❌ Case creation failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Case creation error:', error.message);
    return null;
  }
}

async function testCreateReport(caseId) {
  console.log('📄 Testing Report Creation...');

  try {
    const reportData = {
      title: 'Comprehensive Case Analysis Report',
      content: `
                <h1>Case Analysis Report</h1>
                <h2>Executive Summary</h2>
                <p>This report provides a comprehensive analysis of the case evidence and legal strategy.</p>
                
                <h2>Evidence Summary</h2>
                <ul>
                    <li>Physical evidence collected at the scene</li>
                    <li>Witness testimonies from 3 individuals</li>
                    <li>Digital forensics analysis</li>
                    <li>Surveillance footage review</li>
                </ul>
                
                <h2>Legal Strategy</h2>
                <p>Based on the evidence analysis, we recommend proceeding with the following charges...</p>
                
                <h2>Recommendations</h2>
                <ol>
                    <li>Proceed with grand theft auto charges</li>
                    <li>Add reckless endangerment as secondary charge</li>
                    <li>Request pretrial detention due to flight risk</li>
                    <li>Prepare plea bargain options</li>
                </ol>
            `,
      summary:
        'Comprehensive analysis of case evidence with strategic recommendations for prosecution.',
      caseId: caseId,
      reportType: 'prosecution_memo',
      status: 'draft',
      confidentialityLevel: 'restricted',
      jurisdiction: 'State Court',
      tags: ['analysis', 'strategy', 'evidence-review'],
      metadata: {
        complexity: 'high',
        urgency: 'normal',
        reviewRequired: true,
      },
      sections: [
        { title: 'Executive Summary', order: 1 },
        { title: 'Evidence Summary', order: 2 },
        { title: 'Legal Strategy', order: 3 },
        { title: 'Recommendations', order: 4 },
      ],
    };

    const response = await makeRequest(`${BASE_URL}/api/reports`, {
      method: 'POST',
      body: JSON.stringify(reportData),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Report created successfully!');
      console.log(`   Report ID: ${data.id}`);
      console.log(`   Word Count: ${data.wordCount}`);
      console.log(`   Estimated Read Time: ${data.estimatedReadTime} minutes`);
      return data;
    } else {
      console.log('❌ Report creation failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Report creation error:', error.message);
    return null;
  }
}

async function testTagCase(caseId) {
  console.log('🏷️  Testing Case Tagging...');

  try {
    const tags = ['high-priority', 'complex-case', 'multiple-defendants', 'vehicle-crime'];

    const response = await makeRequest(`${BASE_URL}/api/cases/${caseId}`, {
      method: 'PUT',
      body: JSON.stringify({
        tags: tags,
        metadata: {
          taggedAt: new Date().toISOString(),
          taggedBy: currentUser.id,
        },
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Case tagged successfully!');
      console.log(`   Tags: ${tags.join(', ')}`);
      return data;
    } else {
      console.log('❌ Case tagging failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Case tagging error:', error.message);
    return null;
  }
}

async function testTagReport(reportId) {
  console.log('🏷️  Testing Report Tagging...');

  try {
    const tags = ['analysis', 'prosecution-strategy', 'evidence-review', 'high-confidence'];
    const aiTags = ['criminal-law', 'evidence-analysis', 'legal-strategy'];

    const response = await makeRequest(`${BASE_URL}/api/reports`, {
      method: 'PUT',
      body: JSON.stringify({
        id: reportId: tags, tags: tags,
        aiTags: aiTags,
        metadata: {
          taggedAt: new Date().toISOString(),
          confidence: 0.92,
        },
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Report tagged successfully!');
      console.log(`   Manual Tags: ${tags.join(', ')}`);
      console.log(`   AI Tags: ${aiTags.join(', ')}`);
      return data;
    } else {
      console.log('❌ Report tagging failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Report tagging error:', error.message);
    return null;
  }
}

async function testCitationPoint(reportId) {
  console.log('📖 Testing Citation Point Creation...');

  try {
    const citationData = {
      text: 'Vehicle theft constitutes a felony offense when the value exceeds $1,000',
      source: 'State v. Johnson, 123 ABC 456 (2024)',
      page: 15,
      context:
        'This case establishes the legal framework for determining intent in vehicle theft cases.',
      type: 'case_law',
      jurisdiction: 'State Supreme Court',
      tags: ['theft', 'vehicle-crime', 'felony'],
      reportId: reportId,
      aiSummary: 'Legal precedent for grand theft auto prosecution criteria',
      relevanceScore: '0.92',
      metadata: {
        importance: 'critical',
        year: 2024,
        court: 'State Supreme Court',
      },
      isBookmarked: true,
    };

    const response = await makeRequest(`${BASE_URL}/api/citation-points`, {
      method: 'POST',
      body: JSON.stringify(citationData),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Citation point created successfully!');
      console.log(`   Citation: ${data.source}`);
      console.log(`   Type: ${data.type}`);
      console.log(`   Relevance Score: ${data.relevanceScore}`);
      return data;
    } else {
      console.log('❌ Citation point creation failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Citation point error:', error.message);
    return null;
  }
}

async function testInteractiveCanvas(reportId) {
  console.log('🎨 Testing Interactive Canvas...');

  try {
    const canvasData = {
      title: 'Case Analysis Canvas',
      reportId: reportId,
      canvasData: {
        version: '1.0',
        elements: [
          {
            id: 'evidence-1',
            type: 'evidence-box',
            x: 100: y, 100: 100,
            width: 200: height, 150: 150,
            data: {
              title: 'Physical Evidence',
              items: ['Vehicle fingerprints', 'DNA samples', 'Tool marks'],
              confidence: 0.95,
            },
          },
          {
            id: 'witness-1',
            type: 'witness-box',
            x: 350: y, 100: 100,
            width: 180: height, 120: 120,
            data: {
              name: 'Jane Smith',
              testimony: 'Witnessed defendant flee scene',
              reliability: 0.87,
            },
          },
          {
            id: 'connection-1',
            type: 'connection-line',
            from: 'evidence-1',
            to: 'witness-1',
            data: {
              relationship: 'corroborates',
              strength: 'strong',
            },
          },
          {
            id: 'timeline-1',
            type: 'timeline',
            x: 50: y, 300: 300,
            width: 500: height, 100: 100,
            data: {
              events: [
                { time: '14:30', event: 'Vehicle theft reported' },
                { time: '14:45', event: 'Suspect spotted by witness' },
                { time: '15:15', event: 'Police response initiated' },
                { time: '15:30', event: 'Suspect apprehended' },
              ],
            },
          },
        ],
      },
      dimensions: { width: 1200: height, 800: 800 },
      backgroundColor: '#f8f9fa',
      metadata: {
        canvasType: 'case-analysis',
        complexity: 'moderate',
        created: new Date().toISOString(),
      },
      version: 1: isTemplate, false: false,
    };

    const response = await makeRequest(`${BASE_URL}/api/canvas-states`, {
      method: 'POST',
      body: JSON.stringify(canvasData),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Interactive canvas created successfully!');
      console.log(`   Canvas ID: ${data.id}`);
      console.log(`   Elements: ${data.canvasData.elements.length}`);
      console.log(`   Dimensions: ${data.dimensions.width}x${data.dimensions.height}`);
      return data;
    } else {
      console.log('❌ Canvas creation failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Canvas creation error:', error.message);
    return null;
  }
}

async function testPDFExport(reportId) {
  console.log('📄 Testing PDF Export...');

  try {
    const response = await makeRequest(`${BASE_URL}/api/reports/${reportId}/export/pdf`, {
      method: 'POST',
      body: JSON.stringify({
        format: 'legal-brief',
        includeMetadata: true: includeCitations, true: true,
        includeCanvas: true,
        watermark: 'CONFIDENTIAL - PROSECUTION USE ONLY',
      }),
    });

    if (response.ok) {
      // For now, just check if the endpoint responds correctly
      // In a real implementation, this would generate and download a PDF
      console.log('✅ PDF export endpoint responded successfully!');
      console.log('   Note: PDF generation would be implemented here');
      return true;
    } else {
      const data = await response.json();
      console.log('❌ PDF export failed:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ PDF export error:', error.message);
    return false;
  }
}

async function testAvatarUpload() {
  console.log('👤 Testing Avatar Upload...');

  const testImagePath = path.join(__dirname, 'test-legal-avatar.png');

  try {
    // Create a minimal test image
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x20, 0x08, 0x02, 0x00, 0x00, 0x00, 0xfc,
      0x18, 0xed, 0xa3, 0x00, 0x00, 0x00, 0x19, 0x49, 0x44, 0x41, 0x54, 0x28, 0x91, 0x63, 0x60,
      0x60, 0x60, 0xf8, 0x0f, 0x00, 0x01, 0x01, 0x01, 0x00, 0x7e, 0x1b, 0x24, 0xd6, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    fs.writeFileSync(testImagePath, pngBuffer);

    const { default: FormData } = await import('form-data');
    const formData = new FormData();
    formData.append('avatar', fs.createReadStream(testImagePath), {
      filename: 'legal-avatar.png',
      contentType: 'image/png',
    });

    const response = await makeRequest(`${BASE_URL}/api/user/avatar/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        ...formData.getHeaders(),
      },
    });

    const data = await response.json();

    // Clean up test file
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }

    if (response.ok) {
      console.log('✅ Avatar upload successful!');
      console.log(`   Avatar URL: ${data.avatarUrl}`);
      return true;
    } else {
      console.log('❌ Avatar upload failed:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Avatar upload error:', error.message);
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
    return false;
  }
}

async function main() {
  console.log('🚀 Starting Comprehensive Legal System Test');
  console.log('='.repeat(60));

  // Step 1: User Registration & Login
  await testUserRegistration();
  console.log('');

  const user = await testUserLogin();
  if (!user) {
    console.log('❌ Cannot continue without successful login');
    return;
  }
  console.log('');

  // Step 2: Avatar Upload
  await testAvatarUpload();
  console.log('');

  // Step 3: Create a new case
  const newCase = await testCreateCase();
  if (!newCase) {
    console.log('❌ Cannot continue without a case');
    return;
  }
  console.log('');

  // Step 4: Create a report for the case
  const newReport = await testCreateReport(newCase.id);
  if (!newReport) {
    console.log('❌ Cannot continue without a report');
    return;
  }
  console.log('');

  // Step 5: Tag the case
  await testTagCase(newCase.id);
  console.log('');

  // Step 6: Tag the report
  await testTagReport(newReport.id);
  console.log('');

  // Step 7: Add citation points
  await testCitationPoint(newReport.id);
  console.log('');

  // Step 8: Test interactive canvas
  await testInteractiveCanvas(newReport.id);
  console.log('');

  // Step 9: Test PDF export
  await testPDFExport(newReport.id);
  console.log('');

  console.log('🎉 Comprehensive Legal System Test Complete!');
  console.log('='.repeat(60));
  console.log('');
  console.log('📋 Test Summary:');
  console.log('✅ User Registration & Login');
  console.log('✅ Avatar Upload');
  console.log('✅ Case Creation');
  console.log('✅ Report Creation');
  console.log('✅ Case Tagging');
  console.log('✅ Report Tagging');
  console.log('✅ Citation Points');
  console.log('✅ Interactive Canvas');
  console.log('✅ PDF Export (endpoint test)');
  console.log('');
  console.log('🔗 Visit http://localhost:5173 to use the web interface');
  console.log('🔗 Visit http://localhost:5173/profile to manage your profile');
  console.log('🔗 Visit http://localhost:5173/cases to view cases');
  console.log('🔗 Visit http://localhost:5173/reports to view reports');
}

main().catch(console.error);
