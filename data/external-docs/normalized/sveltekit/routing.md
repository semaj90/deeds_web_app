### Routing
SvelteKit uses a filesystem-based router where the structure of your src/routes directory defines your application's URLs.

* **+page**:
    * +page.svelte: Defines the UI of a page.
    * +page.js: A universal file that can export a load function running on both server and client.
    * +page.server.js: A server-only file for load functions that require private credentials or database access.
* **+layout**:
    * +layout.svelte: Defines UI that wraps child pages and nested layouts (e.g., navbars, footers).
    * +layout.js / +layout.server.js: Used to load data that is shared across multiple pages.
* **+error**:
    * +error.svelte: A component shown when an error occurs during data loading or rendering.
* **+server**:
    * +server.js: Defines API routes (endpoints) for HTTP methods like GET, POST, PUT, and DELETE.
* **Dynamic Parameters**: Use brackets like [slug] in directory names to create dynamic route segments.