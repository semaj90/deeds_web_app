#!/usr/bin/env node
/**
 * Phase 90: Update Redis KAG with New Patterns
 *
 * Purpose: Add 3 new high-confidence patterns from web research to Redis KAG
 * Patterns: UnionType (95%), ForStatement (90%), TypeAliasDeclaration (90%)
 *
 * Prerequisites:
 * - Redis running at localhost:6379 (phase66-redis container)
 * - Existing KAG patterns in redis:phase90_kag_patterns
 *
 * Safety: Non-destructive - only adds new patterns, doesn't modify existing ones
 */

import Redis from 'ioredis';
import chalk from 'chalk';

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  retryStrategy: (times) => {
    if (times > 3) {
      console.error(chalk.red('❌ Failed to connect to Redis after 3 retries'));
      return null;
    }
    return Math.min(times * 100, 2000);
  }
});

// New patterns from Phase 90 web research
const NEW_PATTERNS = [
  {
    pattern: 'UnionType',
    astNodeType: 'UnionType',
    confidence: 0.95,
    rule: 'DO NOT insert comma near union type pipe (|) separator',
    context: 'Union type expressions with | operator',
    skipIndicators: [
      "Found '|' within 5 chars before/after error location",
      "Parent node is UnionType or TypeReference",
      "Line contains pattern: 'type X = A | B'"
    ],
    examples: {
      incorrect: [
        'type ID = number, | string;',
        'type ID = number |, string;',
        'type ID = number, string;'
      ],
      correct: [
        'type ID = number | string;',
        'type X = A | B | C;',
        'type X = { a: number, b: string } | Y;'
      ]
    },
    evidenceStrength: 'Very High',
    sources: [
      'TypeScript official docs',
      'Stack Overflow 474 questions',
      'Basarat GitBook'
    ],
    dateAdded: new Date().toISOString(),
    phase: 90,
    researchSource: 'web_search_priority_1'
  },
  {
    pattern: 'ForStatement',
    astNodeType: 'ForStatement',
    confidence: 0.90,
    rule: 'DO NOT insert comma in condition section of for loops (middle section). Commas only valid in initialization (first section) and afterthought (third section).',
    context: 'for statement with three semicolon-separated sections',
    skipIndicators: [
      'Comma found within initialization section (valid: let i = 0, j = 10)',
      'Comma found within afterthought section (valid: i++, j--)',
      'Parent node is ForStatement',
      'Line matches pattern: for (.*;.*;.*)'
    ],
    examples: {
      incorrect: [
        'for (let i = 0,; i < 10; i++)',     // Trailing comma in init
        'for (let i = 0; i < 10,; i++)',     // Comma in condition
        'for (let i = 0; i < 10; i++,)'      // Trailing comma in afterthought
      ],
      correct: [
        'for (let i = 0; i < 10; i++)',
        'for (let i = 0, j = 10; i < j; i++, j--)',
        'for (let i = 0, getI = () => i; i < 3; i++, getI = () => i)',
        'for (let {x, y} = point; x < 10; x++, y++)'
      ]
    },
    evidenceStrength: 'Very High',
    sources: [
      'MDN for statement reference',
      'Stack Overflow 824k views',
      'TypeScript Handbook'
    ],
    dateAdded: new Date().toISOString(),
    phase: 90,
    researchSource: 'web_search_priority_1'
  },
  {
    pattern: 'TypeAliasDeclaration',
    astNodeType: 'TypeAliasDeclaration',
    confidence: 0.90,
    rule: 'Commas ONLY valid in: (1) object type properties, (2) generic type parameters, (3) tuple elements. Commas NEVER valid for separating union types (use |) or intersection types (use &).',
    context: 'Type alias declarations using `type` keyword',
    skipIndicators: [
      "Found '|' or '&' within 5 chars of error location",
      'Parent node is TypeAliasDeclaration with UnionType or IntersectionType',
      "Line contains pattern: 'type X = A | B' or 'type X = A & B'",
      'Comma appears between union/intersection type members'
    ],
    examples: {
      incorrect: [
        'type ID = number, string;',              // Union needs |, not comma
        'type Staff = Person1, Person2;',         // Intersection needs &, not comma
        'type Point = { x: number,, y: number }', // Double comma in object
        'type Pair<T,, U> = ...'                  // Double comma in generic params
      ],
      correct: [
        'type ID = number | string;',
        'type Staff = Person1 & Person2;',
        'type Point = { x: number, y: number };',
        'type Point = { x: number; y: number };',
        'type Pair<T, U> = { first: T; second: U };',
        'type Tuple = [string, number];',
        'type Rest = [string, ...boolean[], number];'
      ]
    },
    evidenceStrength: 'Very High',
    sources: [
      'TypeScript Handbook - Everyday Types',
      'TypeScript Handbook - Object Types',
      'Stack Overflow 38 questions'
    ],
    dateAdded: new Date().toISOString(),
    phase: 90,
    researchSource: 'web_search_priority_1'
  }
];

