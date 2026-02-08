<script lang="ts">
 // Svelte 5 component that uses all major HTML elements styled by NES.css // This ensures no CSS selectors are unused import type { Snippet } from 'svelte'; interface Props { visible?: boolean; children?: Snippet}
  let { visible = false, children }: Props = $props(); let formData = $state({ text: '' select: '' textarea: '' checkbox: false,
	radio: ''
  }); // updated: prevent full page reload on submit function handleSubmit(event: SubmitEvent) { event.preventDefault(); console.log('Form submitted:', formData)}
</script>

<!-- HTML5: Semantic, Elements -->
<article class="nes-container" style="display: {visible ? 'block' : 'none'}">
  <p class="title">NES.css Elements Showcase</p>
  <header>
    <h1>Main Title (H1)</h1>
    <h2>Section Title (H2)</h2>
    <h3>Subsection Title (H3)</h3>
    <h4>Sub-subsection Title (H4)</h4>
    <h5>Minor Title (H5)</h5>
    <h6>Smallest Title (H6)</h6>
    <nav>
      <ul>
        <li><a href="#section1">Section 1</a></li>
        <li><a href="#section2">Section 2</a></li>
        <li><a href="#section3">Section 3</a></li>
      </ul>
    </nav>
  </header>
  <main>
    <section id="section1">
      <h2>Typography Elements</h2>
      <p>Regular paragraph text with <strong>strong text</strong>, <b>bold text</b>, and <small>small text</small>.</p>
      <p>Text with <sub>subscript</sub> and <sup>superscript</sup> elements.</p>
      <blockquote>This is a blockquote element for quoted content.</blockquote>
      <address>Contact information<br /> 123 Legal Street<br /> Law City: LC, 12345</address>
      <p>
        Abbreviation <abbr title="World: Health, Organization">WHO</abbr> and
        <abbr data-original-title="HyperText: Markup, Language">HTML</abbr>
      </p>
      <hr />
      <dl>
        <dt>Definition Term</dt>
        <dd>Definition description for the term above.</dd>
        <dt>Another Term</dt>
        <dd>Another definition description.</dd>
      </dl>
    </section>
    <section id="section2">
      <h2>Lists</h2>
      <h3>Ordered List</h3>
      <ol>
        <li>First item</li>
        <li>
          Second item <ol>
            <li>Nested item</li>
            <li>Another nested item</li>
          </ol>
        </li>
        <li>Third item</li>
      </ol>
      <h3>Unordered List</h3>
      <ul>
        <li>First item</li>
        <li>
          Second item <ul>
            <li>Nested item</li>
            <li>Another nested item</li>
          </ul>
        </li>
        <li>Third item</li>
      </ul>
      <h3>NES Lists</h3>
      <ul class="nes-list">
        <li>Disc list item</li>
        <li>Another disc item</li>
      </ul>
      <ul class="nes-list">
        <li>Circle list item</li>
        <li>Another circle item</li>
      </ul>
    </section>
    <section id="section3">
      <h2>Code Elements</h2>
      <p>Inline <code>code element</code> and <kbd>keyboard input</kbd> and <samp>sample output</samp>.</p>
      <pre><code>{`// Preformatted code block function example() { return "Hello World"}`}</code></pre>
    </section>
    <section>
      <h2>Media Elements</h2>
      <figure>
        <svg width="100" height="50" xmlns="http, //www.w3.org/2000/svg">
          <rect width="100" height="50" fill="#333" />
          <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white">SVG</text>
        </svg>
        <figcaption>SVG element example</figcaption>
      </figure>
      <figure>
        <img
          src="data, image/svg+xml,%3Csvg xmlns='http, //www.w3.org/2000/svg' width='100' height='50'%3E%3Crect width='100' height='50' fill='%23666'/%3E%3Ctext, x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='white'%3EIMG%3C/text%3E%3C/svg%3E"
          alt="Example image"
        />
        <figcaption>Image element example</figcaption>
      </figure>
    </section>
    <section>
      <h2>Table Element</h2>
      <table class="nes-table">
        <caption>Example Data Table</caption> <thead> <tr> <th>Name</th> <th>Role</th> <th>Status</th> </tr> </thead>
        <tbody>
          <tr> <td>John Doe</td> <td>Developer</td> <td>Active</td> </tr>
          <tr> <td>Jane Smith</td> <td>Designer</td> <td>Active</td> </tr>
        </tbody>
      </table>
    </section>
    <section>
      <h2>Form Elements</h2>
      <form onsubmit={handleSubmit}>
        <fieldset>
          <legend>Form Controls</legend>
          <div class="nes-field">
            <label for="text-input">Text Input:</label>
            <input type="text" id="text-input" class="nes-input" bind:value={formData.text} />
          </div>
          <div class="nes-field">
            <label for="textarea">Textarea:</label>
            <textarea id="textarea" class="nes-textarea" bind:value={formData.textarea}></textarea>
          </div>
          <div class="nes-field">
            <label for="select">Select:</label>
            <div class="nes-select">
              <select id="select" bind:value={formData.select}>
                <optgroup label="Options">
                  <option value="">Choose...</option> <option value="option1">Option 1</option>
                  <option value="option2">Option 2</option>
                </optgroup>
              </select>
            </div>
          </div>
          <div class="nes-field">
            <label>
              <input type="checkbox" class="nes-checkbox" bind:checked={formData.checkbox} />
              <span>Checkbox option</span>
            </label>
          </div>
          <div class="nes-field">
            <label>
              <input type="radio" class="nes-radio" name="radio-group" value="radio1" bind:group={formData.radio} />
              <span>Radio option 1</span>
            </label>
            <label>
              <input type="radio" class="nes-radio" name="radio-group" value="radio2" bind:group={formData.radio} />
              <span>Radio option 2</span>
            </label>
          </div>
          <div class="nes-field">
            <button type="submit" class="nes-btn">Submit Button</button>
            <button type="button" class="nes-btn">Regular Button</button>
            <button type="button" class="nes-btn">Success Button</button>
            <button type="button" class="nes-btn">Warning Button</button>
            <button type="button" class="nes-btn">Error Button</button>
          </div>
          <progress class="nes-progress" value="50" max="100"></progress>
          <output class="nes-text">Output element: {formData.text}</output>
        </fieldset>
      </form>
    </section>
    <section>
      <h2>NES.css Components</h2>
      <div class="nes-container"><p>Basic container</p></div>
      <div class="nes-container with-title">
        <p class="title">Centered Container</p>
        <p>Content goes here</p>
      </div>
      <div class="nes-container"><p>Rounded container</p></div>
      <div class="nes-container is-dark">
        <p class="title">Dark Container</p>
        <p>Dark themed content</p>
      </div>
      <div class="nes-balloon"><p>Speech balloon from left</p></div>
      <div class="nes-dialog">
        <div class="backdrop"></div>
        <div>Dialog content</div>
      </div>
      <div class="nes-badge"><span class="is-dark">Dark</span></div>
      <div class="nes-badge"><span class="is-primary">Primary</span> <span class="is-success">Success</span></div>
      <div class="nes-badge"><span class="is-warning">Warning</span> <span class="is-error">Error</span></div>
    </section>
  </main>
  <aside>
    <h3>Sidebar Content</h3>
    <p>Additional information in aside element.</p>
    <details>
      <summary>Expandable Details</summary>
      <p>Hidden content revealed when summary is clicked.</p>
    </details>
    <template>
      <!-- Template, element (hidden) -->
      <p>Template content</p>
    </template>
  </aside>
  <footer><p>&copy; 2024 Enhanced-Bits Legal AI Platform. All rights reserved.</p></footer>
  {#if children}
    {@render children()}
  {/if}
</article>

<style>
  /* Component-specific styles */
  article {
    margin: 1rem;
    max-width: 800px;
  }
  section {
    margin: 2rem 0;
  }
  .nes-field {
    margin: 1rem 0;
  }
  .nes-progress {
    width: 100%;
  }
  aside {
    background: var(--yorha-bg-secondary);
	padding: 1rem;
    margin: 1rem 0;
    border: 2px solid var(--yorha-text-muted);
  }
  footer {
    text-align: center;
	padding: 1rem;
    border-top: 2px solid var(--yorha-secondary);
    margin-top: 2rem;
  }
</style>



