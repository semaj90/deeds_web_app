#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5173';

// Simple cookie jar for session management
let sessionCookie = null;

async function makeRequest(url, options = {}) {
  const { default: fetch } = await import('node-fetch');

  // Add session cookie to headers if available
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
    sessionCookie = setCookie.split(';')[0]; // Extract just the cookie value
  }

  return response;
}

async function testRegistration() {
  try {
    console.log('Testing user registration...');

    const response = await makeRequest(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Avatar Test User',
        email: 'avatar.test@example.com',
        password: 'testpassword123',
        role: 'prosecutor',
      }),
    });

    const data = await response.json();
    console.log('Registration response:', data);

    if (response.ok) {
      console.log('✅ Registration successful!');
      return data.user;
    } else {
      console.log('❌ Registration failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    return null;
  }
}

async function testLogin() {
  try {
    console.log('Testing user login...');

    const response = await makeRequest(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({
        email: 'avatar.test@example.com',
        password: 'testpassword123',
      }),
    });

    const data = await response.json();
    console.log('Login response:', data);

    if (response.ok) {
      console.log('✅ Login successful!');
      console.log('Session cookie:', sessionCookie);
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

async function testProfileAPI() {
  try {
    console.log('Testing profile API...');

    const response = await makeRequest(`${BASE_URL}/api/user/profile`, {
      method: 'GET',
    });

    const data = await response.json();
    console.log('Profile response:', data);

    if (response.ok) {
      console.log('✅ Profile fetch successful!');
      return data.user;
    } else {
      console.log('❌ Profile fetch failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Profile fetch error:', error.message);
    return null;
  }
}

async function testAvatarUpload() {
  console.log('Testing avatar upload...');

  const testImagePath = path.join(__dirname, 'test-avatar.png');

  try {
    // Create a minimal test image
    const pngBuffer = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d, // IHDR chunk length
      0x49,
      0x48,
      0x44,
      0x52, // IHDR
      0x00,
      0x00,
      0x00,
      0x01, // width: 1
      0x00,
      0x00,
      0x00,
      0x01, // height: 1
      0x08,
      0x02,
      0x00,
      0x00,
      0x00, // bit depth, color type, compression, filter, interlace
      0x90,
      0x77,
      0x53,
      0xde, // CRC
      0x00,
      0x00,
      0x00,
      0x0c, // IDAT chunk length
      0x49,
      0x44,
      0x41,
      0x54, // IDAT
      0x08,
      0x99,
      0x01,
      0x01,
      0x00,
      0x00,
      0x00,
      0xff,
      0xff,
      0x00,
      0x00,
      0x00,
      0x02,
      0x00,
      0x01, // compressed data
      0xe2,
      0x21,
      0xbc,
      0x33, // CRC
      0x00,
      0x00,
      0x00,
      0x00, // IEND chunk length
      0x49,
      0x45,
      0x4e,
      0x44, // IEND
      0xae,
      0x42,
      0x60,
      0x82, // CRC
    ]);

    fs.writeFileSync(testImagePath, pngBuffer);

    // Use FormData for file upload
    const { default: FormData } = await import('form-data');
    const formData = new FormData();
    formData.append('avatar', fs.createReadStream(testImagePath), {
      filename: 'test-avatar.png',
      contentType: 'image/png',
    });

    const response = await makeRequest(`${BASE_URL}/api/user/avatar/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        ...formData.getHeaders(), // This will set the correct multipart/form-data header
        // Don't add Cookie here as makeRequest will handle it
      },
    });

    const data = await response.json();
    console.log('Avatar upload response:', data);

    // Clean up test file
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }

    if (response.ok) {
      console.log('✅ Avatar upload successful!');
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
  console.log('🚀 Starting Avatar System Test with Session Management\n');

  // Test registration
  const registeredUser = await testRegistration();
  console.log('');

  // Test login
  const loggedInUser = await testLogin();
  console.log('');

  if (!loggedInUser) {
    console.log('❌ Cannot continue without successful login');
    return;
  }

  // Test profile API (should work now with session)
  const profileUser = await testProfileAPI();
  console.log('');

  if (!profileUser) {
    console.log('❌ Profile API failed - authentication may not be working');
    return;
  }

  // Test avatar upload
  const avatarUpload = await testAvatarUpload();
  console.log('');

  console.log('🎉 Avatar system test complete!');
  console.log('');
  console.log('🔗 Visit http://localhost:5173/profile to test the avatar UI');
  console.log('🔗 Visit http://localhost:5173/register to register a new user');
  console.log('🔗 Visit http://localhost:5173/login to login');
}

main().catch(console.error);