async function main() {
  console.log(chalk.cyan('\n🔧 Phase 90: Update Redis KAG with New Patterns\n'));
  console.log(chalk.gray('═'.repeat(60)));

  try {
    // Test Redis connection
    console.log(chalk.yellow('\n1️⃣ Testing Redis connection...'));
    await redis.ping();
    console.log(chalk.green('   ✅ Connected to Redis at localhost:6379'));

    // Get existing patterns
    console.log(chalk.yellow('\n2️⃣ Fetching existing KAG patterns...'));
    const existingPatternsRaw = await redis.get('phase90_kag_patterns');
    const existingPatterns = existingPatternsRaw ? JSON.parse(existingPatternsRaw) : [];
    console.log(chalk.white(`   Found ${existingPatterns.length} existing patterns`));

    // List existing pattern names
    if (existingPatterns.length > 0) {
      console.log(chalk.gray('   Existing patterns:'));
      existingPatterns.forEach(p => {
        console.log(chalk.gray(`     - ${p.pattern} (${(p.confidence * 100).toFixed(0)}% confidence)`));
      });
    }

    // Check for duplicates
    console.log(chalk.yellow('\n3️⃣ Checking for duplicate patterns...'));
    const existingNames = new Set(existingPatterns.map(p => p.pattern));
    const newPatternsToAdd = NEW_PATTERNS.filter(p => !existingNames.has(p.pattern));
    const duplicates = NEW_PATTERNS.filter(p => existingNames.has(p.pattern));

    if (duplicates.length > 0) {
      console.log(chalk.yellow(`   ⚠️  Found ${duplicates.length} duplicate(s) - will skip:`));
      duplicates.forEach(p => {
        console.log(chalk.yellow(`     - ${p.pattern}`));
      });
    }

    if (newPatternsToAdd.length === 0) {
      console.log(chalk.green('\n✅ All patterns already exist in Redis - nothing to add'));
      await redis.quit();
      return;
    }

    // Add new patterns
    console.log(chalk.yellow(`\n4️⃣ Adding ${newPatternsToAdd.length} new pattern(s)...`));
    const updatedPatterns = [...existingPatterns, ...newPatternsToAdd];

    newPatternsToAdd.forEach(p => {
      console.log(chalk.green(`   ✅ ${p.pattern} (${(p.confidence * 100).toFixed(0)}% confidence)`));
      console.log(chalk.gray(`      Rule: ${p.rule.substring(0, 80)}...`));
      console.log(chalk.gray(`      Sources: ${p.sources.join(', ')}`));
    });

    // Save to Redis
    console.log(chalk.yellow('\n5️⃣ Saving updated patterns to Redis...'));
    await redis.set('phase90_kag_patterns', JSON.stringify(updatedPatterns, null, 2));
    console.log(chalk.green(`   ✅ Saved ${updatedPatterns.length} total patterns`));

    // Update metadata
    console.log(chalk.yellow('\n6️⃣ Updating Phase 90 metadata...'));
    const metadataRaw = await redis.get('phase90_metadata');
    const metadata = metadataRaw ? JSON.parse(metadataRaw) : {};

    metadata.lastPatternUpdate = new Date().toISOString();
    metadata.totalPatterns = updatedPatterns.length;
    metadata.patternsByConfidence = {
      high: updatedPatterns.filter(p => p.confidence >= 0.85).length,
      medium: updatedPatterns.filter(p => p.confidence >= 0.70 && p.confidence < 0.85).length,
      low: updatedPatterns.filter(p => p.confidence < 0.70).length
    };
    metadata.patternsAdded = {
      ...metadata.patternsAdded,
      phase90_web_research: newPatternsToAdd.map(p => p.pattern)
    };

    await redis.set('phase90_metadata', JSON.stringify(metadata, null, 2));
    console.log(chalk.green('   ✅ Metadata updated'));

    // Summary
    console.log(chalk.cyan('\n📊 Summary'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.white(`   Total patterns in Redis: ${updatedPatterns.length}`));
    console.log(chalk.white(`   High confidence (≥85%): ${metadata.patternsByConfidence.high}`));
    console.log(chalk.white(`   Medium confidence (70-84%): ${metadata.patternsByConfidence.medium}`));
    console.log(chalk.white(`   Low confidence (<70%): ${metadata.patternsByConfidence.low}`));
    console.log(chalk.white(`   Patterns added this run: ${newPatternsToAdd.length}`));

    console.log(chalk.green('\n✅ Redis KAG update complete!\n'));

  } catch (error) {
    console.error(chalk.red('\n❌ Error updating Redis KAG:'));
    console.error(chalk.red(error.message));
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n\n⚠️  Interrupted - cleaning up...'));
  await redis.quit();
  process.exit(0);
});

main().catch(console.error);
