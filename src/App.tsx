import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  User,
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';
import { ExpenseForm, SubmissionState } from './types';
import { categorySearchIndex, categoryTree, departments } from './categories';
import type { CategorySearchResult } from './categories';

const allowedEmailDomain = 'iaeste.cz';

const emptyForm: ExpenseForm = {
  name: '',
  amount: '',
  department: '',
  category: '',
  subcategory: '',
  paymentMethod: 'Invoice',
};

const categoriesSpreadsheetId =
  import.meta.env.EXPENSES_SPREADSHEET_ID ?? '1dMACC3Gyeor0Xv-mh0sN1y7sDOepLLiNeljMUqwdjWE';
const categoriesSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${categoriesSpreadsheetId}/edit`;
const receiptsFolderId =
  import.meta.env.EXPENSES_RECEIPTS_FOLDER_ID ?? '1mwZucy4X0_FLU8xP6h8qYfvH8uadM001';
const receiptsFolderUrl = `https://drive.google.com/drive/folders/${receiptsFolderId}`;

const paymentMethods = [
  { value: 'Invoice', label: 'Faktura' },
  { value: 'Cash', label: 'Hotovost' },
  { value: 'IA Card', label: 'IA karta' },
  { value: 'Private', label: 'Soukromá platba' },
  { value: 'No document', label: 'Bez dokladu' },
];

const fieldHints = {
  paymentMethod: (
    <>
      <span className="block">
        <strong>Faktura</strong> - výdaj byl uhrazen fakturou.
      </span>
      <span className="block">
        <strong>Hotovost</strong> - výdaj byl zaplacen IAESTE penězi v hotovosti.
      </span>
      <span className="block">
        <strong>IA karta</strong> - výdaj byl zaplacen IAESTE platební kartou.
      </span>
      <span className="block">
        <strong>Soukromá platba</strong> - výdaj byl zaplacen z peněz člena centra.
      </span>
      <span className="block">
        <strong>Bez dokladu</strong> - k výdaji neexistuje žádný doklad.
      </span>
    </>
  ),
  categorySearch:
    'Začněte psát název oddělení, kategorie nebo subkategorie a vyberte odpovídající položku ze seznamu.',
};

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

  if (!isAllowedWorkspaceEmail(user.email)) {
    return <AccessDenied user={user} />;
  }

  if (!user.emailVerified) {
    return <UnverifiedAccount user={user} onRefresh={() => refreshAuthView((current) => current + 1)} />;
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
  return <GoogleAuthScreen />;
}

