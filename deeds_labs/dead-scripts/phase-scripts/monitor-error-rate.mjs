#!/usr/bin/env node

/**
 * Error Rate Monitoring Script
 * Tracks error trends over time and detects anomalies
 */

import fs from 'fs';
import path from 'path';

const HISTORY_FILE = 'logs/error-rate-history.json';
const SNAPSHOT_INTERVAL_HOURS = 1;
const MAX_HISTORY_DAYS = 30;

/**
 * Load error history
 */
function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }

  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load history:', err.message);
    return [];
  }
}

/**
 * Save error history
 */
function saveHistory(history) {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * Create snapshot from current error reports
 */
function createSnapshot() {
  const snapshot = {
    timestamp: new Date().toISOString(),
    typescript: { total: 0, errors: 0, warnings: 0 },
    cpp: { total: 0, errors: 0, warnings: 0, byCategory: {} },
    total: 0
  };

  // Load TypeScript errors
  const tsPath = 'logs/svelte-errors.json';
  if (fs.existsSync(tsPath)) {
    try {
      const tsData = JSON.parse(fs.readFileSync(tsPath, 'utf-8'));
      const errors = Array.isArray(tsData) ? tsData : (tsData.errors || []);

      snapshot.typescript.total = errors.length;
      snapshot.typescript.errors = errors.filter(e => e.category === 1 || e.severity === 'error').length;
      snapshot.typescript.warnings = errors.filter(e => e.category === 0 || e.severity === 'warning').length;
    } catch (err) {
      console.warn('Failed to parse TypeScript errors:', err.message);
    }
  }

  // Load C++ errors
  const cppPath = 'logs/cpp-errors-analysis.json';
  if (fs.existsSync(cppPath)) {
    try {
      const cppData = JSON.parse(fs.readFileSync(cppPath, 'utf-8'));

      snapshot.cpp.total = cppData.summary?.total || 0;
      snapshot.cpp.errors = cppData.summary?.bySeverity?.error || 0;
      snapshot.cpp.warnings = cppData.summary?.bySeverity?.warning || 0;
      snapshot.cpp.byCategory = cppData.summary?.byCategory || {};
    } catch (err) {
      console.warn('Failed to parse C++ errors:', err.message);
    }
  }

  snapshot.total = snapshot.typescript.total + snapshot.cpp.total;

  return snapshot;
}

/**
 * Clean old history entries
 */
function cleanOldHistory(history) {
  const cutoff = Date.now() - (MAX_HISTORY_DAYS * 24 * 60 * 60 * 1000);
  return history.filter(entry => new Date(entry.timestamp).getTime() >= cutoff);
}

/**
 * Calculate error rate change
 */
function calculateTrends(history) {
  if (history.length < 2) {
    return { trend: 'stable', change: 0, rate: 0 };
  }

  const latest = history[history.length - 1];
  const previous = history[history.length - 2];

  const change = latest.total - previous.total;
  const rate = previous.total > 0 ? (change / previous.total) * 100 : 0;

  let trend = 'stable';
  if (Math.abs(rate) < 5) trend = 'stable';
  else if (rate > 0) trend = 'increasing';
  else trend = 'decreasing';

  return { trend, change, rate: Math.abs(rate) };
}

/**
 * Detect anomalies using simple statistics
 */
function detectAnomalies(history) {
  if (history.length < 10) return [];

  const totals = history.map(h => h.total);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const variance = totals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / totals.length;
  const stdDev = Math.sqrt(variance);

  const anomalies = [];
  const latest = history[history.length - 1];

  // Check if latest is > 2 standard deviations from mean
  if (Math.abs(latest.total - mean) > 2 * stdDev) {
    anomalies.push({
      type: 'statistical',
      severity: 'warning',
      message: `Error count (${latest.total}) is ${((latest.total - mean) / stdDev).toFixed(1)} standard deviations from mean (${mean.toFixed(0)})`,
      value: latest.total,
      mean,
      stdDev
    });
  }

  // Check for sudden spikes (>50% increase)
  if (history.length >= 2) {
    const prev = history[history.length - 2];
    const increase = ((latest.total - prev.total) / prev.total) * 100;

    if (increase > 50) {
      anomalies.push({
        type: 'spike',
        severity: 'critical',
        message: `Sudden error spike detected: ${increase.toFixed(1)}% increase from previous snapshot`,
        value: latest.total,
        previous: prev.total,
        increase
      });
    }
  }

  return anomalies;
}

/**
 * Generate report
 */
function generateReport(snapshot, history, trends, anomalies) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Error Rate Monitoring Report');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Timestamp: ${snapshot.timestamp}\n`);

  console.log('Current Error Count:');
  console.log(`  Total: ${snapshot.total}`);
  console.log(`  - TypeScript: ${snapshot.typescript.total} (${snapshot.typescript.errors} errors, ${snapshot.typescript.warnings} warnings)`);
  console.log(`  - C++: ${snapshot.cpp.total} (${snapshot.cpp.errors} errors, ${snapshot.cpp.warnings} warnings)\n`);

  if (history.length >= 2) {
    console.log('Trend Analysis:');
    console.log(`  Trend: ${trends.trend.toUpperCase()}`);
    console.log(`  Change: ${trends.change > 0 ? '+' : ''}${trends.change} errors (${trends.rate.toFixed(1)}%)\n`);
  }

  if (Object.keys(snapshot.cpp.byCategory).length > 0) {
    console.log('C++ Errors by Category:');
    Object.entries(snapshot.cpp.byCategory)
      .sort(([, a], [, b]) => b - a)
      .forEach(([cat, count]) => {
        console.log(`  - ${cat}: ${count}`);
      });
    console.log('');
  }

  if (anomalies.length > 0) {
    console.log('🚨 ANOMALIES DETECTED:');
    anomalies.forEach(anomaly => {
      console.log(`  [${anomaly.severity.toUpperCase()}] ${anomaly.message}`);
    });
    console.log('');
  }

  console.log(`History snapshots: ${history.length} (last ${MAX_HISTORY_DAYS} days)`);
  console.log(`Next snapshot: ${new Date(Date.now() + SNAPSHOT_INTERVAL_HOURS * 60 * 60 * 1000).toLocaleString()}\n`);

  if (history.length >= 7) {
    console.log('Last 7 Snapshots:');
    history.slice(-7).forEach(h => {
      const date = new Date(h.timestamp).toLocaleString();
      console.log(`  ${date}: ${h.total} errors (TS: ${h.typescript.total}, C++: ${h.cpp.total})`);
    });
    console.log('');
  }
}

