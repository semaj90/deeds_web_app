#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';

const execAsync = promisify(exec);

// Configuration
const APP_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:5173/api';

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'TestPassword123!',
  firstName: 'Test',
  lastName: 'User',
  name: 'Test User',
};

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testUserRegistration() {
  try {
    console.log('🧪 Testing user registration...');

    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testUser),
    });

    const data = await response.json();
    console.log('📝 Registration response:', response.status, data);

    if (response.ok) {
      console.log('✅ User registration successful');
      return true;
    } else {
      console.log('❌ User registration failed:', data.error || data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    return false;
  }
}

async function testUserLogin() {
  try {
    console.log('🔐 Testing user login...');

    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password,
      }),
    });

    const data = await response.json();
    console.log('🔑 Login response:', response.status, data);

    if (response.ok) {
      console.log('✅ User login successful');
      return { success: true, session: data };
    } else {
      console.log('❌ User login failed:', data.error || data.message);
      return { success: false };
    }
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return { success: false };
  }
}

async function testOllamaIntegration() {
  try {
    console.log('🤖 Testing Ollama integration...');

    const response = await fetch(`${API_URL}/ai/health/local`);
    const data = await response.json();

    console.log('🔧 Ollama health check:', response.status, data);

    if (response.ok) {
      console.log('✅ Ollama integration working');
      return true;
    } else {
      console.log('⚠️ Ollama integration issues:', data.error || data.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Ollama integration error:', error.message);
    return false;
  }
}

async function testInteractiveCanvas() {
  try {
    console.log('🎨 Testing interactive canvas...');

    const response = await fetch(`${APP_URL}/interactive-canvas`);

    if (response.ok) {
      console.log('✅ Interactive canvas page loads');
      return true;
    } else {
      console.log('❌ Interactive canvas page failed to load');
      return false;
    }
  } catch (error) {
    console.error('❌ Interactive canvas error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting comprehensive web app tests...\n');

  // Wait for server to be ready
  console.log('⏱️ Waiting for server to be ready...');
  await wait(3000);

  const results = {
    registration: await testUserRegistration(),
    login: await testUserLogin(),
    ollama: await testOllamaIntegration(),
    canvas: await testInteractiveCanvas(),
  };

  console.log('\n📊 Test Results Summary:');
  console.log('=========================');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSED' : 'FAILED'}`);
  });

  const allPassed = Object.values(results).every((r) => r);
  console.log(
    `\n${allPassed ? '🎉' : '⚠️'} Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`
  );

  return allPassed;
}

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests()
    .then((success) => process.exit(success ? 0 : 1))
    .catch((error) => {
      console.error('💥 Test runner error:', error);
      process.exit(1);
    });
}

export {
  runTests,
  testUserRegistration,
  testUserLogin,
  testOllamaIntegration,
  testInteractiveCanvas,
};
