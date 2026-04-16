import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

type Env = {
  ASSETS: Fetcher;
  FIREBASE_PROJECT_ID: string;
  APPS_SCRIPT_WEB_APP_URL: string;
  APPS_SCRIPT_SECRET: string;
};

type AuthUser = {
  uid: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

type Variables = {
  user: AuthUser;
};

const firebaseKeys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

const expenseSchema = z.object({
  name: z.string().min(1).max(160),
  amount: z.coerce.number().positive(),
  department: z.string().min(1).max(80),
  category: z.string().min(1).max(80),
  subcategory: z.string().min(1).max(120),
  paymentMethod: z.string().min(1).max(80),
});

const app = new Hono<{ Bindings: Env; Variables: Variables }>().basePath('/api');

app.use(
  '*',
  cors({
    origin: (origin) => origin,
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
  }),
);

app.get('/health', (c) =>
  c.json({
    ok: true,
    source: 'worker-env',
    config: getConfigPresence(c.env),
  }),
);

app.use('/expenses', async (c, next) => {
  assertEnv(c.env);

  const authorization = c.req.header('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';

  if (!token) {
    throw new HTTPException(401, { message: 'Missing authorization token.' });
  }

  try {
    const { payload } = await jwtVerify(token, firebaseKeys, {
      audience: c.env.FIREBASE_PROJECT_ID,
      issuer: `https://securetoken.google.com/${c.env.FIREBASE_PROJECT_ID}`,
    });

    const emailVerified = payload.email_verified === true;
    if (!emailVerified) {
      throw new HTTPException(403, { message: 'Email address is not verified.' });
    }

    c.set('user', {
      uid: payload.sub ?? '',
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : '',
      emailVerified,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    throw new HTTPException(401, { message: 'Invalid authorization token.' });
  }

  await next();
});

app.post('/expenses', async (c) => {
  let body: FormData;
  try {
    body = await c.req.raw.formData();
  } catch (error) {
    console.error('Could not parse expense form data', error);
    throw new HTTPException(400, { message: 'Could not read submitted form data.' });
  }

  const receipt = body.get('receipt');

  if (!isUploadedFile(receipt)) {
    throw new HTTPException(400, { message: 'Receipt image is required.' });
  }

  const parsedExpense = expenseSchema.safeParse({
    name: getFormValue(body, 'name'),
    amount: getFormValue(body, 'amount'),
    department: getFormValue(body, 'department'),
    category: getFormValue(body, 'category'),
    subcategory: getFormValue(body, 'subcategory'),
    paymentMethod: getFormValue(body, 'paymentMethod'),
  });

  if (!parsedExpense.success) {
    throw new HTTPException(400, { message: 'Expense details are invalid.' });
  }

  const user = c.get('user');
  const imageBase64 = arrayBufferToBase64(await receipt.arrayBuffer());

  const appsScriptPayload = await submitToAppsScript(c.env, {
    secret: c.env.APPS_SCRIPT_SECRET,
    submittedAt: new Date().toISOString(),
    user,
    expense: parsedExpense.data,
    receipt: {
      filename: receipt.name,
      mimeType: receipt.type || 'image/jpeg',
      base64: imageBase64,
    },
  });

  return c.json({
    ok: true,
    receiptFileId: appsScriptPayload.receiptFileId,
    receiptUrl: appsScriptPayload.receiptUrl,
  });
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }

  console.error('Unexpected Worker error', {
    path: new URL(c.req.url).pathname,
    message: getErrorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return c.json({ error: `Unexpected server error: ${getErrorMessage(error)}` }, 500);
});

async function submitToAppsScript(env: Env, payload: unknown) {
  let response: Response;
  try {
    response = await fetch(env.APPS_SCRIPT_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Apps Script request failed', error);
    throw new HTTPException(502, { message: `Apps Script request failed: ${getErrorMessage(error)}` });
  }

  const responseText = await response.text();
  const appsScriptPayload = parseJson(responseText) as {
    ok?: boolean;
    error?: string;
    receiptFileId?: string;
    receiptUrl?: string;
  } | null;

  if (!response.ok || !appsScriptPayload?.ok) {
    console.error('Apps Script returned an error', {
      status: response.status,
      statusText: response.statusText,
      payload: appsScriptPayload,
      bodyPreview: responseText.slice(0, 500),
    });

    throw new HTTPException(502, {
      message:
        appsScriptPayload?.error ??
        `Apps Script could not save the expense. Status: ${response.status} ${response.statusText}`,
    });
  }

  return appsScriptPayload;
}

function assertEnv(env: Env) {
  const missing = Object.entries(getConfigPresence(env))
    .filter(([, present]) => !present)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new HTTPException(500, { message: `Missing server configuration: ${missing.join(', ')}` });
  }
}

function getConfigPresence(env: Env) {
  return {
    FIREBASE_PROJECT_ID: Boolean(env.FIREBASE_PROJECT_ID),
    APPS_SCRIPT_WEB_APP_URL: Boolean(env.APPS_SCRIPT_WEB_APP_URL),
    APPS_SCRIPT_SECRET: Boolean(env.APPS_SCRIPT_SECRET),
  };
}

function getFormValue(body: FormData, key: string) {
  const value = body.get(key);
  return typeof value === 'string' ? value : '';
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === 'object' &&
    value !== null &&
    'arrayBuffer' in value &&
    typeof value.arrayBuffer === 'function' &&
    'name' in value &&
    typeof value.name === 'string'
  );
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export default {
  fetch(request, env, executionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, executionContext);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
