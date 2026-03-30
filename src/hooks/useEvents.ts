import useSWR from 'swr';

export async function swrFetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.json();
}

export function useEvents() {
  const { data, error, isLoading, mutate } = useSWR('/api/events', swrFetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 5000,
  });

  return {
    events: data?.events ?? [],
    isLoading,
    isError: !!error,
    mutate,
  };
}
