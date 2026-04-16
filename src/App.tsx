import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  User,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth } from './firebase';
import { ExpenseForm, SubmissionState } from './types';
import { categorySearchIndex, categoryTree, departments } from './categories';
import type { CategorySearchResult } from './categories';

const emptyForm: ExpenseForm = {
  name: '',
  amount: '',
  department: 'PR',
  category: 'Promo akce',
  subcategory: 'Zaškolovák 1+2',
  paymentMethod: 'Invoice',
};

const categoriesSpreadsheetId =
  import.meta.env.EXPENSES_SPREADSHEET_ID ?? '1dMACC3Gyeor0Xv-mh0sN1y7sDOepLLiNeljMUqwdjWE';
const categoriesSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${categoriesSpreadsheetId}/edit`;

const paymentMethods = [
  { value: 'Invoice', label: 'Faktura' },
  { value: 'Cash', label: 'Hotovost' },
  { value: 'IA Card', label: 'IA karta' },
  { value: 'Private', label: 'Soukromá platba' },
  { value: 'No document', label: 'Bez dokladu' },
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [, refreshAuthView] = useState(0);

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

  if (!user) {
    return <AuthScreen />;
  }

  if (!user.emailVerified) {
    return <VerifyEmail user={user} onVerified={() => refreshAuthView((current) => current + 1)} />;
  }

  return <ExpenseApp user={user} />;
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-mist px-5">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand" />
    </main>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<'signIn' | 'register'>('signIn');

  return mode === 'signIn' ? (
    <SignIn onShowRegister={() => setMode('register')} />
  ) : (
    <Register onShowSignIn={() => setMode('signIn')} />
  );
}

function SignIn({ onShowRegister }: { onShowRegister: () => void }) {
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
      setError('E-mail nebo heslo není správné.');
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
            E-mail
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
            Heslo
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
            {busy ? 'Přihlašuji...' : 'Přihlásit se'}
          </button>

          <button
            className="mt-3 w-full rounded-md border border-line bg-white px-4 py-3 font-bold text-ink transition hover:border-brand hover:text-brand"
            onClick={onShowRegister}
            type="button"
          >
            Vytvořit účet
          </button>
        </form>
      </section>
    </main>
  );
}

function Register({ onShowSignIn }: { onShowSignIn: () => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName) {
      setError('Zadejte celé jméno.');
      setBusy(false);
      return;
    }

    if (!normalizedEmail.endsWith('@iaeste.cz')) {
      setError('Registrace je povolena pouze pro e-mail s doménou iaeste.cz.');
      setBusy(false);
      return;
    }

    try {
      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      await updateProfile(credential.user, { displayName: normalizedName });
      await sendEmailVerification(credential.user);
      await credential.user.getIdToken(true);
    } catch (error) {
      setError(getRegistrationErrorMessage(error));
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
            <h1 className="mt-2 text-3xl font-bold text-ink">Registrace</h1>
          </div>

          <label className="label" htmlFor="fullName">
            Celé jméno
          </label>
          <input
            id="fullName"
            className="field mb-4"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />

          <label className="label" htmlFor="registerEmail">
            E-mail
          </label>
          <input
            id="registerEmail"
            className="field mb-4"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label className="label" htmlFor="registerPassword">
            Heslo
          </label>
          <input
            id="registerPassword"
            className="field"
            type="password"
            autoComplete="new-password"
            minLength={6}
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
            {busy ? 'Vytvářím účet...' : 'Registrovat se'}
          </button>

          <button
            className="mt-3 w-full rounded-md border border-line bg-white px-4 py-3 font-bold text-ink transition hover:border-brand hover:text-brand"
            onClick={onShowSignIn}
            type="button"
          >
            Zpět na přihlášení
          </button>
        </form>
      </section>
    </main>
  );
}

function VerifyEmail({ user, onVerified }: { user: User; onVerified: () => void }) {
  const [message, setMessage] = useState('Ověřovací e-mail byl odeslán.');
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState<'check' | 'send' | ''>('');

  async function checkVerification() {
    setBusyAction('check');
    setError('');
    setMessage('');

    try {
      await reload(user);
      await user.getIdToken(true);

      if (auth.currentUser?.emailVerified || user.emailVerified) {
        onVerified();
        return;
      }

      setError('E-mail zatím není ověřený.');
    } catch {
      setError('Ověření se nepodařilo zkontrolovat.');
    } finally {
      setBusyAction('');
    }
  }

  async function resendVerification() {
    setBusyAction('send');
    setError('');
    setMessage('');

    try {
      await sendEmailVerification(user);
      setMessage('Ověřovací e-mail byl znovu odeslán.');
    } catch {
      setError('Ověřovací e-mail se nepodařilo odeslat.');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-8 sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <div className="w-full rounded-lg border border-line bg-white p-5 shadow-panel sm:p-7">
          <div className="mb-7">
            <p className="text-sm font-bold uppercase tracking-wide text-brand">IAESTE LC Brno</p>
            <h1 className="mt-2 text-3xl font-bold text-ink">Ověření e-mailu</h1>
          </div>

          <p className="text-sm leading-6 text-ink/70">
            Pro pokračování ověřte e-mailovou adresu <strong className="text-ink">{user.email}</strong>. Po kliknutí
            na odkaz v e-mailu se vraťte sem a zkontrolujte ověření.
          </p>

          {message ? <p className="mt-4 rounded-md bg-green-100 px-3 py-2 text-sm text-green-800">{message}</p> : null}
          {error ? <p className="mt-4 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}

          <button
            className="mt-6 w-full rounded-md bg-brand px-4 py-3 font-bold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={Boolean(busyAction)}
            onClick={() => void checkVerification()}
            type="button"
          >
            {busyAction === 'check' ? 'Kontroluji...' : 'Zkontrolovat ověření'}
          </button>

          <button
            className="mt-3 w-full rounded-md border border-line bg-white px-4 py-3 font-bold text-ink transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
            disabled={Boolean(busyAction)}
            onClick={() => void resendVerification()}
            type="button"
          >
            {busyAction === 'send' ? 'Odesílám...' : 'Poslat e-mail znovu'}
          </button>

          <button
            className="mt-3 w-full rounded-md border border-line bg-white px-4 py-3 font-bold text-ink/70 transition hover:border-coral hover:text-coral"
            onClick={() => void signOut(auth)}
            type="button"
          >
            Odhlásit se
          </button>
        </div>
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
  const [categorySearch, setCategorySearch] = useState('');

  const formattedUser = user.displayName ?? 'Přihlášeno';
  const selectedCategories = categoryTree[form.department as keyof typeof categoryTree] ?? [];
  const selectedCategory = selectedCategories.find((category) => category.value === form.category);
  const selectedSubcategories = selectedCategory?.subcategories ?? [];
  const categorySearchResults = useMemo(() => {
    const query = normalizeText(categorySearch);
    if (!query) return [];

    return categorySearchIndex
      .filter((item) =>
        normalizeText(`${item.departmentLabel} ${item.categoryLabel} ${item.subcategory}`).includes(query),
      )
      .slice(0, 6);
  }, [categorySearch]);

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
    return Boolean(
      receipt &&
      form.name.trim() &&
      form.category.trim() &&
      form.subcategory.trim() &&
        parseAmount(form.amount) > 0,
    );
  }, [form, receipt]);

  function updateField<Key extends keyof ExpenseForm>(key: Key, value: ExpenseForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateAmount(value: string) {
    const normalized = value.replace('.', ',').replace(/[^0-9,]/g, '');
    const [whole = '', ...decimalParts] = normalized.split(',');
    const decimal = decimalParts.join('').slice(0, 2);
    updateField('amount', decimalParts.length > 0 ? `${whole},${decimal}` : whole);
  }

  function formatAmount() {
    const amount = parseAmount(form.amount);
    if (Number.isFinite(amount) && amount > 0) {
      updateField('amount', amount.toFixed(2).replace('.', ','));
    }
  }

  function updateDepartment(department: string) {
    const nextCategories = categoryTree[department as keyof typeof categoryTree] ?? [];
    const nextCategory = nextCategories[0];
    const nextSubcategory = nextCategory?.subcategories[0] ?? '';

    setForm((current) => ({
      ...current,
      department,
      category: nextCategory?.value ?? '',
      subcategory: nextSubcategory,
    }));
  }

  function updateCategory(category: string) {
    const nextCategory = selectedCategories.find((item) => item.value === category);
    const nextSubcategory = nextCategory?.subcategories[0] ?? '';

    setForm((current) => ({
      ...current,
      category,
      subcategory: nextSubcategory,
    }));
  }

  function applyCategorySearchResult(result: CategorySearchResult) {
    setForm((current) => ({
      ...current,
      department: result.department,
      category: result.category,
      subcategory: result.subcategory,
    }));
    setCategorySearch('');
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receipt || !canSubmit) return;

    setStatus('submitting');
    setMessage('');

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      payload.append(key, key === 'amount' ? value.replace(',', '.') : value);
    });
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
        throw new Error(errorPayload?.error ?? 'Výdaj se nepodařilo odeslat.');
      }

      setStatus('success');
      setMessage('Výdaj byl uložen.');
      setForm(emptyForm);
      setReceipt(null);
      setCategorySearch('');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Výdaj se nepodařilo odeslat.');
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7f8]">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-brand">IAESTE LC Brno</p>
            <h1 className="text-xl font-bold text-ink sm:text-2xl">Expense manager</h1>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span className="max-w-36 truncate text-sm text-ink/70 sm:max-w-56">{formattedUser}</span>
            <button className="icon-button" onClick={() => void signOut(auth)} type="button" title="Odhlásit se">
              <LogOutIcon />
            </button>
          </div>
        </div>
      </header>

      <form onSubmit={submitExpense} className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:px-6 lg:py-10">
        <section className="rounded-lg border border-line bg-white p-4 shadow-panel sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-ink">Výdaj</h2>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Název" id="name">
              <input
                id="name"
                className="field"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                required
              />
            </Field>

            <Field label="Částka" id="amount">
              <div className="relative">
                <input
                  id="amount"
                  className="field pr-16"
                  inputMode="decimal"
                  placeholder="0.00"
                  type="text"
                  value={form.amount}
                  onBlur={formatAmount}
                  onChange={(event) => updateAmount(event.target.value)}
                  required
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-bold text-ink/55">
                  CZK
                </span>
              </div>
            </Field>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Způsob platby" id="paymentMethod">
                <select
                  id="paymentMethod"
                  className="field"
                  value={form.paymentMethod}
                  onChange={(event) => updateField('paymentMethod', event.target.value)}
                >
                  {paymentMethods.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-line bg-mist/70 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-bold text-ink">Zařazení výdaje</h3>
              <span className="rounded-md bg-white px-2.5 py-1 text-xs font-bold text-ink/65">
                {form.department} / {form.category} / {form.subcategory}
              </span>
            </div>

            <div className="grid gap-4">
              <Field label="Vyhledat kategorii" id="categorySearch">
                <div className="relative">
                  <input
                    id="categorySearch"
                    className="field"
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                    placeholder="Např. Prostory"
                    type="search"
                  />
                  {categorySearch ? (
                    <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-md border border-line bg-white shadow-panel">
                      {categorySearchResults.length > 0 ? (
                        categorySearchResults.map((result) => (
                          <button
                            key={`${result.department}-${result.category}-${result.subcategory}`}
                            className="block w-full px-3 py-3 text-left text-sm hover:bg-mist focus:bg-mist focus:outline-none"
                            onClick={() => applyCategorySearchResult(result)}
                            type="button"
                          >
                            <span className="block font-bold text-ink">{result.subcategory}</span>
                            <span className="block text-ink/65">
                              {result.departmentLabel} / {result.categoryLabel}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-3 text-sm font-semibold text-ink/55">Žádný výsledek</div>
                      )}
                    </div>
                  ) : null}
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Oddělení" id="department">
                  <select
                    id="department"
                    className="field"
                    value={form.department}
                    onChange={(event) => updateDepartment(event.target.value)}
                  >
                    {departments.map((department) => (
                      <option key={department.value} value={department.value}>
                        {department.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Kategorie" id="category">
                  <select
                    id="category"
                    className="field"
                    value={form.category}
                    onChange={(event) => updateCategory(event.target.value)}
                    required
                  >
                    {selectedCategories.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Subkategorie" id="subcategory">
                  <select
                    id="subcategory"
                    className="field"
                    value={form.subcategory}
                    onChange={(event) => updateField('subcategory', event.target.value)}
                    required
                  >
                    {selectedSubcategories.map((subcategory) => (
                      <option key={subcategory} value={subcategory}>
                        {subcategory}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </div>

        </section>

        <ReceiptPanel receipt={receipt} previewUrl={previewUrl} onReceiptChange={setReceipt} />

        {message ? (
          <p
            className={`rounded-md px-3 py-2 text-sm font-semibold ${status === 'success' ? 'bg-green-100 text-green-800' : 'bg-coral/10 text-coral'
              }`}
          >
            {message}
          </p>
        ) : null}

        <button
          className="w-full rounded-md bg-brand px-4 py-3 font-bold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSubmit || status === 'submitting'}
          type="submit"
        >
          {status === 'submitting' ? 'Ukládám...' : 'Uložit výdaj'}
        </button>
        <a
          className="block w-full rounded-md border border-line bg-white px-4 py-3 text-center font-bold text-ink transition hover:border-brand hover:text-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
          href={categoriesSpreadsheetUrl}
          rel="noreferrer"
          target="_blank"
        >
          Otevřít tabulku výdajů
        </a>
      </form>
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
        <h2 className="text-xl font-bold text-ink">Účtenka</h2>
        <p className="mt-1 text-sm text-ink/65">Vyfoťte účtenku na mobilu nebo nahrajte existující obrázek.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-brand bg-brand px-4 py-3 font-bold text-white transition hover:bg-brand/90">
          <CameraIcon />
          Vyfotit
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
          Nahrát obrázek
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={(event) => onReceiptChange(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <div className="mt-5 flex aspect-[7/5] min-h-80 items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-mist">
        {previewUrl ? (
          <img className="h-full w-full object-contain" src={previewUrl} alt="Náhled účtenky" />
        ) : (
          <div className="px-6 text-center text-sm font-semibold text-ink/55">Není vybraná žádná účtenka</div>
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
            Odebrat
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

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseAmount(value: string) {
  return Number(value.replace(',', '.'));
}

function getRegistrationErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  if (code === 'auth/email-already-in-use') {
    return 'Účet s tímto e-mailem už existuje.';
  }

  if (code === 'auth/weak-password') {
    return 'Heslo musí mít alespoň 6 znaků.';
  }

  if (code === 'auth/invalid-email') {
    return 'E-mail není ve správném formátu.';
  }

  return 'Registrace se nepodařila.';
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
