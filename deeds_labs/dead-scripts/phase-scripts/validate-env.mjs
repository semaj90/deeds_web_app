#!/usr/bin/env node

/**
 * Phase 79: Environment Validation Script
 *
 * Validates environment configuration before running any pipeline stage.
 * Prevents "works on my machine" failures and catches missing secrets at startup.
 *
 * Usage:
 *   node scripts/validate-env.mjs
 *   npm run validate:env (add to package.json scripts)
 */

import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { env } from '../src/lib/env.server.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

console.log('🔍 Phase 79: Environment Validation\n');

// Check .env file exists
const envPath = join(ROOT, '.env');
if (!existsSync(envPath)) {
	console.error('❌ .env file not found!');
	console.error('   Expected location:', envPath);
	console.error('\n💡 Create .env from template:\n');
	console.error('   cp .env.example .env');
	process.exit(1);
}

console.log('✅ .env file found');

// Validate critical URLs are reachable (optional - can be slow)
const VALIDATE_CONNECTIVITY = process.argv.includes('--check-connectivity');

try {
	// Attempt to parse environment (will throw if validation fails)
	console.log('✅ Environment variables validated');
	console.log('\n📊 Configuration Summary:\n');

	// Display sanitized config (no secrets)
	console.log(`   Database:      ${new URL(env.DATABASE_URL).host}`);
	console.log(`   Redis:         ${env.REDIS_URL.split('@')[1] || 'localhost:6379'}`);
	console.log(`   Ollama:        ${new URL(env.OLLAMA_URL).host}`);
	console.log(`   Qdrant:        ${new URL(env.QDRANT_URL).host}`);
	console.log(`   MinIO:         ${env.MINIO_ENDPOINT || 'default'}`);
	console.log(`   Auth Cookie:   ${env.AUTH_COOKIE_NAME}`);

	if (env.CUDA_SERVICE_URL) {
		console.log(`   CUDA Service:  ${new URL(env.CUDA_SERVICE_URL).host}`);
	}

	if (env.TENSORRT_SERVICE_URL) {
		console.log(`   TensorRT:      ${new URL(env.TENSORRT_SERVICE_URL).host}`);
	}

	// Check for optional API keys
	const apiKeys = [];
	if (env.OPENAI_API_KEY) apiKeys.push('OpenAI');
	if (env.ANTHROPIC_API_KEY) apiKeys.push('Anthropic');
	if (env.DEEPSEEK_API_KEY) apiKeys.push('DeepSeek');

	if (apiKeys.length > 0) {
		console.log(`\n   API Keys:      ${apiKeys.join(', ')}`);
	}

	// Security checks
	console.log('\n🔒 Security Validation:\n');

	if (env.JWT_SECRET.length < 32) {
		console.warn('⚠️  JWT_SECRET is too short (< 32 chars)');
	} else {
		console.log('✅ JWT_SECRET length OK');
	}

	if (env.SESSION_SECRET.length < 32) {
		console.warn('⚠️  SESSION_SECRET is too short (< 32 chars)');
	} else {
		console.log('✅ SESSION_SECRET length OK');
	}

	// Check for common mistakes
	if (env.DATABASE_URL.includes('localhost') && process.env.NODE_ENV === 'production') {
		console.warn('⚠️  DATABASE_URL points to localhost in production');
	}

	if (env.JWT_SECRET === 'dev-secret' && process.env.NODE_ENV === 'production') {
		console.error('❌ Using default JWT_SECRET in production!');
		process.exit(1);
	}

	console.log('\n✅ Environment validation passed!');
	console.log('\n💡 Ready for Phase 79 pipeline execution');

	if (VALIDATE_CONNECTIVITY) {
		console.log('\n🌐 Connectivity checks enabled (this may take a moment)...');
		// TODO: Add actual connectivity checks using fetch/ping
		console.log('   (Connectivity validation not yet implemented)');
	}

} catch (error) {
	console.error('\n❌ Environment validation failed!\n');

	if (error instanceof Error) {
		console.error('Error:', error.message);

		// Parse Zod validation errors for better output
		if (error.message.includes('ZodError')) {
			console.error('\n📋 Missing or invalid environment variables:');
			// Zod errors are detailed in error.issues
		}
	}

	console.error('\n💡 Fix suggestions:');
	console.error('   1. Check .env file has all required variables');
	console.error('   2. Verify URL formats (must start with http:// or https://)');
	console.error('   3. Ensure secrets are at least 32 characters');
	console.error('   4. See src/lib/env.server.ts for full schema');

	process.exit(1);
}
