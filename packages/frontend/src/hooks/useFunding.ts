import { useQuery } from "@tanstack/react-query";
import { fetchFunding } from "../lib/api";

export function useFunding() {
  const { data, isLoading } = useQuery({
    queryKey: ["funding"],
    queryFn: fetchFunding,
    staleTime: 5 * 60 * 1000,
  });

  return { funding: data ?? null, isLoading };
}
