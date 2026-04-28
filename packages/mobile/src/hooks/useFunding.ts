import { useQuery } from "@tanstack/react-query";

const BASE_URL = `${process.env.EXPO_PUBLIC_API_BASE || "https://reducedrecipes.com"}/api/v1`;

export interface FundingData {
  monthly_cost: number;
  funded_pct: number;
  supporters: { name: string; amount: number }[];
  breakdown: { label: string; cost: number }[];
}

async function fetchFunding(): Promise<FundingData> {
  const res = await fetch(`${BASE_URL}/funding`, {
    headers: {
      "Content-Type": "application/json",
      "X-Client": "rr-mobile/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch funding data: ${res.status}`);
  }

  return res.json() as Promise<FundingData>;
}

/**
 * Fetch funding/transparency data.
 * Uses a long staleTime (30 min) since funding data changes rarely.
 */
export function useFunding() {
  return useQuery({
    queryKey: ["funding"],
    queryFn: fetchFunding,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}
