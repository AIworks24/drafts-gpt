import { ConfidentialClientApplication } from '@azure/msal-node';

const authority = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}`;

export const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.AZURE_CLIENT_ID!,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
    authority,
  },
});

export const MS_SCOPES = [
  'openid','profile','offline_access',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Calendars.Read',
];
