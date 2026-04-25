## EvidenceNode.svelte Syntax Fixes

### Issues Fixed:

1. **Invalid Template Syntax**
   - ❌ `className="${1}"` (React syntax with invalid template literals)
   - ✅ `class="proper-class-name"` (Svelte syntax)

2. **Invalid Attribute Syntax**
   - ❌ `tabindex={${1}}` (Invalid template literal syntax)
   - ✅ `tabindex="0"` (Proper string/number syntax)

3. **CSS Class Names**
   - Added proper semantic class names:
     - `evidence-node` - Main container
     - `node-header` - Header section
     - `node-title` - Title area
     - `title-text` - Title text
     - `node-controls` - Control buttons area
     - `control-button` - Individual control buttons
     - `icon` - Icons within buttons
     - `canvas-area` - Canvas container
     - `evidence-canvas` - Canvas element
     - `resize-handles` - Resize handle container
     - `resize-handle` - Base resize handle class
     - `resize-bottom-right`, `resize-bottom`, `resize-right` - Specific resize handles

4. **Enhanced Styling**
   - Added comprehensive CSS for the evidence node
   - Proper positioning and layout
   - Hover and focus states
   - Accessible styling
   - Responsive resize handles

### Files Modified:

- `src/lib/components/canvas/EvidenceNode.svelte`

### Result:

- ✅ All syntax errors resolved
- ✅ Proper Svelte template syntax
- ✅ Enhanced styling and accessibility
- ✅ Functional resize handles and controls
