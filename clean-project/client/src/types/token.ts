export interface TokenTrade {
  timestamp: number;
  txType: 'buy' | 'sell' | 'create';
  traderPublicKey: string;
  counterpartyPublicKey?: string;
  tokenAmount: number;
  solAmount: number;
  signature: string;
  mint: string;
  bondingCurveKey?: string;
  vTokensInBondingCurve?: number;
  vSolInBondingCurve?: number;
  marketCapSol?: number;
}

export interface Token {
  address: string;
  name: string;
  symbol: string;
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
  priceInUsd?: number;
  marketCapSol?: number;
  solPrice?: number;
  vSolInBondingCurve?: number;
  metadata?: {
    name: string;
    symbol: string;
    uri?: string;
    imageUrl?: string;
    creators?: Array<{
      address: string;
      verified: boolean;
      share: number;
    }>;
  };
  imageUrl?: string;
  recentTrades?: TokenTrade[];
  isNew?: boolean;
  holdersCount?: number;
  devWalletPercentage?: number;
  insiderPercentage?: number;
  top10HoldersPercentage?: number;
  snipersCount?: number;
  socials?: {
    website?: string | null;
    twitter?: string | null;
    telegram?: string | null;
    pumpfun?: string | null;
  };
  // Backwards compatibility
  website?: string | null;
  twitter?: string | null;
  telegram?: string | null;
  bondingCurveKey?: string;
  devWallet?: string;
  lastAnalyzedAt?: string;
  analyzedBy?: string;
  createdAt?: string;
}

export interface PumpPortalToken {
  symbol: string;
  name: string;
  address: string;
  socials?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    pumpfun?: string;
  };
}