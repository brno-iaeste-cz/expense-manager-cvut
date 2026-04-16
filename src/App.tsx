import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  User,
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';
import { ExpenseForm, SubmissionState } from './types';

const emptyForm: ExpenseForm = {
  transactionDate: new Date().toISOString().slice(0, 10),
  merchant: '',
  amount: '',
  currency: 'EUR',
  category: 'Office',
  paymentMethod: 'Card',
  project: '',
  notes: '',
};

const categories = ['Office', 'Travel', 'Accommodation', 'Food', 'Event', 'Marketing', 'Other'];
const paymentMethods = ['Card', 'Cash', 'Bank transfer', 'Online'];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => undefined);
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
  }, []);

  if (!authReady) {
    return <LoadingScreen />;
  }

  return user ? <ExpenseApp user={user} /> : <SignIn />;
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-5">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
    </main>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError('The email or password is incorrect.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-8 sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <form
          onSubmit={handleSubmit}
          className="w-full rounded-lg border border-line bg-white p-5 shadow-panel sm:p-7"
        >
          <div className="mb-7">
            <p className="text-sm font-bold uppercase tracking-wide text-brand">IAESTE LC Brno</p>
            <h1 className="mt-2 text-3xl font-bold text-ink">Expense manager</h1>
          </div>

          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="field mb-4"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {error ? <p className="mt-4 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}

          <button
            className="mt-6 w-full rounded-md bg-brand px-4 py-3 font-bold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

function ExpenseApp({ user }: { user: User }) {
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [status, setStatus] = useState<SubmissionState>('idle');
  const [message, setMessage] = useState('');

  const formattedUser = user.email ?? 'Signed in';

  useEffect(() => {
    if (!receipt) {
      setPreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(receipt);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [receipt]);

  const canSubmit = useMemo(() => {
    return Boolean(receipt && form.transactionDate && form.merchant && Number(form.amount) > 0);
  }, [form, receipt]);

  function updateField<Key extends keyof ExpenseForm>(key: Key, value: ExpenseForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receipt || !canSubmit) return;

    setStatus('submitting');
    setMessage('');

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    payload.append('receipt', receipt);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorPayload?.error ?? 'Could not submit the expense.');
      }

      setStatus('success');
      setMessage('Expense saved.');
      setForm(emptyForm);
      setReceipt(null);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not submit the expense.');
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7f8]">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-brand">IAESTE LC Brno</p>
            <h1 className="text-xl font-bold text-ink sm:text-2xl">Expense manager</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-56 truncate text-sm text-ink/70 sm:block">{formattedUser}</span>
            <button className="icon-button" onClick={() => void signOut(auth)} type="button" title="Sign out">
              <LogOutIcon />
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:py-10">
        <ReceiptPanel
          receipt={receipt}
          previewUrl={previewUrl}
          onReceiptChange={setReceipt}
        />

        <form onSubmit={submitExpense} className="rounded-lg border border-line bg-white p-4 shadow-panel sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-ink">Transaction</h2>
              <p className="mt-1 text-sm text-ink/65">Required fields are receipt, date, merchant, and amount.</p>
            </div>
            <span className="rounded-md bg-gold/15 px-2.5 py-1 text-sm font-bold text-[#7a4d00]">{form.currency}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" id="transactionDate">
              <input
                id="transactionDate"
                className="field"
                type="date"
                value={form.transactionDate}
                onChange={(event) => updateField('transactionDate', event.target.value)}
                required
              />
            </Field>

            <Field label="Amount" id="amount">
              <input
                id="amount"
                className="field"
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                value={form.amount}
                onChange={(event) => updateField('amount', event.target.value)}
                required
              />
            </Field>

            <Field label="Merchant" id="merchant">
              <input
                id="merchant"
                className="field"
                value={form.merchant}
                onChange={(event) => updateField('merchant', event.target.value)}
                required
              />
            </Field>

            <Field label="Currency" id="currency">
              <select
                id="currency"
                className="field"
                value={form.currency}
                onChange={(event) => updateField('currency', event.target.value)}
              >
                <option>EUR</option>
                <option>CZK</option>
                <option>USD</option>
                <option>GBP</option>
              </select>
            </Field>

            <Field label="Category" id="category">
              <select
                id="category"
                className="field"
                value={form.category}
                onChange={(event) => updateField('category', event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </Field>

            <Field label="Payment method" id="paymentMethod">
              <select
                id="paymentMethod"
                className="field"
                value={form.paymentMethod}
                onChange={(event) => updateField('paymentMethod', event.target.value)}
              >
                {paymentMethods.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4">
            <Field label="Project or event" id="project">
              <input
                id="project"
                className="field"
                value={form.project}
                onChange={(event) => updateField('project', event.target.value)}
              />
            </Field>

            <Field label="Notes" id="notes">
              <textarea
                id="notes"
                className="field min-h-28 resize-y"
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
              />
            </Field>
          </div>

          {message ? (
            <p
              className={`mt-5 rounded-md px-3 py-2 text-sm font-semibold ${
                status === 'success' ? 'bg-brand/10 text-brand' : 'bg-coral/10 text-coral'
              }`}
            >
              {message}
            </p>
          ) : null}

          <button
            className="mt-5 w-full rounded-md bg-brand px-4 py-3 font-bold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSubmit || status === 'submitting'}
            type="submit"
          >
            {status === 'submitting' ? 'Saving...' : 'Save expense'}
          </button>
        </form>
      </section>
    </main>
  );
}

function ReceiptPanel({
  receipt,
  previewUrl,
  onReceiptChange,
}: {
  receipt: File | null;
  previewUrl: string;
  onReceiptChange: (file: File | null) => void;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-ink">Receipt</h2>
        <p className="mt-1 text-sm text-ink/65">Take a photo on mobile or upload an existing image.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-brand bg-brand px-4 py-3 font-bold text-white transition hover:bg-brand/90">
          <CameraIcon />
          Take photo
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => onReceiptChange(event.target.files?.[0] ?? null)}
          />
        </label>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-white px-4 py-3 font-bold text-ink transition hover:border-brand hover:text-brand">
          <UploadIcon />
          Upload image
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => onReceiptChange(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <div className="mt-5 flex aspect-[4/5] min-h-80 items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-mist">
        {previewUrl ? (
          <img className="h-full w-full object-contain" src={previewUrl} alt="Receipt preview" />
        ) : (
          <div className="px-6 text-center text-sm font-semibold text-ink/55">No receipt selected</div>
        )}
      </div>

      {receipt ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-mist px-3 py-2">
          <span className="truncate text-sm font-semibold text-ink">{receipt.name}</span>
          <button
            className="rounded-md px-2 py-1 text-sm font-bold text-coral hover:bg-coral/10"
            onClick={() => onReceiptChange(null)}
            type="button"
          >
            Remove
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
      <path d="M4 8.5h3.2l1.5-2h6.6l1.5 2H20v10H4v-10Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
      <path d="M12 16V5m0 0 4 4m-4-4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 16v3h14v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
      <path d="M10 6H6v12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 8l4 4-4 4m4-4H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default App;
