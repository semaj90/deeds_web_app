# Accessibility Testing Guide

This guide covers manual testing procedures for accessibility features in the Legal AI application.

## Quick Testing Checklist

### Keyboard Navigation

- [ ] **Tab Navigation**: Tab through all interactive elements in logical order
- [ ] **Skip to Content**: Press `Alt+S` to jump to main content
- [ ] **Accessibility Settings**: Press `Alt+A` to open accessibility settings
- [ ] **Help System**: Press `F1` for accessibility help
- [ ] **Modal Navigation**: Tab stays within open modals
- [ ] **Focus Restoration**: Focus returns to trigger element when modals close

### Screen Reader Testing

- [ ] **Announcements**: AI operations announce start/completion status
- [ ] **Live Regions**: Dynamic content updates are announced
- [ ] **Labels**: All interactive elements have accessible names
- [ ] **Headings**: Proper heading hierarchy (H1, H2, H3...)
- [ ] **Landmarks**: Main content areas are properly labeled

### Visual Accessibility

- [ ] **Font Size**: Settings allow 4 font size levels
- [ ] **High Contrast**: Toggle dramatically improves contrast
- [ ] **Reduced Motion**: Animations respect user preference
- [ ] **Focus Indicators**: Clear visual focus indicators on all elements
- [ ] **Color Independence**: Information not conveyed by color alone

### AI-Specific Features

- [ ] **Processing States**: AI operations announce "processing" and "complete"
- [ ] **Error Handling**: AI errors are announced clearly
- [ ] **Result Presentation**: Complex AI outputs use progressive disclosure
- [ ] **Context Awareness**: Screen reader provides context for AI-generated content

## Manual Testing Procedures

### 1. Screen Reader Testing

#### Using NVDA (Windows)

1. Download and install NVDA from https://nvaccess.org
2. Start NVDA and navigate to the application
3. Test key scenarios:
   - Navigate main menu items
   - Open AI dashboard and start a legal analysis
   - Use accessibility settings
   - Navigate through AI results

#### Using JAWS (Windows)

1. If available, start JAWS
2. Test same scenarios as NVDA
3. Compare announcement quality and timing

#### Using VoiceOver (macOS)

1. Enable VoiceOver: `Cmd+F5`
2. Use `Control+Option+Arrow` keys to navigate
3. Test rotor navigation: `Control+Option+U`

### 2. Keyboard-Only Testing

#### Basic Navigation

1. Use only keyboard (no mouse)
2. Tab through entire application
3. Verify all functionality is accessible
4. Test keyboard shortcuts:
   - `Alt+S`: Skip to main content
   - `Alt+A`: Open accessibility settings
   - `F1`: Accessibility help
   - `Escape`: Close modals

#### AI Workflow Testing

1. Navigate to AI Hub using keyboard only
2. Start a legal document analysis
3. Navigate through results
4. Verify all AI controls are keyboard accessible

### 3. Visual Accessibility Testing

#### High Contrast Mode

1. Open accessibility settings (`Alt+A`)
2. Enable high contrast mode
3. Verify text is clearly readable
4. Check focus indicators are visible
5. Ensure icons/graphics have sufficient contrast

#### Font Size Testing

1. Test all four font size levels
2. Verify layout doesn't break
3. Check all text scales appropriately
4. Ensure controls remain usable

#### Reduced Motion Testing

1. Enable reduced motion preference
2. Check animations are minimized
3. Verify essential motion is preserved
4. Test with system preference enabled

### 4. Mobile Accessibility Testing

#### Touch Accessibility

1. Test with screen reader on mobile (TalkBack/VoiceOver)
2. Verify touch targets are large enough (44px minimum)
3. Check swipe gestures work with screen reader
4. Test landscape/portrait orientation changes

#### Voice Control (iOS)

1. Enable Voice Control in iOS settings
2. Test voice commands for navigation
3. Verify custom labels work with voice control

## Automated Testing

### Running Playwright Tests

