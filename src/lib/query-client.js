import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 60 * 1000,       // 1 min — avoids redundant refetches on nav
      gcTime: 5 * 60 * 1000,      // 5 min — keep cache warm between pages
      refetchOnMount: 'always',   // still refetch when component mounts fresh
    },
  },
});
