export interface Flag {
  key: string;
  state: "ENABLED" | "DISABLED";
  variants: Record<string, unknown>;
  defaultVariant: string;
  targeting?: unknown;
  metadata?: Record<string, unknown>;
  source: string;
}

export interface FlagListResponse {
  flags: Flag[];
  total: number;
}
