import type { Flag, FlagListResponse } from "./types";

export async function fetchFlags(query?: string): Promise<FlagListResponse> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  const res = await fetch(`/api/flags?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch flags: ${res.statusText}`);
  return res.json();
}

export async function fetchFlag(key: string): Promise<Flag> {
  const res = await fetch(`/api/flags/${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error(`Failed to fetch flag: ${res.statusText}`);
  return res.json();
}
