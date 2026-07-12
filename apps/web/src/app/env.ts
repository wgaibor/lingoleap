export const env = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000',
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'http://localhost:54321',
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'test-anon-key'
};
