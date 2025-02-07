import { create } from "zustand";
import { persist } from "zustand/middleware";
import { 
  calculatePumpFunTokenMetrics,
  calculateVolumeMetrics,
  calculateTokenRisk,
} from "@/utils/token-calculations";

const MAX_TRADES_PER_TOKEN = 1000;
const MAX_TOKENS_IN_LIST = 50;

function emptyToNull(value: string | undefined | null): string | null {
  if (!value || value.trim() === '') {
    return null;
  }
  return value;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  uri?: string;
  mint?: string;
  imageUrl?: string;
  creators?: Array<{
    address: string;
    verified: boolean;
    share: number;
  }>;
}

export interface TokenTrade {
  signature: string;
  timestamp: number;
  mint: string;
  txType: "buy" | "sell";
  tokenAmount: number;
  solAmount: number;
  traderPublicKey: string;
  counterpartyPublicKey: string;
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
  priceInSol: number;
  priceInUsd: number;
  isDevTrade?: boolean;
}

export interface PumpPortalToken {
  symbol: string;
  name: string;
  address: string;
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
  priceInSol?: number;
  priceInUsd?: number;
  devWallet?: string;
  recentTrades: TokenTrade[];
  metadata?: TokenMetadata;
  lastAnalyzedAt?: string;
  analyzedBy?: string;
  createdAt?: string;
  volume24h?: number;
  riskMetrics?: any;
  isNew?: boolean;
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
  socials?: {
    website: string | null;
    twitter: string | null;
    telegram: string | null;
  };
}

interface PumpPortalStore {
  tokens: PumpPortalToken[];
  viewedTokens: { [key: string]: PumpPortalToken };
  isConnected: boolean;
  solPrice: number;
  activeTokenView: string | null;
  addToken: (tokenData: any) => void;
  addTradeToHistory: (address: string, tradeData: TokenTrade) => void;
  setConnected: (connected: boolean) => void;
  setSolPrice: (price: number) => void;
  resetTokens: () => void;
  addToViewedTokens: (address: string) => void;
  setActiveTokenView: (address: string | null) => void;
  getToken: (address: string) => PumpPortalToken | undefined;
  updateTokenPrice: (address: string, priceInUsd: number) => void;
  fetchTokenUri: (address: string) => Promise<string | null>;
  getNewTokens: () => PumpPortalToken[];
  getAboutToGraduateTokens: () => PumpPortalToken[];
  getGraduatedTokens: () => PumpPortalToken[];
}

