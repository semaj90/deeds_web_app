# 🤖 GitHub Copilot Regex Prompt Templates

## Effective Copilot Prompting for Regular Expressions

### Template 1: Specific Pattern Matching

```javascript
// Create a regex to extract legal case numbers in format:
// Should match: "2024-CV-12345", "2023-CR-99999", "2022-FAM-00001"
// Should NOT match: "24-CV-123", "2024-cv-12345", "2024-CV-123456"
// Pattern: YYYY-TYPE-NNNNN (4 digits, dash, 2-3 uppercase letters, dash, 5 digits)
const caseNumberRegex = /^(\d{4})-(CV|CR|FAM|PROB)-(\d{5})$/;

// Test cases:
const validCases = ["2024-CV-12345", "2023-CR-99999", "2022-FAM-00001"];
const invalidCases = ["24-CV-123", "2024-cv-12345", "2024-CV-123456"];
```

### Template 2: Complex Legal Document Parsing

```javascript
// Extract witness testimony blocks from legal transcripts
// Format: "Q: [question text]" followed by "A: [answer text]"
// Should handle multi-line answers and special characters
// Should match:
//   Q: What time did you arrive?
//   A: I arrived at approximately 3:30 PM on December 15th.
//
//   Q: Did you see the defendant?
//   A: Yes, I saw him clearly under the streetlight.
//
// Should NOT match incomplete Q/A pairs or malformed entries
const testimonyRegex = /Q:\s*(.+?)\s*A:\s*(.+?)(?=\s*Q:|$)/gs;
```

### Template 3: Data Validation with Context

```javascript
// Validate legal document metadata JSON structure
// Must contain: id, caseNumber, documentType, timestamp
// Optional: tags[], confidence (0-1), priority (1-5)
// Should match valid JSON with required fields
// Should reject: missing required fields, invalid data types, malformed JSON

function validateLegalMetadata(jsonString) {
  // Copilot: write regex to validate this JSON structure before parsing
  const metadataRegex =
    /^{\s*"id"\s*:\s*"[^"]+"\s*,\s*"caseNumber"\s*:\s*"[^"]+"\s*,\s*"documentType"\s*:\s*"[^"]+"\s*,\s*"timestamp"\s*:\s*\d+.*}$/s;

  return metadataRegex.test(jsonString.trim());
}
```

## 🎯 Copilot Prompting Best Practices

### 1. Be Extremely Specific

❌ **Poor**: "Create regex for emails"
✅ **Good**: "Create regex for corporate legal department emails ending in @lawfirm.com, @prosecutor.gov, or @court.state.us, must have 3-50 characters before @"

### 2. Provide Multiple Examples

```javascript
// Extract legal citation patterns from text
// Should match: "Brown v. Board, 347 U.S. 483 (1954)"
// Should match: "Miranda v. Arizona, 384 U.S. 436 (1966)"
// Should match: "Roe v. Wade, 410 U.S. 113 (1973)"
// Should NOT match: "Brown vs Board" (incomplete)
// Should NOT match: "347 U.S. 483" (missing case name)
const legalCitationRegex =
  /([A-Z][a-zA-Z\s.]+)\s+v\.\s+([A-Z][a-zA-Z\s.]+),\s+(\d+)\s+U\.S\.\s+(\d+)\s+\((\d{4})\)/g;
```

### 3. Specify Edge Cases and Constraints

```javascript
// Extract dollar amounts from legal documents
// Should match: "$1,234.56", "$999", "$1,000,000.00"
// Should match: "USD $50.00", "$ 25.99" (with spaces)
// Should NOT match: "$" (no amount), "$1,23.45" (invalid comma placement)
// Should NOT match: "$-100" (negative amounts not expected in this context)
// Must handle optional currency symbols and formatting variations
const dollarAmountRegex = /(?:USD\s*)?\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
```

### 4. Context-Aware Prompting

