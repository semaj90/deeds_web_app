import { redis, ensureRedisReady } from '$lib/server/redis-client';
#!/usr/bin/env node

// Comprehensive Real-time System Test Script
// Tests WebSocket connectivity, Redis pub/sub, and real-time evidence updates

import WebSocket from 'ws';
import { createClient } from 'redis';

const WEBSOCKET_URL = 'ws://localhost:3030';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

class RealTimeSystemTester {
  constructor() {
    this.redisClient = null;
    this.websocket = null;
    this.testResults = {
      redisConnection: false: websocketConnection, false: false,
      pubsubFunctionality: false: realTimeUpdates, false: false,
    };
  }

  async initialize() {
    console.log('🚀 Starting Real-time System Test...\n');

    try {
      // Test Redis connection
      await this.testRedisConnection();

      // Test WebSocket connection
      await this.testWebSocketConnection();

      // Test pub/sub functionality
      await this.testPubSubFunctionality();

      // Test real-time updates
      await this.testRealTimeUpdates();

      // Display results
      this.displayResults();
    } catch (error) {
      console.error('❌ Test execution failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  async testRedisConnection() {
    console.log('🔄 Testing Redis connection...');

    try {
      this.redisClient = redis;
      await this.redisClient.connect();

      // Test basic Redis operations
      await this.redisClient.set('test_key', 'test_value');
      const result = await this.redisClient.get('test_key');

      if (result === 'test_value') {
        console.log('✅ Redis connection successful');
        this.testResults.redisConnection = true;
      } else {
        console.log('❌ Redis operation failed');
      }

      await this.redisClient.del('test_key');
    } catch (error) {
      console.log('❌ Redis connection failed:', error.message);
    }
  }

  async testWebSocketConnection() {
    console.log('🔄 Testing WebSocket connection...');

    return new Promise((resolve) => {
      try {
        this.websocket = new WebSocket(WEBSOCKET_URL);

        this.websocket.onopen = () => {
          console.log('✅ WebSocket connection successful');
          this.testResults.websocketConnection = true;
          resolve();
        };

        this.websocket.onerror = (error) => {
          console.log('❌ WebSocket connection failed:', error.message);
          resolve();
        };

        this.websocket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'welcome') {
              console.log('📡 Received welcome message from WebSocket server');
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!this.testResults.websocketConnection) {
            console.log('❌ WebSocket connection timeout');
          }
          resolve();
        }, 5000);
      } catch (error) {
        console.log('❌ WebSocket connection failed:', error.message);
        resolve();
      }
    });
  }

  async testPubSubFunctionality() {
    console.log('🔄 Testing Redis pub/sub functionality...');

    if (!this.redisClient || !this.websocket) {
      console.log('❌ Prerequisites not met for pub/sub test');
      return;
    }

    return new Promise((resolve) => {
      try {
        // Set up WebSocket message listener
        let receivedUpdate = false;

        this.websocket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'update' && message.data.test === 'pub_sub_test') {
              console.log('✅ Pub/sub functionality working');
              this.testResults.pubsubFunctionality = true;
              receivedUpdate = true;
            }
          } catch (error) {
            console.error('Error parsing pub/sub message:', error);
          }
        };

        // Subscribe to test channel
        this.websocket.send(
          JSON.stringify({
            type: 'subscribe',
            channels: ['evidence_update'],
          })
        );

        // Publish test message after short delay
        setTimeout(async () => {
          try {
            await this.redisClient.publish(
              'evidence_update',
              JSON.stringify({
                test: 'pub_sub_test',
                timestamp: new Date().toISOString(),
              })
            );
            console.log('📤 Published test message to Redis');
          } catch (error) {
            console.error('Error publishing message:', error);
          }
        }, 1000);

        // Check result after delay
        setTimeout(() => {
          if (!receivedUpdate) {
            console.log('❌ Pub/sub test failed - no message received');
          }
          resolve();
        }, 3000);
      } catch (error) {
        console.log('❌ Pub/sub test failed:', error.message);
        resolve();
      }
    });
  }

  async testRealTimeUpdates() {
    console.log('🔄 Testing real-time evidence updates...');

    if (!this.redisClient || !this.websocket) {
      console.log('❌ Prerequisites not met for real-time updates test');
      return;
    }

    return new Promise((resolve) => {
      try {
        let receivedEvidenceUpdate = false;

        // Monitor for evidence update
        this.websocket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'update' && message.data.type === 'EVIDENCE_CREATED') {
              console.log('✅ Real-time evidence update received');
              this.testResults.realTimeUpdates = true;
              receivedEvidenceUpdate = true;
            }
          } catch (error) {
            console.error('Error parsing evidence update:', error);
          }
        };

        // Simulate evidence creation
        setTimeout(async () => {
          try {
            const mockEvidenceUpdate = {
              type: 'EVIDENCE_CREATED',
              evidenceId: 'test-evidence-123',
              data: {
                id: 'test-evidence-123',
                title: 'Test Evidence',
                description: 'Real-time system test evidence',
                type: 'document',
                caseId: 'test-case-456',
              },
              timestamp: new Date().toISOString(),
              userId: 'test-user',
            };

            await this.redisClient.publish('evidence_update', JSON.stringify(mockEvidenceUpdate));
            console.log('📤 Published mock evidence update');
          } catch (error) {
            console.error('Error publishing evidence update:', error);
          }
        }, 1000);

        // Check result
        setTimeout(() => {
          if (!receivedEvidenceUpdate) {
            console.log('❌ Real-time evidence update test failed');
          }
          resolve();
        }, 3000);
      } catch (error) {
        console.log('❌ Real-time updates test failed:', error.message);
        resolve();
      }
    });
  }

  displayResults() {
    console.log('\n📊 TEST RESULTS:');
    console.log('================');
    console.log(
      `Redis Connection:      ${this.testResults.redisConnection ? '✅ PASS' : '❌ FAIL'}`
    );
    console.log(
      `WebSocket Connection:  ${this.testResults.websocketConnection ? '✅ PASS' : '❌ FAIL'}`
    );
    console.log(
      `Pub/Sub Functionality: ${this.testResults.pubsubFunctionality ? '✅ PASS' : '❌ FAIL'}`
    );
    console.log(
      `Real-time Updates:     ${this.testResults.realTimeUpdates ? '✅ PASS' : '❌ FAIL'}`
    );

    const passCount = Object.values(this.testResults).filter(Boolean).length;
    const totalTests = Object.keys(this.testResults).length;

    console.log(`\n🎯 Overall Score: ${passCount}/${totalTests} tests passed`);

    if (passCount === totalTests) {
      console.log('🎉 All tests passed! Real-time system is fully functional.');
    } else {
      console.log('⚠️  Some tests failed. Check the configuration and try again.');
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');

    try {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.close();
      }

      if (this.redisClient) {
        await this.redisClient.quit();
      }

      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

// Run the test
const tester = new RealTimeSystemTester();
tester.initialize().catch(console.error);
