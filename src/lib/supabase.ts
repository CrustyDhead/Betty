import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Null when env vars aren't set, so store.ts can fall back to a clear
 * error instead of a confusing runtime crash deep in a query call.
 */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;
