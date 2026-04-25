# UI Implementation Plan

## Overall Approach:
The new UI will be implemented as a new SvelteKit route to keep it separate from the existing case dashboard. This will involve creating several new Svelte components and modifying existing global styles.

## Components to Create/Modify:

1.  **Sidebar Navigation:**
    *   **New Component:** `src/lib/components/+Sidebar.svelte`
    *   **Purpose:** This component will render the left-hand navigation menu with icons and text labels as seen in the image. It will manage the active state of navigation items.

2.  **Header/Navbar:**
    *   **Modification:** `src/lib/components/+Header.svelte`
    *   **Purpose:** The existing header will be updated to include the "Interactive canvas contagnars" title, a search input field, and user-related buttons/icons on the right side.
    *   **New Sub-component (optional, if complex):** `src/lib/components/+SearchInput.svelte` for the search bar.

3.  **Main Content Area (Drag and Canvas):**
    *   **New Route:** `src/routes/interactive-canvas/+page.svelte`
    *   **Purpose:** This will be the main page for the new UI. It will orchestrate the layout and include the various sections shown in the image.
    *   **New Section Components:**
        *   `src/lib/components/+FileUploadSection.svelte`: For the "Automatic file Upload" section, containing dropdowns, checkboxes, and input fields.
        *   `src/lib/components/+AutomateUploadSection.svelte`: For the "Automate Upload" section, with similar form elements.
        *   `src/lib/components/+AddNotesSection.svelte`: For the "Add Notes" section, also containing dropdowns, checkboxes, and input fields.

4.  **Reusable Form Elements:**
    *   **New Components (if custom styling is required beyond native HTML elements):**
        *   `src/lib/components/+Dropdown.svelte`: A reusable component for styled dropdowns.
        *   `src/lib/components/+Checkbox.svelte`: A reusable component for styled checkboxes.

## Styling:

*   **Global Styles:** `src/lib/components/app.css` will be updated to include general layout styles (e.g., for the two-column structure), and base styles for new elements like card containers, buttons, and form inputs to match the visual design.
*   **Component-Specific Styles:** Each new Svelte component will contain its own `<style>` block for specific styling that applies only to that component.

## Data Flow (Conceptual):
*   Form data within the main content area will be managed using Svelte's reactivity.
*   The "Add Notes" button at the bottom will likely trigger an action to add new notes or submit the form.

## Detailed Implementation Steps:

1.  **Create the new route:** Create `src/routes/interactive-canvas/+page.svelte` and set up its basic structure.
2.  **Develop `+Sidebar.svelte`:** Implement the navigation links and styling for the active state.
3.  **Update `+Header.svelte`:** Integrate the new title, search input, and user action elements.
4.  **Create reusable form components:** Develop `+Dropdown.svelte` and `+Checkbox.svelte` if custom styling is needed.
5.  **Develop section components:** Create `+FileUploadSection.svelte`, `+AutomateUploadSection.svelte`, and `+AddNotesSection.svelte`, incorporating the necessary input fields, dropdowns, and checkboxes.
6.  **Integrate sections into `interactive-canvas/+page.svelte`:** Assemble all the section components within the main page, arranging them according to the image layout.
7.  **Apply CSS:** Add global CSS rules to `app.css` for the overall layout and general element styling. Add component-specific styles within each Svelte component.

## Mermaid Diagram for Component Structure:

```mermaid
graph TD
    A[src/routes/interactive-canvas/+page.svelte] --> B[+Header.svelte]
    A --> C[+Sidebar.svelte]
    A --> D[Main Content Area]
    D --> E[+FileUploadSection.svelte]
    D --> F[+AutomateUploadSection.svelte]
    D --> G[+AddNotesSection.svelte]
    E --> H[+Dropdown.svelte]
    E --> I[+Checkbox.svelte]
    F --> H
    F --> I
    G --> H
    G --> I
    B --> J[+SearchInput.svelte]