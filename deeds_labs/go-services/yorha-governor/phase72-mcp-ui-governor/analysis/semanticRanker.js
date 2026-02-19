const natural = require("natural");
const compromise = require("compromise");

class SemanticRanker {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.stopwords = natural.stopwords;
  }

  async rank(routeHtml, yorhaSpec) {
    try {
      // Extract text content from HTML
      const routeText = this.extractTextFromHtml(routeHtml);
      const specText = typeof yorhaSpec === 'string' ? yorhaSpec : JSON.stringify(yorhaSpec);

      // Calculate semantic similarity
      const similarity = this.calculateSemanticSimilarity(routeText, specText);

      // Calculate structural compliance
      const structuralScore = this.calculateStructuralCompliance(routeHtml, yorhaSpec);

      // Calculate accessibility score
      const accessibilityScore = this.calculateAccessibilityScore(routeHtml);

      // Combine scores with weights
      const finalScore = (
        similarity * 0.4 +
        structuralScore * 0.4 +
        accessibilityScore * 0.2
      );

      return {
        score: Math.round(finalScore * 100) / 100,
        components: {
          semanticSimilarity: similarity,
          structuralCompliance: structuralScore,
          accessibilityScore: accessibilityScore
        },
        analysis: this.generateAnalysis(routeHtml, yorhaSpec, finalScore)
      };

    } catch (error) {
      console.error('Error in semantic ranking:', error);
      return {
        score: 0,
        error: error.message,
        components: { semanticSimilarity: 0, structuralCompliance: 0, accessibilityScore: 0 }
      };
    }
  }

  extractTextFromHtml(html) {
    // Remove HTML tags and extract text content
    const text = html.replace(/<[^>]*>/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();

    return text;
  }

  calculateSemanticSimilarity(text1, text2) {
    const tokens1 = this.tokenizeAndStem(text1);
    const tokens2 = this.tokenizeAndStem(text2);

    // Calculate Jaccard similarity
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  tokenizeAndStem(text) {
    const tokens = this.tokenizer.tokenize(text) || [];
    const filteredTokens = tokens.filter(token =>
      token.length > 2 && !this.stopwords.includes(token.toLowerCase())
    );

    return filteredTokens.map(token => this.stemmer.stem(token));
  }

  calculateStructuralCompliance(html, spec) {
    let score = 0;
    let maxScore = 0;

    // Check for required semantic elements
    const requiredElements = ['header', 'nav', 'main', 'footer'];
    maxScore += requiredElements.length;

    for (const element of requiredElements) {
      if (html.includes(`<${element}`) || html.includes(`<${element}>`)) {
        score += 1;
      }
    }

    // Check for proper heading hierarchy
    const headings = html.match(/<h[1-6][^>]*>/g) || [];
    maxScore += 1;

    if (headings.length > 0) {
      const firstHeading = headings[0].match(/<h([1-6])/);
      if (firstHeading && firstHeading[1] === '1') {
        score += 1;
      }
    }

    // Check for alt text on images
    const images = html.match(/<img[^>]*>/g) || [];
    const imagesWithAlt = html.match(/<img[^>]*alt=["'][^"']*["'][^>]*>/g) || [];
    maxScore += 1;

    if (images.length > 0) {
      const altRatio = imagesWithAlt.length / images.length;
      score += altRatio;
    } else {
      score += 1; // No images, so perfect score
    }

    return score / maxScore;
  }

  calculateAccessibilityScore(html) {
    let score = 0;
    let maxScore = 0;

    // Check for lang attribute
    maxScore += 1;
    if (html.includes('lang=')) {
      score += 1;
    }

    // Check for buttons with accessible names
    const buttons = html.match(/<button[^>]*>/g) || [];
    maxScore += Math.min(buttons.length, 5); // Cap at 5 buttons

    for (const button of buttons.slice(0, 5)) {
      if (button.includes('aria-label=') || button.includes('title=') ||
          button.includes('</button>')) { // Has text content
        score += 1;
      }
    }

    // Check for form inputs with labels
    const inputs = html.match(/<input[^>]*>/g) || [];
    maxScore += Math.min(inputs.length, 3); // Cap at 3 inputs

    for (const input of inputs.slice(0, 3)) {
      const id = input.match(/id=["']([^"']*)["']/);
      if (id && html.includes(`for="${id[1]}"`)) {
        score += 1;
      } else if (input.includes('aria-label=')) {
        score += 1;
      }
    }

    return maxScore > 0 ? score / maxScore : 1;
  }

  generateAnalysis(html, spec, score) {
    const analysis = {
      overall: score >= 0.8 ? 'excellent' : score >= 0.6 ? 'good' : score >= 0.4 ? 'fair' : 'poor',
      strengths: [],
      weaknesses: [],
      recommendations: []
    };

    // Analyze strengths
    if (this.calculateStructuralCompliance(html, spec) > 0.7) {
      analysis.strengths.push('Good semantic HTML structure');
    }

    if (this.calculateAccessibilityScore(html) > 0.7) {
      analysis.strengths.push('Strong accessibility compliance');
    }

    // Analyze weaknesses
    if (this.calculateStructuralCompliance(html, spec) < 0.5) {
      analysis.weaknesses.push('Poor semantic HTML structure');
      analysis.recommendations.push('Add proper semantic elements (header, nav, main, footer)');
    }

    if (this.calculateAccessibilityScore(html) < 0.5) {
      analysis.weaknesses.push('Accessibility issues detected');
      analysis.recommendations.push('Add alt text to images, labels to form inputs, and accessible names to buttons');
    }

    // Check for specific issues
    const images = html.match(/<img[^>]*>/g) || [];
    const imagesWithoutAlt = images.filter(img => !img.includes('alt='));
    if (imagesWithoutAlt.length > 0) {
      analysis.weaknesses.push(`${imagesWithoutAlt.length} images missing alt text`);
      analysis.recommendations.push('Add descriptive alt text to all images');
    }

    return analysis;
  }

  async rankMultiple(routes, spec) {
    const rankings = [];

    for (const route of routes) {
      const ranking = await this.rank(route.html, spec);
      rankings.push({
        route: route.route,
        score: ranking.score,
        analysis: ranking.analysis
      });
    }

    // Sort by score descending
    rankings.sort((a, b) => b.score - a.score);

    return rankings;
  }
}

async function rank(routeHtml, yorhaSpec) {
  const ranker = new SemanticRanker();
  return await ranker.rank(routeHtml, yorhaSpec);
}

module.exports = { SemanticRanker, rank };