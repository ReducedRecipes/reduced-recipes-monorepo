import { useQuery } from "@tanstack/react-query";
import { fetchHealth, type HealthResponse } from "../lib/api";

export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: fetchHealth,
    staleTime: 5 * 60 * 1000,
  });
}