```javascript
// For legal AI system: Extract entity names from contracts
// Context: Processing merger and acquisition documents
// Entities are typically: "Company Name LLC", "Corporation Inc", "Partners LLP"
// Should capture: business entity suffixes (LLC, Inc, Corp, LLP, LP, etc.)
// Should handle: "Apple Inc.", "Microsoft Corporation", "Google LLC"
// Should ignore: personal names, addresses, generic terms
const businessEntityRegex =
  /\b([A-Z][a-zA-Z\s&.,-]+(?:LLC|Inc\.?|Corporation|Corp\.?|LLP|LP|Co\.?))\b/g;
```

### 5. Performance Considerations

```javascript
// High-performance regex for processing large legal documents
// Need to extract all dates in MM/DD/YYYY format from 1000+ page documents
// Must be optimized for speed - avoid backtracking
// Should match: "12/25/2023", "01/01/2024", "03/15/2025"
// Should NOT match: "13/25/2023", "12/32/2023", "1/1/23" (wrong format)
// Use atomic groups and possessive quantifiers for performance
const optimizedDateRegex = /\b(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}\b/g;
```

## 🧪 Regex Testing Template for Copilot

```javascript
/**
 * @prompt Generate comprehensive test cases for the following regex pattern
 * @context Legal document processing system
 * @pattern [Your regex pattern here]
 * @requirements [Specific matching requirements]
 */
function testRegexPattern() {
  const pattern = /your-regex-here/;

  // Positive test cases (should match)
  const shouldMatch = [
    // Copilot: generate 10+ examples that should match
  ];

  // Negative test cases (should NOT match)
  const shouldNotMatch = [
    // Copilot: generate 10+ examples that should NOT match
  ];

  // Edge cases
  const edgeCases = [
    // Copilot: generate boundary conditions and special cases
  ];

  // Performance test with large input
  const performanceTest = [
    // Copilot: generate large text samples for performance testing
  ];

  return { shouldMatch, shouldNotMatch, edgeCases, performanceTest };
}
```

## 🎨 Advanced Copilot Techniques

### 1. Multi-Step Regex Building

```javascript
// Step 1: Basic pattern
// Copilot: create regex for basic email format
const emailBasic = /\w+@\w+\.\w+/;

// Step 2: Add complexity
// Copilot: enhance above regex to handle dots in username and multiple domain levels
const emailEnhanced = /[\w.]+@[\w.]+\.\w+/;

// Step 3: Full specification
// Copilot: make above regex RFC-compliant for legal document email extraction
const emailRFC =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
```

### 2. Domain-Specific Language Creation

```javascript
// Create a mini-language for legal search patterns
// Syntax: FIELD:pattern (e.g., "case:2024-*", "judge:Smith", "date:2023-12-*")
// Copilot: generate regex to parse this search syntax and extract field/pattern pairs
const legalSearchSyntax = /(\w+):([^\s]+)/g;

// Usage example:
const query = "case:2024-CV-* judge:Smith date:2023-12-* status:pending";
const parseQuery = (query) => {
  const matches = [...query.matchAll(legalSearchSyntax)];
  return matches.map(([, field, pattern]) => ({ field, pattern }));
};
```

### 3. Validation Chain Prompting

```javascript
// Chain of validation for legal document upload
// Copilot: create regex chain for validating legal document filename
// Format: CaseNumber_DocumentType_Date_Version.pdf
// Example: "2024-CV-12345_Motion_20241215_v1.pdf"

const validationChain = {
  // Step 1: Overall format
  format: /^[\w-]+_[\w]+_\d{8}_v\d+\.pdf$/i,

  // Step 2: Case number validation
  caseNumber: /^(\d{4}-[A-Z]{2,4}-\d{5})_/,

  // Step 3: Document type validation
  docType: /_([A-Za-z]+)_/,

  // Step 4: Date validation
  date: /_(\d{8})_/,

  // Step 5: Version validation
  version: /_v(\d+)\.pdf$/i,
};
```

## 💡 Pro Tips for Copilot Regex Generation

