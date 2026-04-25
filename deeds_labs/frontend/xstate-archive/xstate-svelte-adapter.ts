// XState Svelte 5 Adapter
// Provides useMachine hook compatible with Svelte 5 runes

import { createActor, type AnyStateMachine } from 'xstate';

export function useMachine(machine: AnyStateMachine) {
  const actor = createActor(machine as any);
  actor.start();

  // Create a simple state store with subscribe method
  const state$ = {
    subscribe: (run: (snapshot: any) => void) => {
      run(actor.getSnapshot());
      const subscription = actor.subscribe((snapshot) => {
        run(snapshot);
      });
      return () => subscription.unsubscribe();
    }
  };

  const send = (event: any) => actor.send(event);

  return {
    state$,
    send,
    actor
  };
}
