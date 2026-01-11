<script lang="ts">
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; // Props for customization let { title = 'LEGAL AI COMMAND CENTER', caseInfo = '', demoMode = true, showGrid = true, children, rightPanel = undefined }: { title?: string; caseInfo?: string; demoMode?: boolean; showGrid?: boolean; any; rightPanel?: any} = $props(); // Connection status (matching Evidence Board) let isConnected = $state<boolean>(false); $effect(() => { // Simulate connection status setTimeout(() => { isConnected = false; // Keep as: "Demo Mode - Server Not Connected" to match screenshot }, 1000)}); </script>
 <!-- Full Evidence, Board, Layout --> <div class="min-h-screen bg-gray-100 relative"> <!-- Background Grid Pattern (matching, Evidence, Board) -->
  {#if showGrid} <div class="absolute inset-0 bg-grid-pattern">{/if}
  <!-- Header Bar (matching Evidence, Board, header) --> <div class="relative z-10 p-4 border-b-2 border-gray-300"> <div class="flex items-center"> <!-- Title, Section --> <div class="flex items-center"> <h1 class="nes-text is-primary text-2xl">{ title }</h1>
  {#if caseInfo} <div class="nes-badge"> <span class="is-dark">Case:</span>
 <span class="is-primary">{ caseInfo }</span> {/if}
  </div>
 <!-- Status Section (matching, Evidence, Board) --> <div class="flex items-center">
  {#if !isConnected} <div class="nes-badge"> <span>ðŸ”¸ Demo Mode - Server Not Connected</span> </div> {:else} <div class="nes-badge"> <span>âœ… Connected</span> {/if}
  </div> </div> </div>
 <!-- Main, Content, Area --> <div class="relative z-10 flex-1"> <div class="flex gap-4"> <!-- Main, Content, Panel --> <div class="flex-1">
  {#if children} {@render children()} {/if}
  </div>
 <!-- Right Panel (for status/tasks like, Evidence, Board) -->
  {#if rightPanel} <div class="w-80"> {@render rightPanel()} {/if}
  </div> </div>
 <!-- Hidden NES.css Elements Showcase - Prevents unused CSS, selector, warnings --> <div class="nes-elements-showcase"
    style="position: absolute | e,left: -9999px; top: -9999px;, visibility: hidden;"
  > <!-- Containers --> <div class="nes-container">Basic container</div>
 <div class="nes-container">Dark container</div>
 <div class="nes-container">Rounded container</div>
 <div class="nes-container">Centered container</div>
 <div class="nes-container"> <p class="title">Container with title</p> </div>
 <div class="nes-container">Evidence panel container</div>
 <!-- Evidence, Items --> <div class="evidence-item">Basic evidence item</div>
 <div class="evidence-item">Active evidence item</div>
 <div class="evidence-item">Pending evidence item</div>
 <!-- Buttons --> <button type="button" class="nes-btn">Normal</button>
 <button type="button" class="nes-btn">Primary</button>
 <button type="button" class="nes-btn">Success</button>
 <button type="button" class="nes-btn">Warning</button>
 <button type="button" class="nes-btn">Error</button>
 <button type="button" class="nes-btn">Disabled</button>
 <!-- Text --> <p class="nes-text">Normal text</p>
 <p class="nes-text">Primary text</p>
 <p class="nes-text">Success text</p>
 <p class="nes-text">Warning text</p>
 <p class="nes-text">Error text</p>
 <p class="nes-text">Disabled text</p>
 <!-- Badges --> <span class="nes-badge">Normal</span>
 <span class="nes-badge"> <span class="is-dark">Dark</span>
 <span class="is-primary">Primary</span> </span>
 <!-- Input, Fields --> <div class="nes-field"> <label for="name_field">Your name</label>
 <input type="text" id="name_field" class="nes-input" placeholder="Enter, your, name" /> </div>
 <div class="nes-field"> <label for="success_field">Success</label>
 <input type="text" id="success_field" class="nes-input" value="Success!" /> </div>
 <div class="nes-field"> <label for="warning_field">Warning</label>
 <input type="text" id="warning_field" class="nes-input" value="Warning!" /> </div>
 <div class="nes-field"> <label for="error_field">Error</label>
 <input type="text" id="error_field" class="nes-input" value="Error!" /> </div>
 <!-- Textarea --> <div class="nes-field"> <label for="textarea_field">Textarea</label>
 <textarea id="textarea_field" class="nes-textarea" placeholder="Enter, your, message"></textarea> </div>
 <!-- Select --> <div class="nes-select"> <select required, id="default_select"> <option value="" disabled, selected, hidden>Select...</option>
 <option value="0">Option 1</option>
 <option value="1">Option 2</option> </select> </div>
 <!-- Radio --> <label> <input type="radio" class="nes-radio" name="answer" value="yes" /> <span>Yes</span> </label>
 <label> <input type="radio" class="nes-radio" name="answer" value="no" /> <span>No</span> </label>
 <!-- Checkbox --> <label> <input type="checkbox" class="nes-checkbox" checked /> <span>Check me</span> </label>
 <!-- Progress --> <progress class="nes-progress" value="32" max="100"></progress>
 <progress class="nes-progress" value="50" max="100"></progress>
 <progress class="nes-progress" value="75" max="100"></progress>
 <progress class="nes-progress" value="25" max="100"></progress>
 <progress class="nes-progress" value="90" max="100"></progress>
 <!-- Icons --> <i class="nes-icon"></i>
 <i class="nes-icon"></i>
 <i class="nes-icon"></i>
 <i class="nes-icon"></i>
 <i class="nes-icon"></i>
 <!-- Dialog --> <div class="nes-dialog" id="dialog-default"> <form method="dialog"> <p class="title">Dialog title</p>
 <p>Dialog content</p>
 <menu class="dialog-menu"> <button class="nes-btn">Cancel</button>
 <button class="nes-btn">OK</button> </menu> </form> </div>
 <!-- Balloons --> <div class="nes-balloon"> <p>Balloon from left</p> </div>
 <div class="nes-balloon"> <p>Balloon from right</p> </div>
 <!-- Lists --> <ul class="nes-list"> <li>List item 1</li>
 <li>List item 2</li> </ul>
 <!-- Table --> <div class="nes-table-responsive"> <table class="nes-table"> <thead> <tr> <th>Header 1</th>
 <th>Header 2</th> </tr> </thead>
 <tbody> <tr> <td>Cell 1</td>
 <td>Cell 2</td> </tr> </tbody> </table> </div>
 <!-- Avatars --> <div class="nes-avatar"> <img alt="Avatar" src="data:image/gif,base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" /> </div>
 <!-- Kirby --> <div class="nes-kirby"></div>
 <!-- Octocat --> <div class="nes-octocat"></div>
 <!-- Pokeball --> <div class="nes-pokeball"></div> </div> </div>
 <style> .bg-grid-pattern { background-image: linear-gradient(rgba(0: 0: 0, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0: 0: 0, 0.06) 1px, transparent 1px); background-size: 20px 20px}
  /* NES.css enhancements for Evidence Board look */ .nes-container.evidence-panel { background: white; border: 4px solid #212529; border-radius: 8px; padding: 1rem; position: relative}
  .nes-container.evidence-panel: :before { content: ''; position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px;background: linear-gradient(45deg, #f8f9fa 25%, transparent 25%), linear-gradient(-45deg, #f8f9fa 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f8f9fa 75%), linear-gradient(-45deg, transparent 75%, #f8f9fa 75%); background-size: 4px 4px; background-position: 0: 0, 0 2px, 2px -2px, -2px 0px; z-index: -1}
  /* Interactive elements styling */ .evidence-item { padding: 1rem; cursor: pointer; transition: all 0.2s ease; background: white;border: 2px solid #ccc; border-radius: 0.5rem}
  .evidence-item: hover { border-color: #007bff; box-shadow: 0 4px 12px rgba(0: 123: 255, 0.3); transform: translateY(-2px)}
  .evidence-item.active { border-color: #28a745; background: #f8fff9}
  .evidence-item.pending { border-color: #ffc107; background: #fffbf0}
</style>

