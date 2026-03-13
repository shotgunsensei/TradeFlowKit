let twilioCredentials: { accountSid: string; authToken: string; phoneNumber?: string } | null = null;

async function getTwilioCredentials() {
  if (twilioCredentials) return twilioCredentials;

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (hostname && xReplitToken) {
    try {
      const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
      const targetEnvironment = isProduction ? 'production' : 'development';
      const url = new URL(`https://${hostname}/api/v2/connection`);
      url.searchParams.set('include_secrets', 'true');
      url.searchParams.set('connector_names', 'twilio');
      url.searchParams.set('environment', targetEnvironment);

      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken },
      });

      const data = await response.json();
      const conn = data.items?.[0];
      if (conn?.settings?.accountSid && conn?.settings?.authToken) {
        twilioCredentials = {
          accountSid: conn.settings.accountSid,
          authToken: conn.settings.authToken,
          phoneNumber: conn.settings.phoneNumber,
        };
        return twilioCredentials;
      }
    } catch (err: any) {
      console.warn('Twilio connector not available:', err.message);
    }
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioCredentials = {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    };
    return twilioCredentials;
  }

  return null;
}

export async function sendSMS(to: string, from: string, body: string): Promise<boolean> {
  const creds = await getTwilioCredentials();
  if (!creds) {
    console.warn('Twilio not configured, SMS not sent. Would have sent to:', to, 'Body:', body);
    return false;
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
    const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64');

    const params = new URLSearchParams();
    params.append('To', to);
    params.append('From', from);
    params.append('Body', body);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Twilio SMS error:', errText);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error('Failed to send SMS:', err.message);
    return false;
  }
}

export async function isTwilioConfigured(): Promise<boolean> {
  const creds = await getTwilioCredentials();
  return creds !== null;
}

export async function validateTwilioAccountSid(
  requestAccountSid: string | undefined
): Promise<boolean> {
  if (!requestAccountSid) {
    console.warn('Twilio webhook missing AccountSid in request body');
    return false;
  }

  const creds = await getTwilioCredentials();
  if (!creds) {
    console.warn('Twilio not configured — cannot validate AccountSid');
    return false;
  }

  if (requestAccountSid !== creds.accountSid) {
    console.warn(`Twilio AccountSid mismatch: request="${requestAccountSid}" expected="${creds.accountSid}"`);
    return false;
  }

  return true;
}
