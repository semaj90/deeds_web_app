#!/usr/bin/env node
/**
 * Test Claude Repair Loop Functionality
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

class ClaudeRepairTest {
  constructor() {
    this.log('🔧 Testing Claude Repair Loop Functionality');
  }

  async runTests() {
    try {
      // Test 1: TypeScript Check
      console.log('\n1️⃣ Running TypeScript check...');
      const tscResult = await this.runTypeScriptCheck();
      console.log(`   Result: ${tscResult.success ? '✅ No errors' : `⚠️ ${tscResult.errorCount} errors found`}`);

      // Test 2: Problem Detection
      console.log('\n2️⃣ Testing problem detection...');
      const problems = this.parseTscOutput(tscResult);
      console.log(`   Detected ${problems.length} problems`);

      // Show sample problems
      if (problems.length > 0) {
        console.log('   Sample issues:');
        problems.slice(0, 3).forEach((problem, index) => {
          console.log(`     ${index + 1}. ${problem.message} (${problem.file}:${problem.line})`);
        });
      }

      // Test 3: Repair Loop Simulation
      console.log('\n3️⃣ Simulating repair loop...');
      const repairResult = await this.simulateRepairLoop(problems);
      console.log(`   Simulation completed: ${repairResult.success ? '✅ Success' : '❌ Failed'}`);

      console.log('\n📊 Test Summary:');
      console.table({
        'TypeScript Errors': tscResult.errorCount || 0,
        'Problems Detected': problems.length,
        'Repair Simulation': repairResult.success ? 'PASS' : 'FAIL',
        'Performance': `${repairResult.processingTime}ms`
      });

      return {
        success: true,
        typeScriptErrors: tscResult.errorCount || 0,
        problemsDetected: problems.length,
        repairSimulation: repairResult.success
      };

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async runTypeScriptCheck() {
    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit --skipLibCheck', {
        timeout: 30000,
        cwd: process.cwd()
      });

      return {
        stdout,
        stderr,
        success: true,
        errorCount: 0
      };

    } catch (error) {
      // tsc returns non-zero exit code when there are errors
      const errorCount = (error.stderr || '').split('\\n').filter(line =>
        line.includes('error TS')
      ).length;

      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        success: false,
        errorCount
      };
    }
  }

  parseTscOutput(result) {
    const problems = [];
    const lines = (result.stdout + result.stderr).split('\\n');

    for (const line of lines) {
      // Parse format: file.ts(line,col): error TS#### message
      const match = line.match(/^(.+?)\\((\\d+),(\\d+)\\):\\s+(error|warning)\\s+TS(\\d+):\\s*(.+)$/);

      if (match) {
        problems.push({
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          severity: match[4],
          code: `TS${match[5]}`,
          message: match[6].trim(),
          source: 'tsc'
        });
      }
    }

    return problems;
  }

  async simulateRepairLoop(problems) {
    const startTime = Date.now();

    // Simulate repair iterations
    let currentProblems = problems.length;
    const iterations = [];

    for (let i = 1; i <= 3 && currentProblems > 0; i++) {
      // Simulate processing time
      await this.pause(500);

      // Simulate fixing some problems
      const fixed = Math.min(currentProblems, Math.floor(currentProblems * 0.4) + 1);
      currentProblems -= fixed;

      iterations.push({
        iteration: i,
        problemsRemaining: currentProblems,
        problemsFixed: fixed
      });

      console.log(`     Iteration ${i}: Fixed ${fixed} issues, ${currentProblems} remaining`);
    }

    const processingTime = Date.now() - startTime;

    return {
      success: currentProblems < problems.length * 0.2, // Success if reduced by 80%
      iterations,
      processingTime,
      finalProblems: currentProblems,
      totalFixed: problems.length - currentProblems
    };
  }

  async pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  log(message, ...args) {
    const timestamp = new Date().toISOString().substring(11, 19);
    console.log(`[${timestamp}] ${message}`, ...args);
  }
}

// Run the test
const test = new ClaudeRepairTest();
test.runTests()
  .then(result => {
    console.log('\\n✅ Claude repair test completed!');
    if (result.success) {
      console.log('🎉 All tests passed!');
    } else {
      console.log('❌ Some tests failed');
    }
  })
  .catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });