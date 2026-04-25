#!/usr/bin/env node

// Simple test script to verify file upload endpoints
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testFileUpload() {
  console.log('Testing file upload endpoints...');

  // Create a test file
  const testFilePath = path.join(__dirname, 'test-file.txt');
  fs.writeFileSync(testFilePath, 'This is a test file for upload');

  try {
    // Test 1: Basic file upload
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath));
    formData.append('caseId', 'test-case-123');
    formData.append('title', 'Test Upload');
    formData.append('description', 'Testing file upload functionality');

    const response = await fetch('http://localhost:5173/api/upload', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    console.log('Upload test result:', result);

    if (response.ok) {
      console.log('✅ File upload test passed');
    } else {
      console.log('❌ File upload test failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  } finally {
    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

// Run the test
testFileUpload();
