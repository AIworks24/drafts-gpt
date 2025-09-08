// apps/web/lib/auth.ts
import { ConfidentialClientApplication } from '@azure/msal-node';

const tenant = process.env.AZURE_TENANT_ID || 'common';
const authority = `https://login.microsoftonline.com/${tenant}`;

export const OAUTH_REDIRECT_URI =
  process.env.AZURE_REDIRECT_URI || process.env.OAUTH_REDIRECT_URI || '';

if (!process.env.AZURE_CLIENT_ID) throw new Error('Missing AZURE_CLIENT_ID');
if (!process.env.AZURE_CLIENT_SECRET) throw new Error('Missing AZURE_CLIENT_SECRET');
if (!OAUTH_REDIRECT_URI) throw new Error('Missing AZURE_REDIRECT_URI or OAUTH_REDIRECT_URI');

export const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    authority,
  },
});

// Graph scopes (Authorization Code w/ PKCE or standard code flow)
export const GRAPH_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  // use fully-qualified Graph scopes to be explicit
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Calendars.Read',
] as const;
