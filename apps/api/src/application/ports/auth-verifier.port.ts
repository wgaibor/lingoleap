export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export interface AuthVerifier {
  verifyToken(accessToken: string): Promise<AuthenticatedUser | null>;
}

export const AUTH_VERIFIER = Symbol('AuthVerifier');
