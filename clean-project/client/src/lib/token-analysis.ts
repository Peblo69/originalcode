import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { usePumpPortalStore } from "@/lib/pump-portal-websocket";

// Schema matching our backend response
const tokenAnalyticsSchema = z.object({
  token: z.object({
    address: z.string(),
    name: z.string(),
    symbol: z.string(),
    decimals: z.number().optional(),
    supply: z.number().optional(),
    mintAuthority: z.boolean().optional(),
    freezeAuthority: z.boolean().optional(),
    mutable: z.boolean().optional(),
    created: z.number().optional()
  }).optional(),
  holders: z.object({
    total: z.number(),
    unique: z.number().optional(),
    concentration: z.object({
      top10Percentage: z.number().optional(),
      riskLevel: z.enum(['low', 'medium', 'high']).optional()
    }).optional()
  }).optional(),
  snipers: z.object({
    total: z.number(),
    volume: z.number().optional(),
    averageAmount: z.number().optional()
  }).optional(),
  risks: z.array(z.object({
    name: z.string(),
    score: z.number()
  }))
});

export type TokenAnalysis = z.infer<typeof tokenAnalyticsSchema>;

export async function analyzeToken(tokenAddress: string): Promise<TokenAnalysis> {
  try {
    const response = await fetch(`/api/token-analytics/${tokenAddress}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch token analytics: ${response.statusText}`);
    }
    const data = await response.json();

    // Parse and validate the response
    const parsedData = tokenAnalyticsSchema.parse(data);

    // Update PumpPortal store
    usePumpPortalStore.setState(state => {
      const updatedTokens = state.tokens.map(token => 
        token.address === tokenAddress 
          ? { ...token, analysis: parsedData }
          : token
      );

      return {
        ...state,
        tokens: updatedTokens,
        viewedTokens: {
          ...state.viewedTokens,
          [tokenAddress]: state.viewedTokens[tokenAddress] 
            ? { ...state.viewedTokens[tokenAddress], analysis: parsedData }
            : undefined
        }
      };
    });

    return parsedData;
  } catch (error) {
    console.error("[TokenAnalysis] Error fetching token data:", error);
    throw error;
  }
}

export function useTokenAnalysis(tokenAddress: string) {
  // Get token data from PumpPortal store
  const token = usePumpPortalStore(state => 
    state.tokens.find(t => t.address === tokenAddress)
  );

  const queryResult = useQuery({
    queryKey: ["tokenAnalysis", tokenAddress],
    queryFn: () => analyzeToken(tokenAddress),
    staleTime: 30000,
    refetchOnWindowFocus: true,
    // Only fetch if we have the token in PumpPortal store
    enabled: !!token,
    // Don't retry on error
    retry: false
  });

  return {
    ...queryResult,
    analyze: () => queryResult.refetch()
  };
}