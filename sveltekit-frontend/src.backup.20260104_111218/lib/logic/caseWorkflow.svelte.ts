import { createActor, setup } from 'xstate';

// 1. Define the State Machine
const machine = setup({
    types: { context: {} as { id: string }, events: {} as { type: 'SUBMIT' } | { type: 'REJECT' } | { type: 'APPROVE' } }
}).createMachine({
    id: 'legalCase',
    initial: 'drafting',
    states: {
        drafting: { on: { SUBMIT: 'review' } },
        review: { on: { REJECT: 'drafting', APPROVE: 'approved' } },
        approved: { type: 'final' }
    }
});

// 2. The Reactive Wrapper
export class CaseManager {
    // The "snapshot" is the reactive part the UI listens to
    state = $state() as any;
    private actor;

    constructor() {
        this.actor = createActor(machine);
        this.actor.subscribe((s) => this.state = s); // Sync XState -> Svelte Runes
        this.actor.start();
    }

    get isLocked() {
        return this.state.matches('review') || this.state.matches('approved');
    }

    submit() { this.actor.send({ type: 'SUBMIT' }); }
    reject() { this.actor.send({ type: 'REJECT' }); }
    approve() { this.actor.send({ type: 'APPROVE' }); }
}