1. **Start with the data format you're trying to match**
2. **Provide at least 5 positive and 5 negative examples**
3. **Specify the context (legal documents, user input, file parsing, etc.)**
4. **Mention performance requirements for large datasets**
5. **Include validation requirements (security, business rules)**
6. **Test incrementally - build complex patterns step by step**

## 🚀 Integration with Your Legal AI System

```typescript
// Example integration with your SIMD parser and memory optimizer
export class RegexOptimizedExtractor {
  private patterns: Map<string, RegExp> = new Map();

  constructor() {
    // Copilot: generate optimized regex patterns for legal document extraction
    this.patterns.set("caseNumber", /\d{4}-[A-Z]{2,4}-\d{5}/g);
    this.patterns.set(
      "citation",
      /[A-Z][a-zA-Z\s.]+\s+v\.\s+[A-Z][a-zA-Z\s.]+,\s+\d+\s+U\.S\.\s+\d+\s+\(\d{4}\)/g
    );
    this.patterns.set("dollarAmount", /\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g);
    this.patterns.set(
      "datePattern",
      /\b(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}\b/g
    );
  }

  extractEntities(text: string): Map<string, string[]> {
    const results = new Map<string, string[]>();

    for (const [patternName, regex] of this.patterns) {
      const matches = [...text.matchAll(regex)];
      results.set(
        patternName,
        matches.map((match) => match[0])
      );
    }

    return results;
  }
}
```

## 🎛️ Context Management for Large Legal AI Projects

### Managing Copilot's 128K Token Limit

```javascript
// Strategy 1: Progressive Enhancement
// Start with basic patterns, then enhance iteratively

// Copilot: create basic legal citation regex
const basicCitation = /\b\w+\s+v\.\s+\w+/g;

// Copilot: enhance above to capture case details
const enhancedCitation =
  /\b([A-Z][a-zA-Z\s.,'&-]+)\s+v\.?\s+([A-Z][a-zA-Z\s.,'&-]+),?\s+(\d+)\s+([A-Z][a-z.]*)\s+(\d+)/g;

// Copilot: add year capture and validation
const completeCitation =
  /\b([A-Z][a-zA-Z\s.,'&-]+)\s+v\.?\s+([A-Z][a-zA-Z\s.,'&-]+),?\s+(\d+)\s+([A-Z][a-z.]*)\s+(\d+)(?:\s*\((\d{4})\))?/g;
```

### Chunking Large Patterns

```javascript
// Strategy 2: Break complex regex into manageable chunks
// Instead of one massive regex, use multiple targeted patterns

class LegalTextProcessor {
  constructor() {
    // Copilot: create modular regex patterns for legal document processing
    this.patterns = {
      // Core legal entities
      entities: this.initializeEntityPatterns(),

      // Document structure
      structure: this.initializeStructurePatterns(),

      // Legal references
      references: this.initializeReferencePatterns(),

      // Financial data
      financial: this.initializeFinancialPatterns(),
    };
  }

  initializeEntityPatterns() {
    return {
      // Copilot: patterns for legal entities
      person:
        /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
      business: /\b([A-Z][a-zA-Z\s&.,-]+?)\s+(Inc\.?|Corp\.?|LLC\.?)\b/g,
      court: /\b([A-Z][a-zA-Z\s]+(?:Court|Tribunal|Commission))\b/g,
    };
  }

  initializeStructurePatterns() {
    return {
      // Copilot: document structure patterns
      section: /^§\s*(\d+(?:\.\d+)*)\s+(.+)$/gm,
      paragraph: /^\s*\(([a-z]|\d+)\)\s+(.+)$/gm,
      heading: /^[A-Z\s]{3,}$/gm,
    };
  }

  // ... more pattern groups
}
```

### Error-Resistant Prompting