/**
 * Main monitoring function
 */
function monitorErrorRate() {
  console.log('📊 Creating error rate snapshot...\n');

  const snapshot = createSnapshot();
  let history = loadHistory();

  // Clean old entries
  history = cleanOldHistory(history);

  // Add new snapshot
  history.push(snapshot);

  // Calculate trends
  const trends = calculateTrends(history);

  // Detect anomalies
  const anomalies = detectAnomalies(history);

  // Save updated history
  saveHistory(history);

  // Generate report
  generateReport(snapshot, history, trends, anomalies);

  // Export summary for CI/CD
  const summary = {
    snapshot,
    trends,
    anomalies,
    history: history.slice(-7) // Last 7 snapshots
  };

  fs.writeFileSync('logs/error-rate-summary.json', JSON.stringify(summary, null, 2));
  console.log('📁 Summary exported to: logs/error-rate-summary.json\n');

  // Exit with warning if anomalies detected
  if (anomalies.some(a => a.severity === 'critical')) {
    console.log('❌ Critical anomalies detected!');
    process.exit(1);
  } else if (anomalies.length > 0) {
    console.log('⚠️  Warnings detected');
    process.exit(0);
  } else {
    console.log('✅ No anomalies detected');
    process.exit(0);
  }
}

// Run monitoring
monitorErrorRate();
