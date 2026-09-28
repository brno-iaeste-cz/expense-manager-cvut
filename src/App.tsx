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
import {
  getReceiptAcceptAttribute,
  getReceiptPreviewType,
  isSupportedReceiptFile,
  prepareReceiptFiles,
} from './receipt-file';

const allowedEmailDomain = 'iaeste.cz';
const logoSrc = '/iaeste-lc-cvut-logo.png';

const emptyForm = createEmptyForm();

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
    'Začněte psát název rozpočtu nebo podskupiny a vyberte odpovídající položku ze seznamu.',
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
          <div className="mb-7 text-center">
            <img className="mx-auto h-auto w-full max-w-72 object-contain" src={logoSrc} alt="IAESTE LC ČVUT" />
            <h1 className="mt-2 text-3xl font-bold text-ink">Expense manager</h1>
            <p className="mt-3 text-sm leading-6 text-ink/70">
              Přihlaste se Google účtem s doménou @{allowedEmailDomain}.
            </p>
          </div>

          {error ? <p className="mt-4 rounded-md bg-coral/10 px-3 py-2 text-sm text-red-700">{error}</p> : null}

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
            <p className="text-sm font-bold uppercase tracking-wide text-brand">IAESTE LC ČVUT</p>
            <h1 className="mt-2 text-3xl font-bold text-ink">Přístup zamítnut</h1>
          </div>

          <p className="text-sm leading-6 text-ink/70">
            Přihlášený účet <strong className="text-ink">{user.email}</strong> nepatří do povolené domény @
            {allowedEmailDomain}.
          </p>

          <button
            className="mt-6 w-full rounded-md border border-line bg-white px-4 py-3 font-bold text-ink/70 transition hover:border-red-700 hover:text-red-700"
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
            <p className="text-sm font-bold uppercase tracking-wide text-brand">IAESTE LC ČVUT</p>
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
            className="mt-3 w-full rounded-md border border-line bg-white px-4 py-3 font-bold text-ink/70 transition hover:border-red-700 hover:text-red-700"
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
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [preparedReceipt, setPreparedReceipt] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [receiptProcessing, setReceiptProcessing] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const [status, setStatus] = useState<SubmissionState>('idle');
  const [message, setMessage] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailStatus, setEmailStatus] = useState<SubmissionState>('idle');
  const [emailMessage, setEmailMessage] = useState('');

  const formattedUser = user.displayName ?? 'Přihlášeno';
  const selectedDepartment = departments.find((department) => department.value === form.department);
  const selectedCategories = categoryTree[form.department as keyof typeof categoryTree] ?? [];
  const selectedCategory = selectedCategories.find((category) => category.value === form.category);
  const selectedDepartmentLabel = selectedDepartment?.label ?? form.department;
  const selectedCategoryLabel = selectedCategory?.label ?? form.category;
  const categorySearchPlaceholder =
    selectedDepartment && selectedCategory
      ? `${selectedDepartmentLabel} / ${selectedCategoryLabel}`
      : 'Např. Prostory';
  const categorySearchResults = useMemo(() => {
    const query = normalizeText(categorySearch);
    if (!query) return [];

    return categorySearchIndex
      .filter((item) =>
        normalizeText(`${item.departmentLabel} ${item.categoryLabel}`).includes(query),
      )
      .slice(0, 6);
  }, [categorySearch]);
  const needsReceipt = form.paymentMethod !== 'No document';
  const selectedPaymentMethodLabel =
    paymentMethods.find((method) => method.value === form.paymentMethod)?.label ?? form.paymentMethod;
  const defaultEmailSubject = buildDefaultEmailSubject(form.name);
  const defaultEmailBody = buildDefaultEmailBody(form.name, form.amount, selectedPaymentMethodLabel, formattedUser);

  useEffect(() => {
    if (!preparedReceipt) {
      setPreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(preparedReceipt);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preparedReceipt]);

  const canSubmit = useMemo(() => {
    return Boolean(
      (!needsReceipt || preparedReceipt) &&
      form.name.trim() &&
      form.storeName.trim() &&
      form.approvedBy.trim() &&
      form.expenseDate.trim() &&
      form.category.trim() &&
      form.department.trim() &&
        parseAmount(form.amount) > 0,
    );
  }, [form, needsReceipt, preparedReceipt]);

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

    setForm((current) => ({
      ...current,
      department,
      category: nextCategory?.value ?? '',
    }));
  }

  function updateCategory(category: string) {

    setForm((current) => ({
      ...current,
      category,
    }));
  }

  function applyCategorySearchResult(result: CategorySearchResult) {
    setForm((current) => ({
      ...current,
      department: result.departmentValue,
      category: result.categoryValue,
    }));
    setCategorySearch('');
  }

  async function prepareAndSetReceiptFiles(nextFiles: File[]) {
    setReceiptFiles(nextFiles);
    setPreparedReceipt(null);
    setReceiptProcessing(true);

    try {
      const normalizedReceipt = await prepareReceiptFiles(nextFiles);
      setPreparedReceipt(normalizedReceipt);
    } catch (error) {
      setReceiptFiles([]);
      setPreparedReceipt(null);
      setReceiptError(error instanceof Error ? error.message : 'Doklad se nepodařilo zpracovat.');
    } finally {
      setReceiptProcessing(false);
    }
  }

  async function handleReceiptChange(nextFiles: File[]) {
    setStatus('idle');
    setMessage('');
    setEmailStatus('idle');
    setEmailMessage('');
    setReceiptError('');

    if (nextFiles.length === 0) {
      setReceiptFiles([]);
      setPreparedReceipt(null);
      setReceiptProcessing(false);
      return;
    }

    if (nextFiles.some((file) => !isSupportedReceiptFile(file))) {
      setReceiptFiles([]);
      setPreparedReceipt(null);
      setReceiptProcessing(false);
      setReceiptError('Podporované jsou pouze obrázky a PDF dokumenty.');
      return;
    }

    await prepareAndSetReceiptFiles(nextFiles);
  }

  async function handleReceiptReorder(fromIndex: number, toIndex: number) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= receiptFiles.length ||
      toIndex >= receiptFiles.length
    ) {
      return;
    }

    setStatus('idle');
    setMessage('');
    setEmailStatus('idle');
    setEmailMessage('');
    setReceiptError('');

    await prepareAndSetReceiptFiles(moveReceiptFile(receiptFiles, fromIndex, toIndex));
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setStatus('submitting');
    setMessage('');

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key === 'amount') {
        payload.append(key, value.replace(',', '.'));
        return;
      }

      payload.append(key, value);
    });
    if (preparedReceipt) {
      payload.append('receipt', preparedReceipt);
    }

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
      setMessage('Výdaj byl uložen. Pro zadání nového výdaje obnovte stránku.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Výdaj se nepodařilo odeslat.');
    }
  }

  async function sendExpenseEmail() {
    if (!preparedReceipt || emailStatus === 'submitting') return;

    setEmailStatus('submitting');
    setEmailMessage('');

    const payload = new FormData();
    payload.append('subject', emailSubject.trim() || defaultEmailSubject);
    payload.append('body', emailBody.trim() || defaultEmailBody);
    Object.entries(form).forEach(([key, value]) => {
      payload.append(key, key === 'amount' ? value.replace(',', '.') : value);
    });
    payload.append('receipt', preparedReceipt);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/expense-email', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: payload,
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorPayload?.error ?? 'E-mail se nepodarilo odeslat.');
      }

      setEmailStatus('success');
      setEmailMessage('E-mail byl odeslán.');
    } catch (error) {
      setEmailStatus('error');
      setEmailMessage(error instanceof Error ? error.message : 'E-mail se nepodarilo odeslat.');
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f7f8]">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img className="h-auto min-w-14 flex-1 object-contain sm:w-40 sm:flex-none" src={logoSrc} alt="IAESTE LC ČVUT" />
            <div className="w-[10.8rem] shrink-0 sm:w-[13.8rem]">
              <h1 className="whitespace-nowrap text-[1.32rem] font-bold leading-tight text-ink sm:text-[1.7rem]">Expense manager</h1>
              <p className="mt-0.5 truncate text-sm text-ink/70 sm:hidden">{formattedUser}</p>
            </div>
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
            <div>
              <Field label="Název výdaje" id="name">
              <input
                id="name"
                className="field text-base"
                placeholder="Např. Catering"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                required
              />
              </Field>
            </div>

            <Field label="Název obchodu" id="storeName">
              <input
                id="storeName"
                className="field text-base"
                placeholder="Např. Kaufland"
                value={form.storeName}
                onChange={(event) => updateField('storeName', event.target.value)}
                maxLength={160}
                required
              />
            </Field>

            <Field label="Datum uskutečnění výdaje" id="expenseDate">
              <input
                id="expenseDate"
                className="field text-base"
                type="date"
                value={form.expenseDate}
                onChange={(event) => updateField('expenseDate', event.target.value)}
                required
              />
            </Field>

            <Field label="Kdo to schválil" id="approvedBy">
              <input
                id="approvedBy"
                className="field text-base"
                placeholder="Jméno schvalujícího"
                value={form.approvedBy}
                onChange={(event) => updateField('approvedBy', event.target.value)}
                maxLength={160}
                required
              />
            </Field>

            <Field label="Částka" id="amount">
              <div className="relative">
                <input
                  id="amount"
                  className="field pr-16 text-base"
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
                  className="field text-base"
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
                {form.department && form.category
                  ? `${selectedDepartmentLabel} / ${selectedCategoryLabel}`
                  : 'Nevybráno'}
              </span>
            </div>

            <div className="grid gap-4">
              <Field
                label="Vyhledat rozpočet nebo podskupinu"
                id="categorySearch"
                hint={fieldHints.categorySearch}
              >
                <div className="relative">
                  <input
                    id="categorySearch"
                    className="field text-base"
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
                            key={`${result.departmentValue}-${result.categoryValue}`}
                            className="block w-full px-3 py-3 text-left text-sm hover:bg-mist focus:bg-mist focus:outline-none"
                            onClick={() => applyCategorySearchResult(result)}
                            type="button"
                          >
                            <span className="block font-bold text-ink">{result.categoryLabel}</span>
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

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Rozpočet" id="department">
                  <select
                    id="department"
                    className="field text-base"
                    value={form.department}
                    onChange={(event) => updateDepartment(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Vyberte rozpočet
                    </option>
                    {departments.map((department) => (
                      <option key={department.value} value={department.value}>
                        {department.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Podskupina" id="category">
                  <select
                    id="category"
                    className="field text-base"
                    value={form.category}
                    onChange={(event) => updateCategory(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Vyberte podskupinu
                    </option>
                    {selectedCategories.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </Field>

              </div>
            </div>
          </div>

          </section>

          <ReceiptPanel
            receiptFiles={receiptFiles}
            preparedReceipt={preparedReceipt}
            previewUrl={previewUrl}
            receiptError={receiptError}
            receiptProcessing={receiptProcessing}
            onReceiptChange={(files) => void handleReceiptChange(files)}
            onReceiptReorder={(fromIndex, toIndex) => void handleReceiptReorder(fromIndex, toIndex)}
          />
        </div>

        <div className="grid gap-3 min-[600px]:grid-cols-2 min-[1025px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[1025px]:items-start">
          {status === 'success' ? (
            <p className="rounded-md px-3 pb-3 text-center text-xl font-extrabold text-red-700 min-[600px]:col-span-2 min-[1025px]:col-span-3 min-[1025px]:text-2xl">
              Fyzickou účtenku uschovejte do složky v kanceláři!
            </p>
          ) : null}

          {message ? (
            <div className="flex justify-center min-[600px]:col-span-2 min-[1025px]:col-span-3">
              <p
                className={`w-fit rounded-md px-3 py-2 text-center text-sm font-semibold ${status === 'success' ? 'bg-green-100 text-green-800' : 'bg-coral/10 text-red-700'
                  }`}
              >
                {message}
              </p>
            </div>
          ) : null}

          <div className="contents min-[600px]:grid min-[600px]:gap-3 min-[1025px]:grid-cols-2">
            <a
              className="order-3 block w-full rounded-md border border-line bg-white px-4 py-2.5 text-center font-bold text-ink transition hover:border-brand hover:text-brand focus:outline-none focus:ring-4 focus:ring-brand/15 min-[600px]:order-none min-[1025px]:w-52"
              href={categoriesSpreadsheetUrl}
              rel="noreferrer"
              target="_blank"
            >
              Otevřít tabulku výdajů
            </a>
            <a
              className="order-4 block w-full rounded-md border border-line bg-white px-4 py-2.5 text-center font-bold text-ink transition hover:border-brand hover:text-brand focus:outline-none focus:ring-4 focus:ring-brand/15 min-[600px]:order-none min-[1025px]:w-52"
              href={receiptsFolderUrl}
              rel="noreferrer"
              target="_blank"
            >
              Otevřít složku účtenek
            </a>
          </div>

          <div className="contents min-[600px]:grid min-[600px]:gap-3 min-[1025px]:col-start-3 min-[1025px]:w-[27rem]">
            <div className="contents min-[600px]:grid min-[600px]:gap-3 min-[1025px]:grid-cols-2">
              <button
                className="order-2 w-full rounded-md border border-line bg-white px-4 py-2.5 font-bold text-ink transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60 min-[600px]:order-none min-[1025px]:w-52"
                disabled={!preparedReceipt || receiptProcessing}
                onClick={() => {
                  setEmailSubject(buildDefaultEmailSubject(form.name));
                  setEmailBody(buildDefaultEmailBody(form.name, form.amount, selectedPaymentMethodLabel, formattedUser));
                  setEmailDialogOpen(true);
                  setEmailStatus('idle');
                  setEmailMessage('');
                }}
                type="button"
              >
                E-mail
              </button>
              <button
                className="order-1 w-full rounded-md bg-brand px-4 py-2.5 font-bold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60 min-[600px]:order-none min-[1025px]:w-52"
                disabled={!canSubmit || status === 'submitting'}
                type="submit"
              >
                {status === 'submitting' ? 'Ukládám...' : 'Uložit výdaj'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {emailDialogOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-lg border border-line bg-white p-5 shadow-panel sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-ink">E-mail s dokladem</h2>
                <p className="mt-1 text-sm text-ink/65">
                  Příjemce: finance.brno@iaeste.cz
                </p>
                <p className="mt-1 text-sm text-ink/65">Příloha: {preparedReceipt?.name ?? 'Bez přílohy'}</p>
              </div>
              <button className="icon-button" onClick={() => setEmailDialogOpen(false)} type="button" title="Zavřít">
                <CloseIcon />
              </button>
            </div>

            <div className="grid gap-4">
              <Field label="Předmět" id="emailSubject">
                <input
                  id="emailSubject"
                  className="field text-sm"
                  placeholder={defaultEmailSubject}
                  value={emailSubject}
                  onChange={(event) => setEmailSubject(event.target.value)}
                />
              </Field>

              <Field label="Text e-mailu" id="emailBody">
                <textarea
                  id="emailBody"
                  className="field min-h-48 resize-y text-sm"
                  placeholder={defaultEmailBody}
                  value={emailBody}
                  onChange={(event) => setEmailBody(event.target.value)}
                />
              </Field>
            </div>

            {emailMessage ? (
              <p
                className={`mt-4 rounded-md px-3 py-2 text-sm font-semibold ${
                  emailStatus === 'success' ? 'bg-green-100 text-green-800' : 'bg-coral/10 text-red-700'
                }`}
              >
                {emailMessage}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-md border border-line bg-white px-4 py-2.5 font-bold text-ink transition hover:border-brand hover:text-brand"
                onClick={() => setEmailDialogOpen(false)}
                type="button"
              >
                Zavřít
              </button>
              <button
                className="rounded-md bg-brand px-4 py-2.5 font-bold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!preparedReceipt || receiptProcessing || emailStatus === 'submitting'}
                onClick={() => void sendExpenseEmail()}
                type="button"
              >
                {emailStatus === 'submitting' ? 'Odesílám...' : 'Odeslat'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ReceiptPanel({
  receiptFiles,
  preparedReceipt,
  previewUrl,
  receiptError,
  receiptProcessing,
  onReceiptChange,
  onReceiptReorder,
}: {
  receiptFiles: File[];
  preparedReceipt: File | null;
  previewUrl: string;
  receiptError: string;
  receiptProcessing: boolean;
  onReceiptChange: (files: File[]) => void;
  onReceiptReorder: (fromIndex: number, toIndex: number) => void;
}) {
  const previewType = getReceiptPreviewType(preparedReceipt);
  const accept = getReceiptAcceptAttribute();
  const hasMultipleReceipts = receiptFiles.length > 1;
  const pdfPreviewUrl = previewUrl ? `${previewUrl}#toolbar=0&navpanes=0&scrollbar=1` : '';
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  function handleDragStart(index: number) {
    setDraggedIndex(index);
  }

  function handleDragOver(event: { preventDefault: () => void }) {
    event.preventDefault();
  }

  function handleDrop(targetIndex: number) {
    if (draggedIndex === null) return;
    onReceiptReorder(draggedIndex, targetIndex);
    setDraggedIndex(null);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
  }

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-line bg-white p-3 shadow-panel sm:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-ink">Doklad</h2>
        <p className="mt-1 text-sm text-ink/65">
          Najednou lze registrovat pouze jeden výdaj. Pokud má účtenka více stran, můžete přidat více obrázků.
        </p>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-brand bg-brand px-3 py-3 font-bold text-white transition hover:bg-brand/90 sm:px-4">
          <CameraIcon />
          Vyfotit
          <input
            className="sr-only"
            type="file"
            accept={accept}
            capture="environment"
            multiple
            onChange={(event) => onReceiptChange(Array.from(event.target.files ?? []))}
          />
        </label>

        <label className="flex min-w-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-white px-3 py-3 font-bold text-ink transition hover:border-brand hover:text-brand sm:px-4">
          <UploadIcon />
          Nahrát soubor
          <input
            className="sr-only"
            type="file"
            accept={accept}
            multiple
            onChange={(event) => onReceiptChange(Array.from(event.target.files ?? []))}
          />
        </label>
      </div>

      <div className="mt-5 flex aspect-[7/5] min-h-56 items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-mist sm:min-h-80 lg:flex-1 lg:aspect-auto">
        {previewUrl ? (
          previewType === 'pdf' ? (
            <iframe className="h-full w-full bg-white" src={pdfPreviewUrl} title="Náhled PDF dokladu" />
          ) : (
            <img className="h-full w-full object-contain" src={previewUrl} alt="Náhled dokladu" />
          )
        ) : (
          <div className="px-6 text-center text-sm font-semibold text-ink/55">Není vybraný žádný doklad</div>
        )}
      </div>

      {receiptProcessing ? (
        <p className="mt-4 rounded-md bg-mist px-3 py-2 text-sm font-semibold text-ink/70">
          Připravuji PDF verzi dokladu pro uložení do Google Drive.
        </p>
      ) : null}

      {receiptError ? (
        <p className="mt-4 rounded-md bg-coral/10 px-3 py-2 text-sm font-semibold text-red-700">{receiptError}</p>
      ) : null}

      {receiptFiles.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {hasMultipleReceipts ? (
            <p className="text-sm text-ink/65">Přetáhnutím můžete změnit pořadí stránek.</p>
          ) : null}
          <div className="flex items-center justify-between gap-3 rounded-md bg-mist px-3 py-2">
            <span className="text-sm font-semibold text-ink">
              {hasMultipleReceipts ? `${receiptFiles.length} obrázky v jednom PDF` : 'Vybraný doklad'}
            </span>
            <button
              className="shrink-0 rounded-md px-2 py-1 text-sm font-bold text-red-700 hover:bg-coral/10"
              onClick={() => onReceiptChange([])}
              type="button"
            >
              Odebrat
            </button>
          </div>
          {receiptFiles.map((file, index) => {
            const isDragging = draggedIndex === index;

            return (
              <div
                key={`${file.name}-${index}`}
                className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 ${
                  isDragging ? 'bg-brand/10 ring-2 ring-brand/20' : 'bg-mist'
                } ${hasMultipleReceipts ? 'cursor-grab' : ''}`}
                draggable={hasMultipleReceipts}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragStart={() => handleDragStart(index)}
                onDrop={() => handleDrop(index)}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{file.name}</p>
                  {hasMultipleReceipts ? <p className="text-xs text-ink/60">Strana {index + 1}</p> : null}
                </div>
              </div>
            );
          })}
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

function moveReceiptFile(files: File[], fromIndex: number, toIndex: number) {
  const nextFiles = [...files];
  const [movedFile] = nextFiles.splice(fromIndex, 1);
  nextFiles.splice(toIndex, 0, movedFile);
  return nextFiles;
}

function buildDefaultEmailSubject(expenseName: string) {
  return `Účetní doklad - ${expenseName.trim() || 'Název'}`;
}

function buildDefaultEmailBody(expenseName: string, amount: string, paymentMethod: string, userName: string) {
  return [
    'Ahoj,',
    '',
    `v příloze posílám doklad k "${expenseName.trim() || 'Název'}" v sumě ${amount.trim() || 'Částka'} Kč. Výdaj byl zaplacen způsobem: ${paymentMethod || 'Neznámý'}.`,
    '',
    'Děkuji.',
    '',
    userName,
    'Email byl zaslán ze systému Expense Manager.',
  ].join('\n');
}

function createEmptyForm(): ExpenseForm {
  return {
    name: '',
    storeName: '',
    approvedBy: '',
    expenseDate: getTodayDateInputValue(),
    amount: '',
    department: '',
    category: '',
    paymentMethod: 'Invoice',
  };
}

function getTodayDateInputValue() {
  return new Date().toISOString().slice(0, 10);
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

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
      <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default App;

