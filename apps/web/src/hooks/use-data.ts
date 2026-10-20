import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { publicClient } from "../lib/queries";

export function useData<T>(key: string, url: string) {
  return useQuery<T>(
    {
      queryKey: [key, url],
      queryFn: ({ signal }) => api(url, { signal }),
      retry: false,
    },
    url === "/categories" || url === "/tags" ? publicClient : undefined,
  );
}
