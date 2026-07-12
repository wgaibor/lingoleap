import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthVerifier } from './supabase-auth.verifier';

function clientWith(response: { data: { user: { id: string; email?: string } | null }; error: { message: string } | null }): SupabaseClient {
  return { auth: { getUser: vi.fn().mockResolvedValue(response) } } as unknown as SupabaseClient;
}

describe('SupabaseAuthVerifier', () => {
  it('devuelve el usuario cuando el token es válido', async () => {
    const verifier = new SupabaseAuthVerifier(
      clientWith({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null })
    );
    await expect(verifier.verifyToken('tok')).resolves.toEqual({ id: 'u1', email: 'a@b.com' });
  });

  it('devuelve null con token inválido', async () => {
    const verifier = new SupabaseAuthVerifier(
      clientWith({ data: { user: null }, error: { message: 'invalid JWT' } })
    );
    await expect(verifier.verifyToken('bad')).resolves.toBeNull();
  });
});
