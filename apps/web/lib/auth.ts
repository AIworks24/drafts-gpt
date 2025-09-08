import { ConfidentialClientApplication, type Configuration } from "@azure/msal-node";

const clientId = process.env.AZURE_CLIENT_ID!;
const clientSecret = process.env.AZURE_CLIENT_SECRET!;
const tenantId = process.env.AZURE_TENANT_ID || "common";

// IMPORTANT: your Vercel variable is AZURE_REDIRECT_URI (not OAUTH_REDIRECT_URI)
export const AZURE_REDIRECT_URI = process.env.AZURE_REDIRECT_URI!;

if (!clientId || !clientSecret || !AZURE_REDIRECT_URI) {
  throw new Error("Missing required Azure env vars: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_REDIRECT_URI");
}

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    clientSecret
  },
  system: {
    loggerOptions: { piiLoggingEnabled: false }
  }
};

export const msalApp = new ConfidentialClientApplication(msalConfig);
