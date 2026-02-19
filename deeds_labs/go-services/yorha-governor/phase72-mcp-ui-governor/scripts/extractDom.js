const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");

class DOMExtractor {
  constructor() {
    this.selectors = {
      // Semantic elements
      semantic: ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer'],

      // Interactive elements
      interactive: ['button', 'a', 'input', 'select', 'textarea', 'form'],

      // Media elements
      media: ['img', 'video', 'audio', 'canvas', 'svg'],

      // Structural elements
      structural: ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],

      // Form elements
      forms: ['form', 'fieldset', 'legend', 'label', 'input', 'select', 'textarea', 'button'],

      // List elements
      lists: ['ul', 'ol', 'li', 'dl', 'dt', 'dd'],

      // Table elements
      tables: ['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption']
    };
  }

  async extractFromFile(htmlPath) {
    try {
      const html = await fs.readFile(htmlPath, 'utf8');
      return this.extractFromHTML(html);
    } catch (error) {
      console.error(`Error reading HTML file ${htmlPath}:`, error);
      return null;
    }
  }

  extractFromHTML(html) {
    const $ = cheerio.load(html);

    const analysis = {
      metadata: this.extractMetadata($),
      structure: this.extractStructure($),
      accessibility: this.extractAccessibility($),
      performance: this.extractPerformance($),
      seo: this.extractSEO($),
      components: this.extractComponents($)
    };

    return analysis;
  }

  extractMetadata($) {
    return {
      title: $('title').text().trim(),
      description: $('meta[name="description"]').attr('content') || '',
      keywords: $('meta[name="keywords"]').attr('content') || '',
      viewport: $('meta[name="viewport"]').attr('content') || '',
      charset: $('meta[charset]').attr('charset') || '',
      language: $('html').attr('lang') || '',
      doctype: this.detectDoctype($)
    };
  }

  extractStructure($) {
    const structure = {};

    for (const [category, selectors] of Object.entries(this.selectors)) {
      structure[category] = {};

      for (const selector of selectors) {
        const elements = $(selector);
        structure[category][selector] = {
          count: elements.length,
          elements: elements.map((i, el) => ({
            id: $(el).attr('id') || null,
            class: $(el).attr('class') || null,
            text: $(el).text().trim().substring(0, 100),
            attributes: this.getAttributes($(el))
          })).get()
        };
      }
    }

    return structure;
  }

  extractAccessibility($) {
    const issues = [];

    // Check images without alt text
    $('img').each((i, el) => {
      if (!$(el).attr('alt')) {
        issues.push({
          type: 'missing-alt',
          element: 'img',
          severity: 'error',
          message: 'Image missing alt attribute'
        });
      }
    });

    // Check buttons without accessible names
    $('button').each((i, el) => {
      const hasText = $(el).text().trim().length > 0;
      const hasAriaLabel = $(el).attr('aria-label');
      const hasTitle = $(el).attr('title');

      if (!hasText && !hasAriaLabel && !hasTitle) {
        issues.push({
          type: 'button-accessibility',
          element: 'button',
          severity: 'warning',
          message: 'Button missing accessible name'
        });
      }
    });

    // Check form inputs
    $('input, select, textarea').each((i, el) => {
      const type = $(el).attr('type') || 'text';
      const hasLabel = $(el).attr('aria-label') || $(el).attr('aria-labelledby') ||
                      $(`label[for="${$(el).attr('id')}"]`).length > 0;

      if (!hasLabel && type !== 'hidden' && type !== 'submit') {
        issues.push({
          type: 'input-accessibility',
          element: el.tagName.toLowerCase(),
          severity: 'warning',
          message: 'Form input missing associated label'
        });
      }
    });

    // Check heading hierarchy
    const headings = $('h1, h2, h3, h4, h5, h6').map((i, el) => parseInt(el.tagName.charAt(1))).get();

    if (headings.length > 0 && headings[0] !== 1) {
      issues.push({
        type: 'heading-hierarchy',
        severity: 'warning',
        message: 'Page should start with h1'
      });
    }

    return issues;
  }

  extractPerformance($) {
    const metrics = {
      totalElements: $('*').length,
      images: $('img').length,
      scripts: $('script').length,
      stylesheets: $('link[rel="stylesheet"]').length,
      iframes: $('iframe').length,
      domDepth: this.calculateDOMDepth($)
    };

    return metrics;
  }

  extractSEO($) {
    const seo = {
      titleLength: $('title').text().trim().length,
      descriptionLength: ($('meta[name="description"]').attr('content') || '').length,
      h1Count: $('h1').length,
      h2Count: $('h2').length,
      internalLinks: $('a[href^="/"]').length,
      externalLinks: $('a[href^="http"]').length,
      imagesWithAlt: $('img[alt]').length,
      imagesWithoutAlt: $('img:not([alt])').length
    };

    return seo;
  }

  extractComponents($) {
    // Look for common component patterns
    const components = {
      buttons: $('button, [role="button"], .btn, .button').length,
      inputs: $('input, select, textarea').length,
      cards: $('.card, [class*="card"]').length,
      modals: $('.modal, [role="dialog"]').length,
      navigation: $('nav, .nav, .navbar').length,
      forms: $('form').length,
      tables: $('table').length
    };

    return components;
  }

  getAttributes($el) {
    const attrs = {};
    const attributes = $el[0].attributes;

    for (let i = 0; i < attributes.length; i++) {
      const attr = attributes[i];
      attrs[attr.name] = attr.value;
    }

    return attrs;
  }

  detectDoctype($) {
    // This is a simplified check - in a real implementation,
    // you'd need to check the raw HTML before cheerio processing
    return 'html5'; // Assume HTML5 for modern apps
  }

  calculateDOMDepth($) {
    let maxDepth = 0;

    function calculateDepth(element, depth = 0) {
      maxDepth = Math.max(maxDepth, depth);

      element.children().each((i, child) => {
        calculateDepth($(child), depth + 1);
      });
    }

    calculateDepth($('body'));
    return maxDepth;
  }
}

async function extractFromDirectory(dirPath) {
  const extractor = new DOMExtractor();
  const results = {};

  try {
    const files = await fs.readdir(dirPath);

    for (const file of files) {
      if (file.endsWith('.html')) {
        const filePath = path.join(dirPath, file);
        const analysis = await extractor.extractFromFile(filePath);

        if (analysis) {
          results[file.replace('.html', '')] = analysis;
        }
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
  }

  return results;
}

module.exports = { DOMExtractor, extractFromDirectory };