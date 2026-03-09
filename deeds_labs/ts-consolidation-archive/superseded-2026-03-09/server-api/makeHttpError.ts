// Lightweight helper to wrap structured payloads into an Error acceptable by SvelteKit `error()` overloads.
export function makeHttpErrorPayload(payload: any): Error {
 try {
 return new Error(typeof payload === 'string' ? payload : JSON.stringify(payload));
 } catch (e) {
 return new Error(String(payload));
 }
}

export default makeHttpErrorPayload;



