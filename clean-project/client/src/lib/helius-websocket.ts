import { create } from 'zustand';
import { Connection, PublicKey } from '@solana/web3.js';

// Constants
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY;
const HELIUS_WS_URL = `${import.meta.env.VITE_HELIUS_WS_URL}/?api-key=${HELIUS_API_KEY}`;
const HELIUS_REST_URL = import.meta.env.VITE_HELIUS_REST_URL;
const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;

// TypeScript Interfaces
interface HeliusStore {
  isConnected: boolean;
  subscribedTokens: Set<string>;
  solPrice: number;
  setConnected: (connected: boolean) => void;
  subscribeToToken: (tokenAddress: string) => void;
  setSolPrice: (price: number) => void;
}

let ws: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;

export const useHeliusStore = create<HeliusStore>((set, get) => ({
  isConnected: false,
  subscribedTokens: new Set(),
  solPrice: 0,
  setConnected: (connected) => set({ isConnected: connected }),
  setSolPrice: (price) => set({ solPrice: price }),
  subscribeToToken: (tokenAddress) => {
    if (!HELIUS_API_KEY) {
      console.error('[Helius] API key not found in environment variables');
      return;
    }

    // Validate token address
    try {
      new PublicKey(tokenAddress);
    } catch (error) {
      console.error('[Helius] Invalid token address:', tokenAddress);
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log('[Helius] WebSocket not ready, queueing subscription');
      // Queue subscription for when connection is ready
      const store = get();
      store.subscribedTokens.add(tokenAddress);
      set({ subscribedTokens: new Set(store.subscribedTokens) });

      if (!ws) {
        console.log('[Helius] Initializing connection...');
        initializeHeliusWebSocket();
      }
      return;
    }

    console.log('[Helius] Subscribing to:', tokenAddress);

    const subscribeMessage = {
      jsonrpc: '2.0',
      id: `token-sub-${tokenAddress}`,
      method: 'accountSubscribe',
      params: [
        tokenAddress,
        {
          encoding: 'jsonParsed',
          commitment: 'confirmed'
        }
      ]
    };

    try {
      ws.send(JSON.stringify(subscribeMessage));
      console.log('[Helius] Subscription request sent for:', tokenAddress);
    } catch (error) {
      console.error('[Helius] Subscription error:', error);
    }
  }
}));

async function updateSolPrice() {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
    const data = await response.json();
    useHeliusStore.getState().setSolPrice(parseFloat(data.price));
    console.log('[Helius] Updated SOL price:', data.price);
  } catch (error) {
    console.error('[Helius] Error updating SOL price:', error);
  }
}

function startHeartbeat() {
  const heartbeatInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 'heartbeat', method: 'ping' }));
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30000);

  return heartbeatInterval;
}

export function initializeHeliusWebSocket() {
  if (typeof window === 'undefined') {
    console.error('[Helius] Not in browser environment');
    return;
  }

  if (!HELIUS_API_KEY) {
    console.error('[Helius] API key not found in environment variables');
    return;
  }

  try {
    if (ws) {
      console.log('[Helius] Closing existing WebSocket connection');
      ws.close();
      ws = null;
    }

    console.log('[Helius] Initializing WebSocket...');
    ws = new WebSocket(HELIUS_WS_URL);

    const heartbeatInterval = startHeartbeat();

    ws.onopen = () => {
      console.log('[Helius] Connected');
      useHeliusStore.getState().setConnected(true);
      reconnectAttempts = 0;

      // Start SOL price updates
      updateSolPrice();
      const priceInterval = setInterval(updateSolPrice, 10000);

      // Resubscribe to tokens
      const store = useHeliusStore.getState();
      if (store.subscribedTokens.size > 0) {
        console.log('[Helius] Resubscribing to tokens:', Array.from(store.subscribedTokens));
        store.subscribedTokens.forEach(tokenAddress => {
          store.subscribeToToken(tokenAddress);
        });
      }

      // Cleanup interval on close
      ws!.addEventListener('close', () => {
        clearInterval(priceInterval);
        clearInterval(heartbeatInterval);
      });
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Helius] Raw message:', data);

        // Handle subscription confirmations
        if (data.result !== undefined && data.id?.startsWith('token-sub-')) {
          console.log('[Helius] Subscription confirmed:', data);
          return;
        }

        // Handle account updates
        if (data.method === 'accountNotification') {
          const value = data.params?.result?.value;
          if (!value) {
            console.warn('[Helius] Invalid account notification:', data);
            return;
          }

          console.log('[Helius] Account update:', value);

          // Process token data
          if (value.data?.program === 'spl-token') {
            const tokenData = value.data.parsed?.info;
            if (tokenData) {
              console.log('[Helius] Token data:', tokenData);
              // Token data is now available for use by other components
            }
          }
        }
      } catch (error) {
        console.error('[Helius] Message handling error:', error);
      }
    };

    ws.onclose = () => {
      console.log('[Helius] Disconnected');
      useHeliusStore.getState().setConnected(false);

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[Helius] Attempting reconnect ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }
        reconnectTimeout = setTimeout(initializeHeliusWebSocket, RECONNECT_DELAY);
      }
    };

    ws.onerror = (error) => {
      console.error('[Helius] WebSocket error:', error);
    };

  } catch (error) {
    console.error('[Helius] Initialization error:', error);
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      reconnectTimeout = setTimeout(initializeHeliusWebSocket, RECONNECT_DELAY);
    }
  }
}

// Initialize WebSocket connection
initializeHeliusWebSocket();