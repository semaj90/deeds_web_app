# Spec Delta: Svelte 5 Accessibility and Component Warning Conformance

## ADDED Requirements

### Requirement: REQ-A11Y-01 Accessible Form Controls and Label Association

Every `<label>` element in interactive Svelte components SHALL be strictly associated with a form control, either via `for` referencing an element's `id` or wrapping the input control.

#### Scenario: Svelte-check verifies label control association
- **GIVEN** a page or component with `<label>` tags
- **WHEN** `svelte-check` runs with `--threshold warning`
- **THEN** zero `a11y_label_has_associated_control` warnings are emitted

### Requirement: REQ-A11Y-02 Elimination of Unused CSS Selectors

Every CSS selector in component `<style>` blocks SHALL target active HTML elements in the template or be scoped with global modifiers appropriately.

#### Scenario: Svelte-check verifies clean component stylesheets
- **GIVEN** a component with an inline `<style>` block
- **WHEN** `svelte-check` runs with `--threshold warning`
- **THEN** zero `css_unused_selector` warnings are emitted

### Requirement: REQ-A11Y-03 Interactive Elements Keyboard and ARIA Accessibility

Interactive click targets SHALL be semantic button elements or static elements equipped with an appropriate ARIA role and keyboard event listeners (`onkeydown`).

#### Scenario: Svelte-check verifies keyboard accessibility
- **GIVEN** a modal backdrop or clickable interactive card
- **WHEN** `svelte-check` runs with `--threshold warning`
- **THEN** zero `a11y_click_events_have_key_events` and zero `a11y_no_static_element_interactions` warnings are emitted
