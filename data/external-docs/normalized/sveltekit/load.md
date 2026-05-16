### Loading Data
Before a component is rendered, SvelteKit allows you to fetch data using load functions defined in +page or +layout files.

* **Data Availability**: Data returned from a load function is accessible via the data prop in the corresponding .svelte file.
* **Universal vs. Server**:
    * Universal load (+page.js): Runs on the server during the initial request and in the browser during subsequent navigations.
    * Server load (+page.server.js): Always runs on the server. Useful for sensitive operations.
* **Fetch Requests**: Use the SvelteKit-provided fetch (passed as an argument to load) to perform requests. It supports relative URLs and preserves cookies/headers during SSR.
* **Redirects and Errors**: You can use the redirect() and error() helpers to control flow during the loading phase.
* **Parent Data**: Child load functions can access data from their parent layouts using await parent().