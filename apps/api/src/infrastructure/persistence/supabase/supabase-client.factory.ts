import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../../../config/env';

export const SUPABASE_CLIENT = Symbol('SupabaseClient');

export function createSupabaseClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}
