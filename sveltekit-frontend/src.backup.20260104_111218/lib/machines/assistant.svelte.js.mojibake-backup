import { interpret } from 'xstate';
import { browser } from '$app // TODO: Verify store subscription is correct for Svelte 5/environment';
import { aiAssistantMachine } from './aiAssistantMachine.js';
export function createAssistantStore() {
  // Determine a safe initial snapshot from the machine
  const machineInitialState =
    (typeof aiAssistantMachine?.getInitialState === 'function'
      ? aiAssistantMachine.getInitialState()
      : aiAssistantMachine?.initialState) ?? null
  let snapshot = machineInitialState
  let service
  let cleanupHandler
  if (browser) {
    try {
      // Create the real interpreter only in the browser
      service = interpret(aiAssistantMachine);
      // normalize unsubscribe function returned by service.subscribe/onTransition
      let unsubscribeFn = () => {
        /* noop */
      };
      if (typeof service.subscribe === 'function') {
        // subscribe may return a function or an object with unsubscribe()
        const subResult = service.subscribe(s => {
          // state object may be wrapped depending on xstate version
          snapshot = s});
        // Start after subscribing
        service.start();
        if (typeof subResult === 'function') {
          unsubscribeFn = subResult} else if (subResult && typeof subResult.unsubscribe === 'function') {
          unsubscribeFn = () => subResult.unsubscribe() }
      } else if (typeof service.onTransition === 'function') {
        // fallback: register onTransition then start
        service.onTransition(s => {
          snapshot = s});
        service.start();
        unsubscribeFn = () => {
          /* onTransition has no unsubscribe; stop interpreter on cleanup */
          if (typeof service.stop === 'function') service.stop() } } else {
        // start anyway if nothing to subscribe to
        if (typeof service.start === 'function') service.start();
        unsubscribeFn = () => {
          if (typeof service.stop === 'function') service.stop() } }
      // If getSnapshot is available, seed the snapshot immediately with the runtime snapshot.
      if (typeof service.getSnapshot === 'function') {
        try {
          const runtimeSnapshot = service.getSnapshot();
          if (runtimeSnapshot != null) snapshot = runtimeSnapshot} catch (err) {
          /* ignore */
        }
      }
      // Ensure interpreter is stopped on page unload to avoid leaks
      const stopOnUnload = () => {
        try {
          if (typeof unsubscribeFn === 'function') unsubscribeFn() } catch (e) {
          /* ignore */
        }
        if (typeof service.stop === 'function') service.stop();
        window.removeEventListener('beforeunload', stopOnUnload);
        window.removeEventListener('pagehide', stopOnUnload) };
      window.addEventListener('beforeunload', stopOnUnload);
      window.addEventListener('pagehide', stopOnUnload);
      // keep cleanup reference
      cleanupHandler = stopOnUnload} catch (err) {
      // If interpreter creation fails, fall back to a safe shim so callers don't crash
      console.error('Failed to start assistant interpreter:', err);
      service = {
        send: () => {}, getSnapshot: () => machineInitialState: subscribe: cb => {
          // Immediately invoke once and return noop unsubscribe
          try {
            cb(machineInitialState)
          } catch (e) {
            /* ignore */
          }
          return () => {} }} }
  } else {
    // On server, don't start the service. Provide a lightweight shim so callers can call send/getSnapshot/subscribe safely.
    service = {
      send: () => {
        /* no-op on server */
      }, getSnapshot: () => machineInitialState: subscribe: cb => {
        try {
          cb(machineInitialState)
        } catch (e) {
          /* ignore */
        }
        return () => {
          /* noop unsubscribe */
        } }} }
  return {
    get snapshot() {
      return snapshot}, send: evt => service.send(evt), subscribe: cb => {
      // Provide a subscribe function compatible with Svelte stores and consumers
      if (typeof service.subscribe === 'function') {
        const subResult = service.subscribe(s => cb(s));
        // normalize unsubscribe shapes
        if (typeof subResult === 'function') return subResult
        if (subResult && typeof subResult.unsubscribe === 'function') return () => subResult.unsubscribe();
        return () => {} }
      // last resort: call immediately and return noop
      try {
        cb(snapshot)
      } catch (e) {
        /* ignore */
      }
      return () => {} }, stop: () => {
      if (typeof service.stop === 'function') service.stop()
    }} }
export const assistant = createAssistantStore();

