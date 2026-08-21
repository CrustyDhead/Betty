import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Not wired into the app yet — src/lib/store.ts currently backs everything
 * with localStorage so the UI is demoable without infra. Once a Supabase
 * project exists (see supabase/schema.sql), point VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY at it and swap store.ts's functions over to real
 * queries against this client, one at a time.
 */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
