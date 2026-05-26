import fs from 'fs';
import path from 'path';

const rootDir = process.cwd().replace(/\\/g, '/');
const indexJsonPath = path.join(rootDir, 'docs', 'documents-atlas-index.json');

// Stop words to exclude during search tokenization
const stopWords = new Set([
  'the', 'and', 'a', 'to', 'of', 'in', 'is', 'it', 'that', 'for', 'on', 'with', 'as', 'this', 'are', 'by', 'an', 'be', 'at', 'or', 'from', 'was', 'but', 'not', 'your', 'you', 'we', 'our', 'will', 'can', 'has', 'have', 'been', 'about', 'how', 'out', 'all', 'any', 'into', 'only', 'than', 'them', 'then', 'there', 'their', 'they', 'who', 'what', 'which', 'when', 'where', 'why', 'here', 'its', 'these', 'those', 'also', 'more', 'some', 'would', 'should', 'could', 'other', 'over', 'such'
]);

function runSearch(queryStr, filters = {}) {
  if (!fs.existsSync(indexJsonPath)) {
    console.error(`Index file not found at ${indexJsonPath}. Please run the build script first.`);
    process.exit(1);
  }

  const indexData = JSON.parse(fs.readFileSync(indexJsonPath, 'utf-8'));
  const { documents, invertedIndex } = indexData;

  console.log(`\n==================================================`);
  console.log(`🔍 Query: "${queryStr}"`);
  console.log(`📁 Loaded index: ${indexData.totalDocuments} documents, generated at ${indexData.generatedAt}`);
  console.log(`==================================================`);

  // Tokenize query
  const queryTokens = (queryStr.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(t => t.length >= 2 && !stopWords.has(t));

  if (queryTokens.length === 0) {
    console.log("No search terms found in query (only stop words or too short).");
    return;
  }

  console.log(`Tokens parsed: ${queryTokens.map(t => `'${t}'`).join(', ')}`);

  // Match and Score
  const docScores = Object.create(null);

  for (const token of queryTokens) {
    // Exact token match
    let matches = invertedIndex[token] || [];
    
    // Prefix / substring match fallback for query tokens
    if (matches.length === 0) {
      const matchingKeys = Object.keys(invertedIndex).filter(key => key.includes(token));
      const tempMatches = new Set();
      for (const key of matchingKeys) {
        for (const docPath of invertedIndex[key]) {
          tempMatches.add(docPath);
        }
      }
      matches = Array.from(tempMatches);
    }

    for (const docPath of matches) {
      const doc = documents[docPath];
      if (!doc) continue;

      // Check filters if any
      if (filters.category && doc.category !== filters.category) continue;
      if (filters.language && !doc.languages.includes(filters.language.toLowerCase())) continue;
      if (filters.rgGroup && !doc.rgGroups.includes(filters.rgGroup.toLowerCase())) continue;

      if (!docScores[docPath]) {
        docScores[docPath] = {
          doc,
          score: 0,
          matches: new Set()
        };
      }

      docScores[docPath].matches.add(token);

      // Scoring weights
      let weight = 0.5; // general body match

      const titleLower = doc.title.toLowerCase();
      if (titleLower.includes(token)) {
        weight += 2.0; // matched in title
      }

      if (doc.tags.map(t => t.toLowerCase()).includes(token)) {
        weight += 1.5; // matched in tags
      }

      if (doc.headings.some(h => h.text.toLowerCase().includes(token))) {
        weight += 1.0; // matched in headings
      }

      docScores[docPath].score += weight;
    }
  }

  // Sort and display top matches
  const sortedMatches = Object.values(docScores)
    .sort((a, b) => b.score - a.score || b.doc.size - a.doc.size)
    .slice(0, 5);

  if (sortedMatches.length === 0) {
    console.log("❌ No matching documents found.");
    return;
  }

  console.log(`\nFound ${Object.keys(docScores).length} matching documents. Top 5 results:\n`);

  sortedMatches.forEach((result, idx) => {
    const { doc, score, matches } = result;
    const sizeKB = (doc.size / 1024).toFixed(2);
    
    console.log(`${idx + 1}. [Score: ${score.toFixed(2)}] Title: "${doc.title}"`);
    console.log(`   Path: ${doc.relativePath}`);
    console.log(`   SourceRef: ${doc.fileUrl}`);
    console.log(`   Category: ${doc.category} | Size: ${sizeKB} KB | Lines: ${doc.lines}`);
    if (doc.languages.length > 0) {
      console.log(`   Languages: ${doc.languages.join(', ')}`);
    }
    if (doc.rgGroups.length > 0) {
      console.log(`   Search Groups (rg): ${doc.rgGroups.join(', ')}`);
    }
    if (doc.tags.length > 0) {
      console.log(`   Tags: ${doc.tags.join(', ')}`);
    }
    if (doc.astRelations.referencedFiles.length > 0 || doc.astRelations.referencedSymbols.length > 0) {
      console.log(`   AST Relations:`);
      if (doc.astRelations.referencedFiles.length > 0) {
        console.log(`     - Referenced files: ${doc.astRelations.referencedFiles.join(', ')}`);
      }
      if (doc.astRelations.referencedSymbols.length > 0) {
        console.log(`     - Referenced symbols: ${doc.astRelations.referencedSymbols.join(', ')}`);
      }
    }
    console.log(`   Summary: ${doc.summary}`);
    console.log(`   Query terms matched: ${Array.from(matches).join(', ')}`);
    console.log(`--------------------------------------------------`);
  });
}

// Get query from command line args or use defaults
const args = process.argv.slice(2);
if (args.length > 0) {
  const queryStr = args.join(' ');
  
  // Basic filter parser from args, e.g. --category=todo-list
  const filters = {};
  const cleanArgs = [];
  
  args.forEach(arg => {
    if (arg.startsWith('--category=')) {
      filters.category = arg.split('=')[1];
    } else if (arg.startsWith('--language=')) {
      filters.language = arg.split('=')[1];
    } else if (arg.startsWith('--rgGroup=')) {
      filters.rgGroup = arg.split('=')[1];
    } else {
      cleanArgs.push(arg);
    }
  });

  runSearch(cleanArgs.join(' '), filters);
} else {
  // Run default test queries
  console.log("No query argument provided. Running suite of default verification searches...");
  runSearch("cuda graph autoencoder");
  runSearch("drizzle schema postgres");
  runSearch("semantic cache redis");
  runSearch("svelte runes forms");
}
