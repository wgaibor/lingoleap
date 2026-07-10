import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const VALID = {
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  PEXELS_API_KEY: 'pexels-key'
};

describe('loadEnv', () => {
  it('parsea un entorno válido con PORT por defecto 3000', () => {
    const env = loadEnv(VALID);
    expect(env.SUPABASE_URL).toBe(VALID.SUPABASE_URL);
    expect(env.PORT).toBe(3000);
  });

  it('lanza si falta una clave obligatoria', () => {
    expect(() => loadEnv({ ...VALID, PEXELS_API_KEY: undefined })).toThrow();
  });
});
