/**
 * Placeholder for acquiring a Microsoft Graph access token.
 * Replace with your MSAL / cookie session flow as needed.
 */
export type AccessTokenResult = { accessToken: string };

export async function requireGraphAccessToken(req: any): Promise<AccessTokenResult> {
  // In your real app, fetch the user's access token from your session / Supabase / cookies
  // and return it. For now we throw to avoid accidental usage in prod without wiring.
  throw new Error('requireGraphAccessToken not implemented. Wire your MSAL/session flow.');
}
