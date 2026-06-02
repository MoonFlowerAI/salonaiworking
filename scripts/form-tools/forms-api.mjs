// Minimal Google Forms API v1 client using a service-account JWT.
// Requires jsonwebtoken (already a dependency of the SalonAI server).
// No heavyweight SDK.

import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';

const FORMS_SCOPE = 'https://www.googleapis.com/auth/forms.body';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://forms.googleapis.com/v1/forms';

/**
 * Exchange a service-account JWT for an OAuth access token.
 */
async function getAccessToken(credsPath) {
  const creds = JSON.parse(readFileSync(credsPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: creds.client_email,
      scope: FORMS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    creds.private_key,
    { algorithm: 'RS256' }
  );

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.access_token;
}

export async function createClient(credsPath) {
  const token = await getAccessToken(credsPath);

  async function req(path, init = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Forms API ${res.status} on ${init.method || 'GET'} ${path}: ${text}`);
    }
    return res.json();
  }

  return {
    /** Get the full form definition (info, items, etc.). */
    async getForm(formId) {
      return req(`/${formId}`);
    },

    /**
     * Run a batchUpdate with an array of requests.
     * See https://developers.google.com/forms/api/reference/rest/v1/forms/batchUpdate
     */
    async batchUpdate(formId, requests) {
      return req(`/${formId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests, includeFormInResponse: false }),
      });
    },
  };
}
