# Superforms + XState — Integration Guide

This document shows a practical pattern for integrating a Superforms-managed SvelteKit form with an
XState state machine. The goal is to keep validation and persistence responsibilities with
Superforms while using XState to model UX states (idle, editing, submitting, success, error).

Key ideas

- Keep Superforms as the single source of truth for form values & validation.
- Use XState to model UX transitions and submission lifecycle.
- Wire events between the form store and the machine (subscribe/send).

---

## Architecture overview

- Server: Superforms performs schema validation and returns form object in `load`/actions.
- Client: Superforms exposes a Svelte store for the form data/validation.
- XState machine: contains UX states (editing, readyToSubmit, submitting, success, failure).
- The Svelte component subscribes to the Superforms store and sends events to the machine; the
  machine can trigger submission effects (fetch/fetch action) and react to responses.

---

## Example files

Note: replace import paths with your exact Superforms / XState utilities.

### 1) Machine (src/lib/machines/formMachine.ts)

```ts
import { createMachine, assign } from 'xstate';

type Context<FormData> = {
  form: FormData | null; // latest form values
  error?: string | null;
};

type Events<FormData> =
  | { type: 'SET_FORM'; form: FormData }
  | { type: 'SUBMIT' }
  | { type: 'SUCCESS' }
  | { type: 'FAILURE'; error: string };

export const createFormMachine = <TForm>() =>
  createMachine<Context<TForm>, Events<TForm>>(
    {
      id: 'superform',
      initial: 'idle',
      context: { form: null, error: null },
      states: {
        idle: {
          on: { SET_FORM: { actions: 'assignForm' }, SUBMIT: 'submitting' },
        },
        editing: {
          on: { SET_FORM: { actions: 'assignForm' }, SUBMIT: 'submitting' },
        },
        submitting: {
          entry: 'clearError',
          invoke: {
            src: 'submitForm', // implemented in options
            onDone: { target: 'success', actions: 'onSuccess' },
            onError: { target: 'failure', actions: 'onFailure' },
          },
        },
        success: {
          on: { SET_FORM: { actions: 'assignForm' } },
        },
        failure: {
          on: {
            SET_FORM: { actions: 'assignForm' },
            SUBMIT: 'submitting',
          },
        },
      },
      on: {
        // allow updating the form while not explicitly in states above
        SET_FORM: { actions: 'assignForm' },
      },
    },
    {
      actions: {
        assignForm: assign((ctx, ev: any) => ({ ...ctx, form: ev.form })),
        clearError: assign({ error: (_) => null }),
        onSuccess: assign({ error: (_) => null }),
        onFailure: assign({ error: (_ctx, ev: any) => ev.data?.message || String(ev) }),
      },
      services: {
        // `submitForm` must be provided by the component/interpret call
      },
    }
  );
```

### 2) Server route (src/routes/api/submit/+server.ts)

This demonstrates submitting to the server; on SvelteKit, use Superforms to validate in an action.

```ts
// Pseudocode outline — adapt to your Superforms setup
import { json } from '@sveltejs/kit';
import { validateWithSuperforms } from 'your-superforms-server-lib';

export async function POST({ request }) {
  const payload = await request.json();

  // validate via Superforms server utility (schema + parsing)
  const result = await validateWithSuperforms(payload);

  if (!result.valid) {
    return json({ ok: false, errors: result.errors }, { status: 400 });
  }

  // perform persistence / business logic
  await saveToDb(result.data);

  return json({ ok: true });
}
```

### 3) Svelte component integration (src/routes/+page.svelte)

- Subscribe to Superforms client store.
- Create/interpret the XState machine and supply a submit service that posts to the server.
- Send SET_FORM events on input changes; call SUBMIT to start submitting.

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { interpret } from 'xstate';
  import { createFormMachine } from '$lib/machines/formMachine';
  import { superform } from 'your-superforms-client-lib'; // the store provided by Superforms

  // create machine and interpreter
  const machine = createFormMachine<Record<string, any>>();
  const service = interpret(machine, {
    services: {
      submitForm: async (ctx) => {
        // ctx.form contains latest data from machine context
        const res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(ctx.form),
        });
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({}));
          throw new Error(errorBody?.message || 'Submission failed');
        }
        return await res.json();
      },
    },
  }).start();

  onDestroy(() => service.stop());

  // subscribe to the Superforms store
  let formValue;
  const unsubscribe = superform.subscribe(($form) => {
    formValue = $form;
    // mirror the latest form into the machine
    service.send({ type: 'SET_FORM', form: $form.data ?? $form.values ?? $form });
  });

  onDestroy(unsubscribe);

  // derived state for UI
  $: state = service.state;

  function submit() {
    // optionally call superforms client method to run client-side prevalidation
    // then kick off machine submission
    service.send({ type: 'SUBMIT' });
  }
</script>

<form on:submit|preventDefault={submit}>
  <!-- Example input bound to Superforms store -->
  <input
    value={formValue?.data?.name ?? ''}
    on:input={(e) => {
      const newData = { ...(formValue?.data || {}), name: e.target.value };
      // update superforms store (API varies by library)
      superform.update((f) => ({ ...f, data: newData }));
      // send updated form to machine
      service.send({ type: 'SET_FORM', form: { ...formValue, data: newData } });
    }}
  />

  <button type="submit" disabled={state.matches('submitting')}>Submit</button>

  {#if state.matches('failure')}
    <div class="error">{state.context.error}</div>
  {/if}
  {#if state.matches('success')}
    <div class="success">Saved!</div>
  {/if}
</form>
```

---

## Integration tips & best practices

- Do not duplicate validation logic: let Superforms validate schema (server & optional client), and
  use XState only for UX flow and request orchestration.
- Keep machine context minimal: store a shallow copy of form values or a pointer. For big forms
  prefer referencing the Superforms store rather than copying entire payloads repeatedly.
- Use optimistic UI carefully: XState can model optimistic updates (transition to success
  immediately) but ensure server reconciliation on failure.
- Keep submission logic inside machine services to keep lifecycle predictable and testable.
- When updating form values from the machine, prefer pushing updates into the Superforms store, not
  the other way around. The machine should mirror the store, not own it.

---

This pattern keeps validation and data handling in Superforms while leveraging XState for explicit
UX states and side-effect orchestration. Adapt APIs and helpers to match the exact Superforms
package you use.
