import { ConfidentialClientApplication, type AuthorizationUrlRequest } from '@azure/msal-node';

const authority = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`;
export const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    authority
  },
  system: { loggerOptions: { logLevel: 2 } }
});

export const MS_SCOPES = [
  'openid','profile','offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Calendars.Read'
];

export function buildAuthUrl(state: string) {
  const req: AuthorizationUrlRequest = {
    scopes: MS_SCOPES,
    redirectUri: process.env.AZURE_REDIRECT_URI!,
    state,
    prompt: 'select_account'
  };
  return msalApp.getAuthCodeUrl(req);
}
