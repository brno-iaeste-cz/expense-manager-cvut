import { Hono, type MiddlewareHandler } from 'hono';
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

const allowedEmailDomain = 'iaeste.cz';
const paymentMethodLabels: Record<string, string> = {
  Invoice: 'Faktura',
  Cash: 'Hotovost',
  'IA Card': 'IA karta',
  Private: 'Soukromá platba',
  'No document': 'Bez dokladu',
};

const expenseSchema = z.object({
  name: z.string().min(1).max(160),
  storeName: z.string().trim().min(1).max(160),
  approvedBy: z.string().trim().min(1).max(160),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().positive(),
  department: z.string().min(1).max(80),
  category: z.string().min(1).max(80),
  paymentMethod: z.string().min(1).max(80),
});

const emailSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
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

const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
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

    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!isAllowedWorkspaceEmail(email)) {
      throw new HTTPException(403, { message: `Email address must use the ${allowedEmailDomain} domain.` });
    }

    c.set('user', {
      uid: payload.sub ?? '',
      email,
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
};

app.use('/expenses', requireAuth);
app.use('/expense-email', requireAuth);

app.post('/expenses', async (c) => {
  let body: FormData;
  try {
    body = await c.req.raw.formData();
  } catch (error) {
    console.error('Could not parse expense form data', error);
    throw new HTTPException(400, { message: 'Could not read submitted form data.' });
  }

  const receipt = body.get('receipt');

  const parsedExpense = expenseSchema.safeParse({
    name: getFormValue(body, 'name'),
    storeName: getFormValue(body, 'storeName'),
    approvedBy: getFormValue(body, 'approvedBy'),
    expenseDate: getFormValue(body, 'expenseDate'),
    amount: getFormValue(body, 'amount'),
    department: getFormValue(body, 'department'),
    category: getFormValue(body, 'category'),
    paymentMethod: getFormValue(body, 'paymentMethod'),
  });

  if (!parsedExpense.success) {
    throw new HTTPException(400, { message: 'Expense details are invalid.' });
  }

  if (parsedExpense.data.paymentMethod !== 'No document' && !isUploadedFile(receipt)) {
    throw new HTTPException(400, { message: 'Receipt document is required.' });
  }

  const user = c.get('user');
  const receiptPayload = isUploadedFile(receipt)
    ? {
        filename: receipt.name,
        mimeType: getUploadedFileMimeType(receipt),
        base64: arrayBufferToBase64(await receipt.arrayBuffer()),
      }
    : null;

  const appsScriptPayload = await submitToAppsScript(c.env, {
    secret: c.env.APPS_SCRIPT_SECRET,
    submittedAt: new Date().toISOString(),
    user,
    expense: translateExpenseForAppsScript(parsedExpense.data),
    receipt: receiptPayload,
  });

  return c.json({
    ok: true,
    receiptFileId: appsScriptPayload.receiptFileId,
    receiptUrl: appsScriptPayload.receiptUrl,
  });
});

app.post('/expense-email', async (c) => {
  let body: FormData;
  try {
    body = await c.req.raw.formData();
  } catch (error) {
    console.error('Could not parse email form data', error);
    throw new HTTPException(400, { message: 'Could not read submitted email data.' });
  }

  const receipt = body.get('receipt');
  if (!isUploadedFile(receipt)) {
    throw new HTTPException(400, { message: 'Receipt document is required.' });
  }

  const parsedEmail = emailSchema.safeParse({
    subject: getFormValue(body, 'subject'),
    body: getFormValue(body, 'body'),
  });
  const parsedExpense = expenseSchema.safeParse({
    name: getFormValue(body, 'name'),
    storeName: getFormValue(body, 'storeName'),
    approvedBy: getFormValue(body, 'approvedBy'),
    expenseDate: getFormValue(body, 'expenseDate'),
    amount: getFormValue(body, 'amount'),
    department: getFormValue(body, 'department'),
    category: getFormValue(body, 'category'),
    paymentMethod: getFormValue(body, 'paymentMethod'),
  });

  if (!parsedEmail.success || !parsedExpense.success) {
    throw new HTTPException(400, { message: 'Email details are invalid.' });
  }

  await submitToAppsScript(c.env, {
    action: 'sendExpenseEmail',
    secret: c.env.APPS_SCRIPT_SECRET,
    submittedAt: new Date().toISOString(),
    user: c.get('user'),
    email: parsedEmail.data,
    expense: translateExpenseForAppsScript(parsedExpense.data),
    receipt: {
      filename: receipt.name,
      mimeType: getUploadedFileMimeType(receipt),
      base64: arrayBufferToBase64(await receipt.arrayBuffer()),
    },
  });

  return c.json({ ok: true });
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

function translateExpenseForAppsScript(expense: z.infer<typeof expenseSchema>) {
  return {
    ...expense,
    paymentMethod: paymentMethodLabels[expense.paymentMethod] ?? expense.paymentMethod,
  };
}

function isAllowedWorkspaceEmail(email: string) {
  return email.toLowerCase().endsWith(`@${allowedEmailDomain}`);
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

function getUploadedFileMimeType(file: File) {
  const mimeType = String(file.type || '').trim().toLowerCase();
  if (mimeType) {
    return mimeType;
  }

  if (file.name.toLowerCase().endsWith('.pdf')) {
    return 'application/pdf';
  }

  return 'application/octet-stream';
}

export default {
  fetch(request, env, executionContext) {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, executionContext);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
