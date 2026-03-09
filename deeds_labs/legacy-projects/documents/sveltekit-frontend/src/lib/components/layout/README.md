# Layout Components Documentation

## Overview

This directory contains standardized layout components that ensure consistent spacing, flexbox best practices, and responsive design across all pages in the Legal AI Platform.

## Components

### PageLayout.svelte

The main layout wrapper that provides:

- **Consistent container sizing** with configurable max-width
- **Proper spacing** with configurable padding and gap
- **Flexbox structure** with `min-h-screen` and `flex-col`
- **Variant styling** for different page types (default, dashboard, legal, yorha)
- **Hero section** with title and subtitle support
- **NES-inspired design** integration

#### Usage Example

```svelte
<PageLayout 
  title="Page Title"
  subtitle="Page description" 
  variant="yorha"
  maxWidth="xl"
  padding="lg"
  gap="lg"
>
  <!-- Page content goes here -->
</PageLayout>
```

#### Props

- `title?: string` - Main page title
- `subtitle?: string` - Page subtitle/description  
- `variant?: 'default' | 'dashboard' | 'legal' | 'yorha'` - Visual theme
- `fullWidth?: boolean` - Remove max-width constraint
- `maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'` - Container max-width
- `padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'` - Container padding
- `gap?: 'none' | 'sm' | 'md' | 'lg' | 'xl'` - Gap between sections

### ContentSection.svelte

A flexible content container that provides:

- **Section headers** with title and subtitle
- **Multiple layout variants** (default, card, panel, grid)
- **Responsive grid system** with configurable columns
- **Consistent spacing** and gap control
- **NES-inspired styling** integration

#### Usage Example

```svelte
<ContentSection title="Section Title" variant="grid" columns={3} gap="lg">
  <Card>Content 1</Card>
  <Card>Content 2</Card>
  <Card>Content 3</Card>
</ContentSection>
```

#### Props

- `title?: string` - Section title
- `subtitle?: string` - Section subtitle
- `variant?: 'default' | 'card' | 'panel' | 'grid'` - Layout type
- `padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'` - Section padding
- `gap?: 'none' | 'sm' | 'md' | 'lg' | 'xl'` - Gap between items
- `columns?: 1 | 2 | 3 | 4 | 6 | 12` - Grid columns (when variant="grid")

## Flexbox Best Practices Implemented

### 1. **Container Structure**
```css
.page-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh; /* Full viewport height */
}
```

### 2. **Content Areas**
```css
.main-content {
  flex: 1; /* Grows to fill available space */
  display: flex;
  flex-direction: column;
}
```

### 3. **Responsive Grid**
```css
.grid-responsive {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}
```

### 4. **Flex Utilities**
- `.flex-center` - Center items horizontally and vertically
- `.flex-between` - Space items with justify-content: space-between
- `.flex-col-center` - Column direction with centered alignment

## Spacing System

### Gap Sizes
- `none`: 0
- `sm`: 0.5rem (8px)
- `md`: 1rem (16px) 
- `lg`: 1.5rem (24px)
- `xl`: 2rem (32px)

### Padding Sizes  
- `none`: 0
- `sm`: 0.5rem (8px)
- `md`: 1rem (16px)
- `lg`: 1.5rem (24px)
- `xl`: 2rem (32px)

## Responsive Breakpoints

- **Mobile**: < 768px (single column layouts)
- **Tablet**: 768px - 1024px (2-column grids)
- **Desktop**: > 1024px (3+ column grids)

## Migration Guide

To convert existing pages to use the new layout system:

### Before
```svelte
<div class="container mx-auto px-4 min-h-screen">
  <h1 class="text-4xl font-bold mb-8">Title</h1>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <!-- content -->
  </div>
</div>
```

### After  
```svelte
<PageLayout title="Title" maxWidth="xl" padding="lg" gap="lg">
  <ContentSection variant="grid" columns={3}>
    <!-- content -->
  </ContentSection>
</PageLayout>
```

## Benefits

1. **Consistency** - All pages follow the same layout patterns
2. **Maintainability** - Layout logic centralized in reusable components  
3. **Responsive** - Built-in responsive behavior across all breakpoints
4. **Accessible** - Proper semantic structure and focus management
5. **Performance** - Optimized CSS with consistent class usage
6. **Developer Experience** - Simple prop-based API for customization

## Integration with NES-Inspired Design

The layout components seamlessly integrate with the NES-inspired CSS classes:

- **Neural Sprite Effects** - Applied to interactive elements
- **Legal Priority Classes** - Used for content importance hierarchy  
- **YoRHa 3D Styling** - Cyberpunk visual effects
- **Gradient Text** - Enhanced typography
- **Scan Line Overlays** - Retro-futuristic accents