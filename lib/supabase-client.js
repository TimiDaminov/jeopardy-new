import { createClient } from "@supabase/supabase-js";

export const DEFAULT_SUPABASE_SESSION_SLUG = process.env.NEXT_PUBLIC_SUPABASE_SESSION_SLUG || "default";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export function normalizeSessionSlug(value) {
  const normalizedValue =
    typeof value === "string"
      ? value
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-_]+/g, "-")
          .replace(/-{2,}/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 64)
      : "";

  return normalizedValue || DEFAULT_SUPABASE_SESSION_SLUG;
}

export function createSessionSlug() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `game-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }

  return `game-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;
