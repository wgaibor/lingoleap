import { LingoApiClient } from '@lingoleap/api-client';
import { env } from './env';
import { supabase } from './supabase';

export const api = new LingoApiClient({
  baseUrl: env.apiUrl,
  getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null
});
