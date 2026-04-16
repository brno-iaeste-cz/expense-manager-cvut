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

    c.set('user', {
      uid: payload.sub ?? '',
      email: typeof payload.email === 'string' ? payload.email : '',
    });
  } catch {
    throw new HTTPException(401, { message: 'Invalid authorization token.' });
  }

  await next();
});

app.post('/expenses', async (c) => {
  const body = await c.req.parseBody();
  const receipt = body.receipt;

  if (!(receipt instanceof File)) {
    throw new HTTPException(400, { message: 'Receipt image is required.' });
  }

  const parsedExpense = expenseSchema.safeParse({
    name: body.name,
    amount: body.amount,
    department: body.department,
    category: body.category,
    subcategory: body.subcategory,
    paymentMethod: body.paymentMethod,
  });

  if (!parsedExpense.success) {
    throw new HTTPException(400, { message: 'Expense details are invalid.' });
  }

  const user = c.get('user');
  const imageBase64 = arrayBufferToBase64(await receipt.arrayBuffer());
  const response = await fetch(c.env.APPS_SCRIPT_WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      secret: c.env.APPS_SCRIPT_SECRET,
      submittedAt: new Date().toISOString(),
      user,
      expense: parsedExpense.data,
      receipt: {
        filename: receipt.name,
        mimeType: receipt.type || 'image/jpeg',
        base64: imageBase64,
      },
    }),
  });

  const appsScriptPayload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    receiptFileId?: string;
    receiptUrl?: string;
  } | null;

  if (!response.ok || !appsScriptPayload?.ok) {
    throw new HTTPException(502, {
      message: appsScriptPayload?.error ?? 'Apps Script could not save the expense.',
    });
  }

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

  console.error(error);
  return c.json({ error: 'Unexpected server error.' }, 500);
});

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