```javascript
// Strategy 3: Handle common Copilot errors and limitations

// ❌ Problematic: Too complex for one request
// "Create regex for all legal document types with full validation"

// ✅ Better: Break into specific, testable pieces
// "Create regex to match legal case citations in Brown v. Board format"
const caseCitationRegex =
  /\b([A-Z][a-zA-Z\s.,'&-]+)\s+v\.?\s+([A-Z][a-zA-Z\s.,'&-]+)\b/g;

// Then iterate:
// "Enhance above regex to capture volume and page numbers"
const enhancedCaseCitation =
  /\b([A-Z][a-zA-Z\s.,'&-]+)\s+v\.?\s+([A-Z][a-zA-Z\s.,'&-]+),?\s+(\d+)\s+([A-Z][a-z.]*)\s+(\d+)/g;

// Test cases for validation
const testCases = [
  "Brown v. Board of Education, 347 U.S. 483",
  "Miranda v. Arizona, 384 U.S. 436",
  "Roe v. Wade, 410 U.S. 113",
];
```

## 🚀 Production-Ready Regex with Performance Monitoring

### ReDoS Prevention

```javascript
// Copilot: create ReDoS-safe regex for legal text processing
// Context: processing documents with potentially malicious content
// Requirements: must not cause exponential backtracking
// Input size: up to 10MB text files

// ❌ Dangerous - can cause ReDoS
const dangerousRegex = /(a+)+b/;
const nestedQuantifiers = /(x+x+)+y/;
const alternationWithOverlap = /(a|a)*b/;

// ✅ Safe alternatives
const safeRegex = /a+b/;
const atomicGroup = /(?>(a+))b/; // Atomic groups prevent backtracking
const possessiveQuantifier = /a++b/; // Possessive quantifiers (if supported)

// Validation function
function isSafeRegex(pattern) {
  // Copilot: create function to detect potentially dangerous regex patterns
  const dangerousPatterns = [
    /\([^)]*\+[^)]*\)\+/, // Nested quantifiers: (a+)+
    /\([^)]*\*[^)]*\)\*/, // Nested quantifiers: (a*)*
    /\([^|]*\|[^|]*\)\*/, // Alternation with overlap: (a|a)*
  ];

  return !dangerousPatterns.some((dp) => dp.test(pattern.source));
}
```

### Performance Benchmarking

```javascript
// Copilot: create regex performance testing framework for legal AI
class RegexPerformanceTester {
  constructor() {
    this.testSizes = [1000, 10000, 100000, 1000000]; // Characters
    this.iterations = 100;
  }

  async benchmarkPattern(pattern, description) {
    console.log(`🧪 Testing: ${description}`);

    const results = [];

    for (const size of this.testSizes) {
      const testData = this.generateLegalText(size);
      const times = [];

      for (let i = 0; i < this.iterations; i++) {
        const start = performance.now();
        testData.match(pattern);
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const maxTime = Math.max(...times);

      results.push({
        size,
        avgTime: avgTime.toFixed(3),
        maxTime: maxTime.toFixed(3),
        performance: this.evaluatePerformance(avgTime, size),
      });
    }

    return results;
  }

  generateLegalText(size) {
    // Copilot: generate realistic legal text for testing
    const legalPhrases = [
      "Brown v. Board of Education, 347 U.S. 483 (1954)",
      "Plaintiff alleges breach of contract",
      "Defendant's motion for summary judgment",
      "Apple Inc. vs Microsoft Corporation",
      "$1,234,567.89 in damages claimed",
      "Case No. 2024-CV-12345",
      "Filed on December 15, 2023",
    ];

    let text = "";
    while (text.length < size) {
      const phrase =
        legalPhrases[Math.floor(Math.random() * legalPhrases.length)];
      text += phrase + " ";
    }

    return text.substring(0, size);
  }

  evaluatePerformance(avgTime, size) {
    const ratio = (avgTime / size) * 1000; // ms per 1K characters

    if (ratio < 0.1) return "Excellent";
    if (ratio < 0.5) return "Good";
    if (ratio < 1.0) return "Acceptable";
    if (ratio < 5.0) return "Poor";
    return "Unacceptable";
  }
}

// Usage
const tester = new RegexPerformanceTester();

async function testLegalPatterns() {
  const patterns = [
    [/\b\d{4}-[A-Z]{2,4}-\d{5}\b/g, "Case Numbers"],
    [/\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g, "Dollar Amounts"],
    [
      /\b([A-Z][a-zA-Z\s.,'&-]+)\s+v\.?\s+([A-Z][a-zA-Z\s.,'&-]+)\b/g,
      "Case Citations",
    ],
  ];

  for (const [pattern, description] of patterns) {
    const results = await tester.benchmarkPattern(pattern, description);
    console.table(results);
  }
}
```