export const usePumpPortalStore = create(
  persist(
    (set, get) => ({
      tokens: [],
      viewedTokens: {},
      isConnected: false,
      solPrice: 0,
      activeTokenView: null,

      addToken: (tokenData) =>
        set((state) => {
          const tokenName = tokenData.metadata?.name || tokenData.name;
          const tokenSymbol = tokenData.metadata?.symbol || tokenData.symbol;
          const mintAddress = tokenData.mint || tokenData.address || "";
          const imageUrl = tokenData.metadata?.imageUrl || tokenData.imageUrl;

          const tokenMetrics = calculatePumpFunTokenMetrics({
            vSolInBondingCurve: tokenData.vSolInBondingCurve || 0,
            vTokensInBondingCurve: tokenData.vTokensInBondingCurve || 0,
            solPrice: state.solPrice,
          });

          const newToken = {
            symbol: tokenSymbol || mintAddress.slice(0, 6).toUpperCase(),
            name: tokenName || `Token ${mintAddress.slice(0, 8)}`,
            address: mintAddress,
            bondingCurveKey: tokenData.bondingCurveKey || "",
            vTokensInBondingCurve: tokenData.vTokensInBondingCurve || 0,
            vSolInBondingCurve: tokenData.vSolInBondingCurve || 0,
            marketCapSol: tokenMetrics.marketCap.sol,
            priceInSol: tokenMetrics.price.sol,
            priceInUsd: tokenMetrics.price.usd,
            devWallet: tokenData.devWallet || tokenData.traderPublicKey,
            recentTrades: [],
            metadata: {
              name: tokenName || `Token ${mintAddress.slice(0, 8)}`,
              symbol: tokenSymbol || mintAddress.slice(0, 6).toUpperCase(),
              decimals: 9,
              mint: mintAddress,
              uri: tokenData.uri || "",
              imageUrl: imageUrl,
              creators: tokenData.creators || [],
            },
            lastAnalyzedAt: tokenData.timestamp?.toString(),
            createdAt: tokenData.txType === "create" ? tokenData.timestamp?.toString() : undefined,
            website: emptyToNull(tokenData.website),
            twitter: emptyToNull(tokenData.twitter),
            telegram: emptyToNull(tokenData.telegram),
            socials: {
              website: emptyToNull(tokenData.website),
              twitter: emptyToNull(tokenData.twitter),
              telegram: emptyToNull(tokenData.telegram),
            },
          };

          const existingTokenIndex = state.tokens.findIndex(
            (t) => t.address === newToken.address,
          );
          const isViewed = state.activeTokenView === newToken.address;

          if (existingTokenIndex >= 0) {
            const updatedTokens = state.tokens.map((t, i) =>
              i === existingTokenIndex
                ? {
                    ...t,
                    ...newToken,
                    recentTrades: [
                      ...(t.recentTrades || []),
                      ...(tokenData.recentTrades || []),
                    ].slice(0, MAX_TRADES_PER_TOKEN),
                  }
                : t
            );

            return {
              tokens: updatedTokens,
              ...(isViewed && {
                viewedTokens: {
                  ...state.viewedTokens,
                  [newToken.address]: updatedTokens[existingTokenIndex],
                },
              }),
            };
          }

          const tokenWithFlag = {
            ...newToken,
            isNew: true,
          };

          if (tokenData.recentTrades?.length) {
            const volumeMetrics = calculateVolumeMetrics(tokenData.recentTrades);
            const riskMetrics = calculateTokenRisk({
              ...tokenWithFlag,
              recentTrades: tokenData.recentTrades,
            });

            Object.assign(tokenWithFlag, {
              volume24h: volumeMetrics.volume24h,
              riskMetrics,
            });
          }

          return {
            tokens: [tokenWithFlag, ...state.tokens].slice(0, MAX_TOKENS_IN_LIST),
            ...(isViewed && {
              viewedTokens: {
                ...state.viewedTokens,
                [newToken.address]: tokenWithFlag,
              },
            }),
          };
        }),

      addTradeToHistory: (address: string, tradeData: TokenTrade) =>
        set((state) => {
          const token =
            state.viewedTokens[address] ||
            state.tokens.find((t) => t.address === address);
          if (!token) return state;

          const updatedTrades = [tradeData, ...(token.recentTrades || [])].slice(
            0,
            MAX_TRADES_PER_TOKEN,
          );

          const tokenMetrics = calculatePumpFunTokenMetrics({
            vSolInBondingCurve: tradeData.vSolInBondingCurve,
            vTokensInBondingCurve: tradeData.vTokensInBondingCurve,
            solPrice: state.solPrice,
          });

          const volumeMetrics = calculateVolumeMetrics(updatedTrades);

          const updatedToken = {
            ...token,
            recentTrades: updatedTrades,
            bondingCurveKey: tradeData.bondingCurveKey,
            vTokensInBondingCurve: tradeData.vTokensInBondingCurve,
            vSolInBondingCurve: tradeData.vSolInBondingCurve,
            marketCapSol: tokenMetrics.marketCap.sol,
            priceInSol: tokenMetrics.price.sol,
            priceInUsd: tokenMetrics.price.usd,
            volume24h: volumeMetrics.volume24h,
            riskMetrics: calculateTokenRisk({
              ...token,
              recentTrades: updatedTrades,
            }),
          };

          const updatedTokens = state.tokens.map((t) =>
            t.address === address ? updatedToken : t,
          );

          return {
            tokens: updatedTokens,
            ...(state.viewedTokens[address] && {
              viewedTokens: {
                ...state.viewedTokens,
                [address]: updatedToken,
              },
            }),
          };
        }),

      setConnected: (connected) => set({ isConnected: connected }),
      setSolPrice: (price) => set({ solPrice: price }),
      resetTokens: () => set({
        tokens: [],
        viewedTokens: {},
        activeTokenView: null,
      }),

      addToViewedTokens: (address) =>
        set((state) => {
          const token = state.tokens.find((t) => t.address === address);
          if (!token) return state;
          return {
            viewedTokens: {
              ...state.viewedTokens,
              [address]: token,
            },
          };
        }),

      setActiveTokenView: (address) =>
        set((state) => {
          if (!address) {
            return { activeTokenView: null };
          }
          const token = state.tokens.find((t) => t.address === address);
          if (!token) return state;
          return {
            activeTokenView: address,
            viewedTokens: {
              ...state.viewedTokens,
              [address]: token,
            },
          };
        }),

      getToken: (address) => {
        const state = get();
        return (
          state.viewedTokens[address] ||
          state.tokens.find((t) => t.address === address)
        );
      },

      updateTokenPrice: (address, newPriceInUsd) =>
        set((state) => {
          const token = state.tokens.find((t) => t.address === address);
          if (newPriceInUsd === 0 && token?.priceInUsd && token.priceInUsd > 0) {
            newPriceInUsd = token.priceInUsd;
          }
          const priceInSol = state.solPrice > 0 ? newPriceInUsd / state.solPrice : 0;
          const updatedTokens = state.tokens.map((t) =>
            t.address === address
              ? { ...t, priceInUsd: newPriceInUsd, priceInSol }
              : t,
          );
          return {
            tokens: updatedTokens,
            ...(state.viewedTokens[address] && {
              viewedTokens: {
                ...state.viewedTokens,
                [address]: {
                  ...state.viewedTokens[address],
                  priceInUsd: newPriceInUsd,
                  priceInSol,
                },
              },
            }),
          };
        }),

      fetchTokenUri: async (address) => {
        const token = get().getToken(address);
        if (token?.metadata?.uri) return token.metadata.uri;
        return fetchTokenMetadataFromChain(address);
      },

      getNewTokens: () => {
        const { tokens } = get();
        return tokens.filter((t) => t.isNew);
      },

      getAboutToGraduateTokens: () => {
        const { tokens } = get();
        return tokens.filter(
          (t) =>
            !t.isNew &&
            t.marketCapSol &&
            t.marketCapSol >= 70 &&
            t.marketCapSol < 100,
        );
      },

      getGraduatedTokens: () => {
        const { tokens } = get();
        return tokens.filter(
          (t) => !t.isNew && t.marketCapSol && t.marketCapSol >= 100,
        );
      },
    }),
    {
      name: "pump-portal-storage",
      storage: {
        getItem: (name) => {
          try {
            return localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch {}
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {}
        }
      },
      partialize: (state) => ({
        tokens: state.tokens,
        viewedTokens: state.viewedTokens,
      }),
    }
  )
);

async function fetchTokenMetadataFromChain(mintAddress: string) {
  try {
    const response = await axios.post("https://api.mainnet-beta.solana.com", {
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [mintAddress, { encoding: "jsonParsed" }],
    });

    if (response.data?.result?.value?.data?.parsed?.info?.uri) {
      return response.data.result.value.data.parsed.info.uri;
    }
    return null;
  } catch {
    return null;
  }
}

export default usePumpPortalStore;