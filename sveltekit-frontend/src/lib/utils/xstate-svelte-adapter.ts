// XState Svelte 5 Adapter
// Provides useMachine hook compatible with Svelte 5 runes

import { createActor, type StateMachine } from 'xstate';

export function useMachine(machine: StateMachine<any, any>) {
  const actor = createActor(machine);
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