## 🔍 Advanced Debugging Techniques

### Regex Visualization for Copilot

```javascript
// Copilot: create regex debugging helper for complex legal patterns
class RegexDebugger {
  static explainPattern(regex) {
    // Copilot: create human-readable explanation of regex pattern
    const explanations = new Map([
      ["\\b", "Word boundary"],
      ["\\d", "Any digit (0-9)"],
      ["\\w", "Any word character (a-z, A-Z, 0-9, _)"],
      ["\\s", "Any whitespace character"],
      ["+", "One or more of the previous"],
      ["*", "Zero or more of the previous"],
      ["?", "Zero or one of the previous"],
      ["{n,m}", "Between n and m of the previous"],
      ["[...]", "Character class - any character inside brackets"],
      ["(...)", "Capturing group"],
      ["(?:...)", "Non-capturing group"],
      ["|", "OR - matches either left or right side"],
    ]);

    let explanation = `Pattern: ${regex.source}\n`;
    explanation += `Flags: ${regex.flags}\n\n`;

    for (const [pattern, meaning] of explanations) {
      if (regex.source.includes(pattern.replace(/\\/g, "\\"))) {
        explanation += `${pattern}: ${meaning}\n`;
      }
    }

    return explanation;
  }

  static testWithExamples(regex, testCases) {
    console.log("🧪 Testing regex:", regex.source);
    console.log("📋 Test Results:");

    testCases.forEach((testCase, index) => {
      const matches = testCase.text.match(regex);
      const result = matches ? "✅ Match" : "❌ No match";
      const expected = testCase.shouldMatch ? "✅ Expected" : "❌ Expected";
      const status = !!matches === testCase.shouldMatch ? "✅ PASS" : "❌ FAIL";

      console.log(`  ${index + 1}. "${testCase.text}"`);
      console.log(
        `     Result: ${result} | Expected: ${expected} | Status: ${status}`
      );
      if (matches) {
        console.log(`     Captures: [${matches.slice(1).join(", ")}]`);
      }
    });
  }
}

// Usage example
const caseNumberRegex = /^(\d{4})-(CV|CR|FAM|PROB)-(\d{5})$/;

const testCases = [
  { text: "2024-CV-12345", shouldMatch: true },
  { text: "2023-CR-99999", shouldMatch: true },
  { text: "24-CV-123", shouldMatch: false },
  { text: "2024-cv-12345", shouldMatch: false },
];

RegexDebugger.explainPattern(caseNumberRegex);
RegexDebugger.testWithExamples(caseNumberRegex, testCases);
```

## 📚 Legal Domain-Specific Patterns Library

### Contract Analysis Patterns