```bash
# Install dependencies
npm install @playwright/test

# Run accessibility tests
npm run test:accessibility

# Run with debug mode
npm run test:accessibility -- --debug

# Generate accessibility report
npm run test:accessibility -- --reporter=html
```

### Using axe-core Integration

```bash
# Run axe accessibility audit
npm run test:axe

# Generate detailed accessibility report
npm run audit:accessibility
```

## Common Issues and Fixes

### Focus Management Issues

- **Problem**: Focus lost when opening modals
- **Fix**: Implement focus trap and restoration
- **Test**: Tab through modal, ensure focus stays within

### Screen Reader Announcements

- **Problem**: Dynamic content not announced
- **Fix**: Use `aria-live` regions appropriately
- **Test**: Verify announcements with screen reader

### Keyboard Shortcuts

- **Problem**: Shortcuts conflict with browser/OS
- **Fix**: Use unique, non-conflicting combinations
- **Test**: Verify shortcuts work across browsers

### Color Contrast

- **Problem**: Insufficient contrast ratios
- **Fix**: Ensure 4.5:1 ratio for normal text, 3:1 for large text
- **Test**: Use color contrast analyzer tools

## Accessibility Compliance Checklist

### WCAG 2.1 AA Requirements

- [ ] **1.1.1** Non-text content has text alternatives
- [ ] **1.3.1** Information and relationships can be programmatically determined
- [ ] **1.4.3** Color contrast ratio is at least 4.5:1
- [ ] **1.4.4** Text can be resized up to 200%
- [ ] **2.1.1** All functionality is keyboard accessible
- [ ] **2.1.2** No keyboard trap
- [ ] **2.4.1** Skip navigation mechanisms
- [ ] **2.4.3** Focus order is logical
- [ ] **2.4.6** Headings and labels describe topic or purpose
- [ ] **2.4.7** Focus indicators are visible
- [ ] **3.1.1** Page language is identified
- [ ] **3.2.1** Focus doesn't cause unexpected context changes
- [ ] **3.3.1** Input errors are identified
- [ ] **3.3.2** Labels or instructions are provided
- [ ] **4.1.1** Content parses correctly
- [ ] **4.1.2** Name, role, value available for UI components

### Legal AI Specific Requirements

- [ ] **AI Processing States**: Clear indication of AI operation status
- [ ] **Error Communication**: AI errors communicated accessibly
- [ ] **Result Navigation**: Complex AI outputs navigable by assistive tech
- [ ] **Voice Interface**: Optional voice commands for AI interaction
- [ ] **Progressive Disclosure**: Complex information revealed progressively
- [ ] **Context Preservation**: User context maintained during AI operations

## Testing Tools

### Browser Extensions

- **axe DevTools**: Automated accessibility auditing
- **WAVE**: Web accessibility evaluation
- **Lighthouse**: Accessibility scoring and recommendations
- **Color Oracle**: Color blindness simulation

### Desktop Tools

- **Colour Contrast Analyser**: WCAG contrast checking
- **Screen Reader Testing**: NVDA, JAWS, VoiceOver
- **Keyboard Testing**: Ensure mouse is disconnected

### Online Tools

- **WebAIM Contrast Checker**: Color contrast validation
- **Pa11y Command Line**: Automated accessibility testing
- **Axe Accessibility Checker**: Browser-based auditing

## Reporting Issues

When accessibility issues are found:

1. **Document the Issue**
   - Browser and version
   - Assistive technology used
   - Steps to reproduce
   - Expected vs actual behavior

2. **Categorize Severity**
   - **Critical**: Blocks core functionality
   - **High**: Significantly impacts usability
   - **Medium**: Minor usability impact
   - **Low**: Enhancement opportunity

3. **Provide Context**
   - User personas affected
   - Business impact
   - Suggested solutions
   - WCAG guidelines involved

4. **Track Progress**
   - Assign priority and timeline
   - Test fixes with affected users
   - Update accessibility documentation
