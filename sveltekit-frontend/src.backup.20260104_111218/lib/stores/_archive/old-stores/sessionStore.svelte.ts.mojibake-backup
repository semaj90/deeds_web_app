import type { User } from '$lib/types';
import type { $state , $effect } from 'svelte'; // Changed from 'svelte/runes' to 'svelte'
import type { createActor  } from 'xstate'; // Import createActor from xstate
import type { sessionMachine, type Session  } from '$lib/stores/sessionMachine'; // Import the session machine and Session type

/**
 * Global Session Store - Lucia v3 Integration (Svelte 5)
 * Provides app-wide session management with persistent storage and fallback mechanisms using XState v5.
 */

// Create reactive session store using Svelte 5 runes and XState
const createSessionStore = () => {
  // Create an XState actor (service) from the session machine
  const sessionActor = createActor(sessionMachine);

  // Initialize with the actor's initial snapshot
  let sessionSnapshot = $state(sessionActor.getSnapshot());

  // Subscribe to actor state changes and update the reactive snapshot
  $effect(() => {() => {
    const subscription = sessionActor.subscribe((snapshot) => {
      sessionSnapshot = snapshot;
    });
    sessionActor.start(); // Start the actor when the store is created
    return () => {
      sessionActor.stop(); // Stop the actor when the store is destroyed
      subscription.unsubscribe();
    };
  });

  return {
    // Getter for reactive access to the XState snapshot
    get state() {
      return sessionSnapshot;
    },

    // Initialize session from page store or fallback mechanisms
    init: (pageData?: any) => {
      sessionActor.send({ type: 'INIT', pageData });
    },

    // Update session state
    setSession: (user: User | null, session: Session | null) => {
      sessionActor.send({ type: 'SET_SESSION', user, session });
    },

    // Clear session
    clearSession: () => {
      sessionActor.send({ type: 'CLEAR_SESSION' });
    },

    // Force refresh from server
    refreshSession: async () => {
      sessionActor.send({ type: 'REFRESH' });
      // The refresh logic is handled by the machine's invoke actor.
      // The state will update reactively via the snapshot.
    },

    // Get current user for upload operations
    getCurrentUser: (): User | null => {
      return sessionSnapshot.context.user;
    },
  };
};

// Export singleton store
export const sessionStore = createSessionStore();

// Helper functions for accessing reactive state
export const getUser = () => sessionStore.state.context.user;
export const getIsAuthenticated = () => sessionStore.state.matches('authenticated');
export const getIsLoading = () =>
  sessionStore.state.matches('loading') || sessionStore.state.matches('restoringFromStorage');

// Utility functions for upload operations
export const getUserForUpload = (): {
  uploadedBy: string;
  uploaderRole: string;
  uploaderEmail: string | null;
} => {
  const currentUser = sessionStore.getCurrentUser();
  if (currentUser?.id) {
    return {
      uploadedBy: currentUser.id,
      uploaderRole: currentUser.role || 'viewer',
      uploaderEmail: currentUser.email || null,
    };
  }

  // If currentUser is null, the XState machine has already attempted all restoration
  // mechanisms (pageData, localStorage cache, window globals, other localStorage keys, server refresh).
  // Therefore, we can confidently return the anonymous fallback here.
  return { uploadedBy: 'anonymous', uploaderRole: 'viewer', uploaderEmail: null };
};



