/**
 * SWR hook for fetching deals from the FastAPI backend.
 * Polls every 10 seconds to keep the dashboard in sync with PayPal webhooks.
 */

import useSWR from "swr";
import { DealsListResponse, DealRecord } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetcher(url: string): Promise<DealsListResponse> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }
  return response.json();
}

export function useDeals() {
  const { data, error, isLoading, mutate } = useSWR<DealsListResponse>(
    `${API_URL}/api/deals`,
    fetcher,
    {
      refreshInterval: 10000, // Poll every 10 seconds for real-time updates
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  return {
    deals: data?.deals || [],
    isLoading,
    error,
    mutate,
  };
}
