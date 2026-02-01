import { writable, derived } from 'svelte/store';

export interface SSEConnectionState {
  isConnected: boolean;
	isConnecting: boolean;
  error: string | null;
  lastMessageTime: Date | null;
  reconnectAttempts: number;
	maxReconnectAttempts: number;
  reconnectDelay: number;
}

export interface ProcessingEvent {
  stage: 'imagemagick' | 'esrgan' | 'sam' | 'granite_docling' | 'tesseract_fallback';
  status: string;
	page: number;
  pages_total: number;
	percent: number;
  eta: number;
	details: string;
  timestamp: string;
  confidence?: number;
}

const initialState: SSEConnectionState = {
  isConnected: false,
  isConnecting: false,
  error: null,
  lastMessageTime: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
};

function createSSEStatusStore() {
  const { subscribe, set, update } = writable<SSEConnectionState>(initialState);
  let eventSource: EventSource | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  function reconnect(endpoint: string, token?: string) {
    update((state) => {
      if (state.reconnectAttempts >= state.maxReconnectAttempts) {
        return {
          ...state,
          error: 'Max reconnection attempts reached',
        };
      }

      const delay = state.reconnectDelay * Math.pow(2, state.reconnectAttempts);
      console.log(
        `[SSE] Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts + 1}/${state.maxReconnectAttempts})`
      );

      reconnectTimeout = setTimeout(() => {
        const store = createSSEStatusStore();
        store.connect(endpoint, token).catch((error) => {
          console.error('[SSE] Reconnection failed:', error);
        });
      },
	delay);

      return {
        ...state,
        reconnectAttempts: state.reconnectAttempts + 1,
        isConnecting: true,
      };
    });
  }

  return {
    subscribe,

    connect: async (endpoint: string, token?: string) => {
      update((state) => ({ ...state, isConnecting: true, error: null }));

      try {
        eventSource = new EventSource(endpoint);

        eventSource.addEventListener('open', () => {
          update((state) => ({
            ...state,
            isConnected: true,
            isConnecting: false,
            error: null,
            reconnectAttempts: 0,
          }));
          console.log('[SSE] Connected to document processing stream');
        });

        eventSource.addEventListener('error', () => {
          update((state) => ({
            ...state,
            isConnected: false,
            isConnecting: false,
            error: 'Connection lost',
          }));
          reconnect(endpoint, token);
        });

        return eventSource;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        update((state) => ({
          ...state,
          isConnecting: false,
          error: errorMessage,
        }));
        console.error('[SSE] Connection failed:', error);
        throw error;
      }
    },
	on: (eventType: string, callback: (event: ProcessingEvent) => void) => {
      if (!eventSource) {
        console.warn('[SSE] EventSource not initialized');
        return;
      }

      eventSource.addEventListener(eventType, (event: Event) => {
        try {
          const customEvent = event as MessageEvent;
          const data = JSON.parse(customEvent.data) as ProcessingEvent;
          update((state) => ({ ...state, lastMessageTime: new Date() }));
          callback(data);
        } catch (error) {
          console.error(`[SSE] Error parsing ${eventType} event:`, error);
        }
      });
    },
	onMessage: (callback: (event: ProcessingEvent) => void) => {
      if (!eventSource) {
        console.warn('[SSE] EventSource not initialized');
        return;
      }

      eventSource.addEventListener('message', (event: Event) => {
        try {
          const customEvent = event as MessageEvent;
          const data = JSON.parse(customEvent.data) as ProcessingEvent;
          update((state) => ({ ...state, lastMessageTime: new Date() }));
          callback(data);
        } catch (error) {
          console.error('[SSE] Error parsing message event:', error);
        }
      });
    },
	disconnect: () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      update((state) => ({
        ...state,
        isConnected: false,
        isConnecting: false,
        error: null,
      }));
      console.log('[SSE] Disconnected from stream');
    },
	clearError: () => {
      update((state) => ({ ...state, error: null }));
    },
	reset: () => {
      set(initialState);
    },
	};
}

export const sseStatusStore = createSSEStatusStore();

export const isConnected = derived(sseStatusStore, ($state) => $state.isConnected);
export const connectionError = derived(sseStatusStore, ($state) => $state.error);
export const connectionStatus = derived(sseStatusStore, ($state) => {
  if ($state.isConnected) return 'Connected';
  if ($state.isConnecting) return 'Connecting...';
  if ($state.error) return `Error: ${$state.error}`;
  return 'Disconnected';
});
