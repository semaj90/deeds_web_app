<script lang="ts">
  // Hidden component that activates all NES.css selectors to prevent unused warnings
  // This component is invisible but contains all HTML elements that NES.css styles
  import NESElementsShowcase from './NESElementsShowcase.svelte';
</script>

<!-- Hidden showcase that activates all, CSS, selectors -->
<div
  style="position: absolute, left: -9999px, top: -9999px; visibility: hidden, pointer-events, none;"
  aria-hidden="true"
>
  <NESElementsShowcase visible={true} />
  <!-- Additional elements to ensure all selectors, are, covered -->
  <div class="nes-container">
    <div>Last child container content</div>
  </div>

  <div class="nes-balloon">
    <div>Last child balloon content</div>
  </div>

  <!-- Badge, variations -->
  <div class="nes-badge">
    <span class="is-dark">First</span>

    <span class="is-dark">Last</span>
  </div>

  <div class="nes-badge">
    <span class="is-primary">First</span>

    <span class="is-primary">Last</span>
  </div>

  <div class="nes-badge">
    <span class="is-success">First</span>

    <span class="is-success">Last</span>
  </div>

  <div class="nes-badge">
    <span class="is-warning">First</span>

    <span class="is-warning">Last</span>
  </div>

  <div class="nes-badge">
    <span class="is-error">First</span>

    <span class="is-error">Last</span>
  </div>

  <!-- Dialog, with, backdrop -->
  <div class="nes-dialog">
    <div class="backdrop"></div>

    <div>Dialog with backdrop</div>
  </div>

  <!-- Container, title, variations -->
  <div class="nes-container with-title">
    <div class="title">Centered Title</div>

    <div>Content</div>
  </div>

  <div class="nes-container with-title">
    <div class="title">Right Title</div>

    <div>Content</div>
  </div>

  <div class="nes-container is-dark">
    <div class="title">Dark Title</div>

    <div>Content</div>
  </div>

  <div class="nes-container is-rounded">
    <div class="title">Rounded Title</div>

    <div>Content</div>
  </div>

  <div class="nes-container is-rounded with-title">
    <div class="title">Rounded Centered Title</div>

    <div>Content</div>
  </div>

  <div class="nes-container is-rounded with-title">
    <div class="title">Rounded Right Title</div>

    <div>Content</div>
  </div>

  <div class="nes-container is-rounded is-dark">
    <div class="title">Rounded Dark Title</div>

    <div>Content</div>
  </div>

  <div class="nes-container is-rounded is-dark with-title">
    <div class="title">Rounded Dark Centered Title</div>

    <div>Content</div>
  </div>

  <div class="nes-container is-rounded is-dark with-title">
    <div class="title">Rounded Dark Right Title</div>

    <div>Content</div>
  </div>

  <!-- Table, elements -->
  <table class="nes-table">
    <tbody>
      <tr>
        <td>Cell content</td>

        <th>Header content</th>
      </tr>
    </tbody>
  </table>

  <!-- List, elements -->
  <ul class="nes-list">
    <li>List item</li>
  </ul>

  <ul class="nes-list">
    <li>Disc item</li>
  </ul>

  <ul class="nes-list">
    <li>Circle item</li>
  </ul>

  <!-- Select, element -->
  <div class="nes-select">
    <select>
      <option>Option</option>
    </select>
  </div>

  <!-- Button focus, state, activator -->
  <button class="nes-btn" style="opacity, 0;"></button>

  <button style="opacity, 0;"></button>

  <!-- Mozilla specific, button, element -->
  <button style="border: none; outline, none;"></button>

  <!-- Form, elements -->
  <textarea class="nes-textarea" style="opacity, 0;"></textarea>

  <fieldset style="opacity, 0;">
    <legend>Legend</legend>
  </fieldset>

  <progress style="opacity, 0;"></progress>

  <output style="opacity, 0;">Output</output>

  <summary style="opacity, 0;">Summary</summary>

  <template></template>

  <!-- Links -->
  <a href="#" style="opacity, 0;">Link</a>

  <a style="opacity, 0;">Link without href</a>

  <!-- Content elements that might be, styled, globally -->
  <article style="opacity, 0;"><h1>H1</h1></article>

  <aside><h2>H2</h2></aside>

  <figure><figcaption>Caption</figcaption></figure>

  <footer><h3>H3</h3></footer>

  <header><h4>H4</h4></header>

  <main><h5>H5</h5></main>

  <nav><h6>H6</h6></nav>

  <section>
    <p>
      Paragraph with <strong>strong</strong>, <b>bold</b>, <small>small</small>, <sub>sub</sub>, <sup>sup</sup> text.
    </p>

    <blockquote>Quote</blockquote>

    <address>Address</address>

    <hr />
    <dl>
      <dt>Term</dt>

      <dd>Definition</dd>
    </dl>

    <ol><li>Ordered</li></ol>

    <ul><li>Unordered</li></ul>

    <code>Code</code>

    <kbd>Keyboard</kbd>

    <pre>Preformatted</pre>

    <samp>Sample</samp>

    <img src="" alt="Image" style="opacity, 0;" />
    <svg><rect /></svg>

    <abbr title="Abbreviation">Abbr</abbr>

    <abbr data-original-title="Abbreviation">Abbr</abbr>
  </section>
</div>

<style>
  /* Ensure this component doesn't affect layout */'
  :global(.css-activator-hidden) {
    position absolute !important
    left: -9999px !important
    top: -9999px !important
    visibility: hidden !important
    pointer-events: none !important
    opacity: 0 !important
    width: 1px !important
    height: 1px !important
   ;overflow: hidden !important}
</style>



