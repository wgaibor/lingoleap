import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthenticatedUser, AuthVerifier } from '../../application/ports/auth-verifier.port';

export class SupabaseAuthVerifier implements AuthVerifier {
  constructor(private readonly client: SupabaseClient) {}

  async verifyToken(accessToken: string): Promise<AuthenticatedUser | null> {
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user) {
      return null;
    }
    return { id: data.user.id, email: data.user.email ?? null };
  }
}
