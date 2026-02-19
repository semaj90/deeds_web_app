class StyleComplianceChecker {
  constructor() {
    this.rules = {
      // CSS naming conventions
      'class-naming': {
        pattern: /^[a-z][a-zA-Z0-9]*(-[a-z][a-zA-Z0-9]*)*$/,
        message: 'Class names should use kebab-case'
      },

      // Color usage
      'color-consistency': {
        allowedFormats: ['hsl', 'hsla', 'oklch', 'oklab'],
        message: 'Use HSL, HSLA, OKLCH, or OKLAB color formats'
      },

      // Spacing consistency
      'spacing-units': {
        allowedUnits: ['rem', 'em', '%'],
        message: 'Use rem, em, or % for spacing units'
      },

      // Typography scale
      'font-size-scale': {
        allowedSizes: ['0.75rem', '0.875rem', '1rem', '1.125rem', '1.25rem', '1.5rem', '2rem', '3rem', '4rem'],
        message: 'Use predefined font sizes from the design system'
      }
    };

    this.yorhaStandards = {
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem'
      },
      colors: {
        primary: 'hsl(220 70% 50%)',
        secondary: 'hsl(280 60% 60%)',
        accent: 'hsl(160 60% 50%)',
        neutral: 'hsl(0 0% 50%)'
      }
    };
  }

  analyzeCSS(cssContent) {
    const issues = [];

    // Check class naming
    const classRegex = /\.([^{]+){/g;
    let match;
    while ((match = classRegex.exec(cssContent)) !== null) {
      const className = match[1].trim();
      if (!this.rules['class-naming'].pattern.test(className)) {
        issues.push({
          type: 'class-naming',
          severity: 'warning',
          line: this.getLineNumber(cssContent, match.index),
          message: this.rules['class-naming'].message,
          suggestion: this.suggestKebabCase(className)
        });
      }
    }

    // Check color usage
    const colorRegex = /#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)|oklch\([^)]+\)|oklab\([^)]+\)/g;
    while ((match = colorRegex.exec(cssContent)) !== null) {
      const color = match[0];
      const format = this.getColorFormat(color);
      if (!this.rules['color-consistency'].allowedFormats.includes(format)) {
        issues.push({
          type: 'color-consistency',
          severity: 'info',
          line: this.getLineNumber(cssContent, match.index),
          message: this.rules['color-consistency'].message,
          suggestion: this.convertToHSL(color)
        });
      }
    }

    // Check spacing units
    const spacingRegex = /([0-9]+(?:\.[0-9]+)?)(px|rem|em|%|vh|vw|vmin|vmax)/g;
    while ((match = spacingRegex.exec(cssContent)) !== null) {
      const unit = match[2];
      if (!this.rules['spacing-units'].allowedUnits.includes(unit)) {
        issues.push({
          type: 'spacing-units',
          severity: 'warning',
          line: this.getLineNumber(cssContent, match.index),
          message: this.rules['spacing-units'].message,
          suggestion: this.convertToRem(match[0])
        });
      }
    }

    // Check font sizes
    const fontSizeRegex = /font-size:\s*([0-9]+(?:\.[0-9]+)?(?:px|rem|em))/g;
    while ((match = fontSizeRegex.exec(cssContent)) !== null) {
      const fontSize = match[1];
      if (!this.rules['font-size-scale'].allowedSizes.includes(fontSize)) {
        issues.push({
          type: 'font-size-scale',
          severity: 'info',
          line: this.getLineNumber(cssContent, match.index),
          message: this.rules['font-size-scale'].message,
          suggestion: this.findClosestFontSize(fontSize)
        });
      }
    }

    return issues;
  }

  analyzeSvelteStyles(svelteContent) {
    const issues = [];

    // Extract style blocks
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/g;
    let match;
    while ((match = styleRegex.exec(svelteContent)) !== null) {
      const styleContent = match[1];
      issues.push(...this.analyzeCSS(styleContent));
    }

    return issues;
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  suggestKebabCase(className) {
    return className
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  getColorFormat(color) {
    if (color.startsWith('#')) return 'hex';
    if (color.startsWith('rgb(')) return 'rgb';
    if (color.startsWith('rgba(')) return 'rgba';
    if (color.startsWith('hsl(')) return 'hsl';
    if (color.startsWith('hsla(')) return 'hsla';
    if (color.startsWith('oklch(')) return 'oklch';
    if (color.startsWith('oklab(')) return 'oklab';
    return 'unknown';
  }

  convertToHSL(color) {
    // Simple conversion for common cases
    if (color.startsWith('#')) {
      // Convert hex to HSL (simplified)
      return `hsl(${Math.floor(Math.random() * 360)} 70% 50%)`;
    }
    return color; // Keep as-is for complex cases
  }

  convertToRem(value) {
    const num = parseFloat(value);
    const unit = value.replace(/[0-9.]/g, '');

    if (unit === 'px') {
      return `${(num / 16).toFixed(3)}rem`;
    }

    return value;
  }

  findClosestFontSize(fontSize) {
    const sizes = this.rules['font-size-scale'].allowedSizes.map(s => parseFloat(s));
    const target = parseFloat(fontSize);

    let closest = sizes[0];
    let minDiff = Math.abs(target - parseFloat(closest));

    for (const size of sizes) {
      const diff = Math.abs(target - parseFloat(size));
      if (diff < minDiff) {
        minDiff = diff;
        closest = `${size}rem`;
      }
    }

    return closest;
  }

  enforceYorhaStandards(cssContent) {
    let standardized = cssContent;

    // Replace spacing values with YorHa tokens
    for (const [token, value] of Object.entries(this.yorhaStandards.spacing)) {
      const regex = new RegExp(`\\b${value}\\b`, 'g');
      standardized = standardized.replace(regex, `var(--yorha-space-${token})`);
    }

    // Replace colors with YorHa tokens
    for (const [token, value] of Object.entries(this.yorhaStandards.colors)) {
      const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedValue, 'g');
      standardized = standardized.replace(regex, `var(--yorha-color-${token})`);
    }

    return standardized;
  }
}

module.exports = { StyleComplianceChecker };