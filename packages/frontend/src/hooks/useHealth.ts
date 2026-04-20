import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../lib/api";

export function useHealth() {
  const { data, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    staleTime: 5 * 60 * 1000,
  });

  return { health: data, isLoading };
}