```javascript
// Copilot: create comprehensive contract analysis regex library
const contractPatterns = {
  // Contract parties identification
  parties: {
    // "Party A" or "First Party" references
    partyReference:
      /\b(?:Party\s+[A-Z]|(?:First|Second|Third)\s+Party|Buyer|Seller|Vendor|Client|Customer)\b/gi,

    // Defined terms (usually in quotes or parentheses)
    definedTerms:
      /["'"]([A-Z][a-zA-Z\s]+)["'"]\s*\([^)]+\)|(?:the\s+)?["'"]([A-Z][a-zA-Z\s]+)["'"]/g,

    // Corporate entities with full legal names
    corporations:
      /\b([A-Z][a-zA-Z\s&.,-]+?),?\s+a\s+([a-zA-Z\s]+(?:corporation|company|LLC|Inc\.))/gi,
  },

  // Financial terms and conditions
  financial: {
    // Contract values and payment terms
    contractValue:
      /(?:contract\s+(?:value|amount|price)|total\s+compensation|payment\s+of)\s*:?\s*\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,

    // Payment schedules
    paymentTerms:
      /(?:payment|due)\s+(?:within|in|after)\s+(\d+)\s+(days?|months?|years?)/gi,

    // Interest rates
    interestRate:
      /(?:interest\s+rate|rate\s+of|annual\s+percentage\s+rate)\s*:?\s*(\d+(?:\.\d+)?)\s*%/gi,
  },

  // Legal obligations and clauses
  obligations: {
    // Governing law clauses
    governingLaw:
      /(?:governed\s+by|subject\s+to)\s+(?:the\s+)?laws\s+of\s+([A-Z][a-zA-Z\s]+)/gi,

    // Termination clauses
    termination:
      /(?:terminate|termination)\s+(?:this\s+agreement\s+)?(?:upon|with|after|by)\s+([^.]+)/gi,

    // Confidentiality clauses
    confidentiality:
      /(?:confidential|proprietary|non-disclosure)\s+(?:information|data|materials?)/gi,
  },

  // Dates and deadlines
  temporal: {
    // Contract effective dates
    effectiveDate:
      /(?:effective\s+(?:date|as\s+of)|commencing\s+on|beginning)\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/gi,

    // Expiration dates
    expirationDate:
      /(?:expires?|expiration|terminates?)\s+(?:on\s+)?([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/gi,

    // Duration clauses
    duration:
      /(?:term\s+of|duration\s+of|period\s+of)\s+(\d+)\s+(days?|months?|years?)/gi,
  },
};
```

### Litigation Document Patterns

```javascript
// Copilot: create litigation-specific regex patterns for case management
const litigationPatterns = {
  // Court filings and motions
  filings: {
    // Motion types
    motionTypes:
      /(?:motion\s+(?:for|to)\s+)([a-z\s]+(?:judgment|dismiss|compel|strike|sanctions?))/gi,

    // Filing deadlines
    deadlines:
      /(?:due|filed?\s+(?:by|before)|deadline)\s+(?:on\s+)?([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/gi,

    // Court orders
    orders:
      /(?:court\s+(?:orders?|rules?|finds?|holds?)|it\s+is\s+(?:ordered|adjudged))\s+(?:that\s+)?([^.]+)/gi,
  },

  // Evidence and discovery
  discovery: {
    // Document requests
    documentRequests:
      /(?:request\s+for\s+production|produce\s+(?:all\s+)?documents?)\s+(?:relating\s+to|regarding|concerning)\s+([^.]+)/gi,

    // Interrogatories
    interrogatories:
      /(?:interrogatory|interrogatories)\s+(?:no\.\s*)?(\d+)(?:\s*:\s*(.+?)(?=\s*(?:interrogatory|$)))?/gi,

    // Depositions
    depositions:
      /(?:deposition\s+of|depose)\s+([A-Z][a-zA-Z\s.]+?)(?:\s+(?:scheduled|taken|conducted)\s+(?:on\s+)?([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}))?/gi,
  },

  // Legal standards and precedents
  legal: {
    // Citations to cases
    caseCitations:
      /\b([A-Z][a-zA-Z\s.,'&-]+)\s+v\.?\s+([A-Z][a-zA-Z\s.,'&-]+),?\s+(\d+)\s+([A-Z][a-z.]*)\s+(\d+)(?:\s*\((\d{4})\))?/g,

    // Statutory citations
    statutes: /\b(\d+)\s+([A-Z]\.?[A-Z]\.?[A-Z]\.?)\s+§\s*(\d+(?:\.\d+)*)/g,

    // Legal standards
    standards:
      /(?:standard\s+(?:of\s+review|for)|burden\s+of\s+proof|preponderance\s+of\s+(?:the\s+)?evidence|beyond\s+a\s+reasonable\s+doubt|clear\s+and\s+convincing)/gi,
  },
};
```
