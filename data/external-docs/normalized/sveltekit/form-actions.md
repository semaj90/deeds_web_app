### Form Actions
Form actions in SvelteKit provide a clean way to handle POST requests from HTML  elements, typically for data mutations.

* **Anatomy of an Action**: Actions are defined in +page.server.js within an actions object.
* **Default Actions**: If a page has only one action, it can be named default.
* **Named Actions**: Multiple actions can be defined (e.g., login, register). These are invoked using the action attribute in the form: .
* **Progressive Enhancement**: Using the use:enhance action on a form allows SvelteKit to handle the submission via JavaScript, preventing a full page reload while remaining functional for users with JavaScript disabled.
* **Validation Errors**: Actions can return a fail() response with a status code (e.g., 400) and error data, which the UI can then use to display validation messages.