function GoogleAuthScreen() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleGoogleSignIn() {
    setBusy(true);
    setError('');

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        hd: allowedEmailDomain,
        prompt: 'select_account',
      });

      const credential = await signInWithPopup(auth, provider);

      if (!isAllowedWorkspaceEmail(credential.user.email)) {
        await signOut(auth);
        setError('Přihlášení je povoleno pouze pro Google Workspace účty s doménou iaeste.cz.');
      }
    } catch (error) {
      setError(getGoogleSignInErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-8 sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <div className="w-full rounded-lg border border-line bg-white p-5 shadow-panel sm:p-7">
          <div className="mb-7">
            <p className="text-sm font-bold uppercase tracking-wide text-brand">IAESTE LC Brno</p>
            <h1 className="mt-2 text-3xl font-bold text-ink">Expense manager</h1>
            <p className="mt-3 text-sm leading-6 text-ink/70">
              Přihlaste se firemním Google účtem s doménou @{allowedEmailDomain}.
            </p>
          </div>

          {error ? <p className="mt-4 rounded-md bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p> : null}

          <button
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-md border border-line bg-white px-4 py-3 font-bold text-ink transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            onClick={() => void handleGoogleSignIn()}
            type="button"
          >
            <GoogleIcon />
            {busy ? 'Přihlašuji...' : 'Přihlásit se přes Google'}
          </button>
        </div>
      </section>
    </main>
  );
}

function AccessDenied({ user }: { user: User }) {
  return (
    <main className="min-h-screen bg-mist px-4 py-8 sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <div className="w-full rounded-lg border border-line bg-white p-5 shadow-panel sm:p-7">
          <div className="mb-7">
            <p className="text-sm font-bold uppercase tracking-wide text-brand">IAESTE LC Brno</p>
            <h1 className="mt-2 text-3xl font-bold text-ink">Přístup zamítnut</h1>
          </div>

          <p className="text-sm leading-6 text-ink/70">
            Přihlášený účet <strong className="text-ink">{user.email}</strong> nepatří do povolené domény @
            {allowedEmailDomain}.
          </p>

          <button
            className="mt-6 w-full rounded-md border border-line bg-white px-4 py-3 font-bold text-ink/70 transition hover:border-coral hover:text-coral"
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

function UnverifiedAccount({ user, onRefresh }: { user: User; onRefresh: () => void }) {
  async function refreshUser() {
    await user.reload();
    await user.getIdToken(true);
    onRefresh();
  }

  return (
    <main className="min-h-screen bg-mist px-4 py-8 sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center">
        <div className="w-full rounded-lg border border-line bg-white p-5 shadow-panel sm:p-7">
          <div className="mb-7">
            <p className="text-sm font-bold uppercase tracking-wide text-brand">IAESTE LC Brno</p>
            <h1 className="mt-2 text-3xl font-bold text-ink">Neověřený účet</h1>
          </div>

          <p className="text-sm leading-6 text-ink/70">
            Google účet <strong className="text-ink">{user.email}</strong> není ve Firebase označený jako ověřený.
          </p>

          <button
            className="mt-6 w-full rounded-md bg-brand px-4 py-3 font-bold text-white transition hover:bg-brand/90"
            onClick={() => void refreshUser()}
            type="button"
          >
            Zkontrolovat znovu
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
  const selectedDepartment = departments.find((department) => department.value === form.department);
  const selectedCategories = categoryTree[form.department as keyof typeof categoryTree] ?? [];
  const selectedCategory = selectedCategories.find((category) => category.value === form.category);
  const selectedSubcategories = selectedCategory?.subcategories ?? [];
  const categorySearchPlaceholder =
    selectedDepartment && selectedCategory && form.subcategory
      ? `${selectedDepartment.label} / ${selectedCategory.label} / ${form.subcategory}`
      : 'Např. Prostory';
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
    <main className="min-h-screen overflow-x-hidden bg-[#f5f7f8]">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-brand sm:text-sm">IAESTE LC Brno</p>
            <h1 className="truncate text-2xl font-bold text-ink">Expense manager</h1>
            <p className="mt-0.5 truncate text-sm text-ink/70 sm:hidden">{formattedUser}</p>
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden max-w-56 truncate text-sm text-ink/70 sm:block">{formattedUser}</span>
            <button className="icon-button" onClick={() => void signOut(auth)} type="button" title="Odhlásit se">
              <LogOutIcon />
            </button>
          </div>
        </div>
      </header>

      <form onSubmit={submitExpense} className="mx-auto grid max-w-6xl gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:py-10">
        <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]">
          <section className="min-w-0 rounded-lg border border-line bg-white p-3 shadow-panel sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-ink">Výdaj</h2>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Název" id="name">
              <input
                id="name"
                className="field"
                placeholder="Např. Catering"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                required
              />
              </Field>
            </div>

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

            <Field
              label="Způsob platby"
              id="paymentMethod"
              hint={fieldHints.paymentMethod}
            >
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

          <div className="mt-5 rounded-lg border border-line bg-mist/70 p-3 sm:p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <h3 className="text-base font-bold text-ink">Zařazení výdaje</h3>
              <span className="max-w-full break-words rounded-md bg-white px-2.5 py-1 text-xs font-bold text-ink/65 sm:text-right">
                {form.department && form.category && form.subcategory
                  ? `${form.department} / ${form.category} / ${form.subcategory}`
                  : 'Nevybráno'}
              </span>
            </div>

            <div className="grid gap-4">
              <Field
                label="Vyhledat kategorii"
                id="categorySearch"
                hint={fieldHints.categorySearch}
              >
                <div className="relative">
                  <input
                    id="categorySearch"
                    className="field"
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                    placeholder={categorySearchPlaceholder}
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
                    required
                  >
                    <option value="" disabled>
                      Vyberte oddělení
                    </option>
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
                    <option value="" disabled>
                      Vyberte kategorii
                    </option>
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
                    <option value="" disabled>
                      Vyberte subkategorii
                    </option>
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
        </div>

        {message ? (
          <p
            className={`rounded-md px-3 py-2 text-sm font-semibold ${status === 'success' ? 'bg-green-100 text-green-800' : 'bg-coral/10 text-coral'
              }`}
          >
            {message}
          </p>
        ) : null}

        <div className="grid gap-3 sm:ml-auto sm:w-auto sm:grid-cols-3">
          <a
            className="order-2 block w-full rounded-md border border-line bg-white px-4 py-2.5 text-center font-bold text-ink transition hover:border-brand hover:text-brand focus:outline-none focus:ring-4 focus:ring-brand/15 sm:order-1 sm:w-52"
            href={categoriesSpreadsheetUrl}
            rel="noreferrer"
            target="_blank"
          >
            Otevřít tabulku výdajů
          </a>
          <a
            className="order-3 block w-full rounded-md border border-line bg-white px-4 py-2.5 text-center font-bold text-ink transition hover:border-brand hover:text-brand focus:outline-none focus:ring-4 focus:ring-brand/15 sm:order-2 sm:w-52"
            href={receiptsFolderUrl}
            rel="noreferrer"
            target="_blank"
          >
            Otevřít složku účtenek
          </a>
          <button
            className="order-1 w-full rounded-md bg-brand px-4 py-2.5 font-bold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60 sm:order-3 sm:w-52"
            disabled={!canSubmit || status === 'submitting'}
            type="submit"
          >
            {status === 'submitting' ? 'Ukládám...' : 'Uložit výdaj'}
          </button>
        </div>
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
    <section className="flex min-w-0 flex-col rounded-lg border border-line bg-white p-3 shadow-panel sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-ink">Účtenka</h2>
        <p className="mt-1 text-sm text-ink/65">Vyfoťte účtenku na mobilu nebo nahrajte existující obrázek.</p>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-brand bg-brand px-3 py-3 font-bold text-white transition hover:bg-brand/90 sm:px-4">
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

        <label className="flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-white px-3 py-3 font-bold text-ink transition hover:border-brand hover:text-brand sm:px-4">
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

      <div className="mt-5 flex aspect-[7/5] min-h-56 items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-mist sm:min-h-80 lg:flex-1 lg:aspect-auto">
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

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string;
  id: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  const hintId = `${id}-hint`;

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex min-w-0 items-center gap-2">
        <label className="block text-sm font-semibold text-ink" htmlFor={id}>
          {label}
        </label>
        {hint ? (
          <span className="group relative inline-flex">
            <button
              aria-describedby={hintId}
              aria-label={`Nápověda: ${label}`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-white text-xs font-bold leading-none text-ink/65 transition hover:border-brand hover:text-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
              type="button"
            >
              ?
            </button>
            <span
              className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md border border-line bg-white px-3 py-2 text-sm font-normal leading-5 text-ink shadow-panel group-hover:block group-focus-within:block sm:left-0 sm:translate-x-0"
              id={hintId}
              role="tooltip"
            >
              {hint}
            </span>
          </span>
        ) : null}
      </div>
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

function isAllowedWorkspaceEmail(email: string | null) {
  return Boolean(email?.toLowerCase().endsWith(`@${allowedEmailDomain}`));
}

function getGoogleSignInErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Přihlášení bylo zrušeno.';
  }

  if (code === 'auth/popup-blocked') {
    return 'Prohlížeč zablokoval přihlašovací okno. Povolte vyskakovací okna a zkuste to znovu.';
  }

  if (code === 'auth/account-exists-with-different-credential') {
    return 'Pro tento e-mail už ve Firebase existuje jiný způsob přihlášení. Smažte nebo propojte původní e-mail/heslo účet.';
  }

  return 'Přihlášení přes Google se nepodařilo.';
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
      <path
        d="M21.8 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.2c1.9-1.8 3.1-4.3 3.1-7.4Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 5-0.9 6.7-2.4L15.5 17c-.9.6-2 .9-3.5.9a6.1 6.1 0 0 1-5.7-4.2H3v2.6A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path d="M6.3 13.7a6 6 0 0 1 0-3.4V7.7H3a10 10 0 0 0 0 8.6l3.3-2.6Z" fill="#FBBC05" />
      <path
        d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.7l3.3 2.6A6.1 6.1 0 0 1 12 6.1Z"
        fill="#EA4335"
      />
    </svg>
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
