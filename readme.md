# IAESTE LC Brno Expense Manager

Mobile-first receipt and company expense capture app.

## Stack

- React + Vite
- Tailwind CSS
- Firebase Authentication with Google Workspace sign-in
- Hono on a Cloudflare Pages advanced Worker
- Google Apps Script for Google Sheets and Google Drive writes

The browser app signs users in with Firebase using Google as the identity provider. Access is restricted to `@iaeste.cz` accounts in the browser and enforced again by the Cloudflare Pages Worker after it verifies the Firebase ID token. The Worker converts the uploaded receipt image to base64 and forwards the expense to a private Apps Script webhook. Apps Script saves the image to Drive and appends the row to the Sheet.

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` for the browser app:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

Create `.dev.vars` for local Cloudflare Pages Worker bindings:

```bash
FIREBASE_PROJECT_ID=...
APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/.../exec
APPS_SCRIPT_SECRET=use-a-long-random-secret
```

Run the live development servers:

```bash
npm run dev
```

This starts:

- Vite at `http://localhost:5173`
- Wrangler Worker API at `http://127.0.0.1:8788`

Vite proxies `/api` requests to Wrangler, so the app can be used from `http://localhost:5173` with hot reload.

Build and run the production-style Cloudflare Pages output locally:

```bash
npm run build
npm run pages:dev
```

Open:

```text
http://127.0.0.1:8788
```

## Firebase Authentication Setup

1. In Firebase Console, open **Authentication** -> **Sign-in method**.
2. Enable **Google** as a provider.
3. Set the support email and save the provider.
4. Disable **Email/Password** after the Google sign-in flow has been tested.
5. Open **Authentication** -> **Settings** -> **Authorized domains**.
6. Add the domains you use to serve the app:
   - `localhost` for local Vite development
   - your Cloudflare Pages domain
   - any custom production domain
7. In Google Cloud Console for the same Firebase project, open **APIs & Services** -> **OAuth consent screen** and make sure the app is configured for the IAESTE Google Workspace organization.

The app asks Google for the hosted domain `iaeste.cz`, but that is only a sign-in hint. The actual security check is the Worker-side token check that rejects any expense API request unless the verified Firebase email ends with `@iaeste.cz`.

If an existing user was created with email/password using the same `@iaeste.cz` email, Google sign-in can fail with `auth/account-exists-with-different-credential`. Delete that old Firebase Auth user or link the Google provider to it before disabling email/password.

## Apps Script Setup

Apps Script editor:

```text
https://script.google.com/d/1TjpmW9PgHD1pEY05JNfhucnzw66Xsj0YYiShKNZW105PvqM8VYk6SByZ/edit?usp=sharing
```

The script can be edited by anyone who has access through the `it.brno@iaeste.cz` group.

1. Open the existing Google Sheet.
2. Go to **Extensions** -> **Apps Script**.
3. Replace the script contents with [apps-script/apps-script/Kód.js](apps-script/apps-script/Kód.js).
4. In the script, set:
   - `sheetId`
   - `sheetName`
   - `expensesSpreadsheetId`
   - `driveFolderId`
   - `secret`
5. Click **Deploy** -> **New deployment**.
6. Select type **Web app**.
7. Set **Execute as** to **Me**.
8. Set **Who has access** to **Anyone**.
9. Deploy and authorize the script.
10. Copy the Web app URL into `APPS_SCRIPT_WEB_APP_URL`.
11. Use the same script `secret` value for `APPS_SCRIPT_SECRET`.

If you manage the existing Apps Script project with `clasp`, use the repo config in [apps-script/.clasp.json](apps-script/.clasp.json) and deploy updates from the `apps-script` directory:

```bash
cd apps-script
clasp login
clasp push
clasp create-version "versionName"
clasp create-deployment -V <version> -d "Development deployment" -i AKfycbw657CPSuhVofzoXoUZBeQ3pk7TG_1YyAil1atPyWQIJZchHExUzIk4yFYevQp0T7yj
clasp create-deployment -V <version> -d "Production deployment" -i 
```

Useful inspection commands:

```bash
clasp deployments
clasp versions
```

The web app URL is public, so the secret must be long and unguessable. A good value is at least 32 random characters.

`expensesSpreadsheetId` points to the expense workbook. `expensesSheetName` selects the expense tab (currently `TEST`). The writer requires the exact TEST headers listed below and stores budget and subgroup in separate columns. Header whitespace is trimmed; legacy aliases are not accepted. It preserves VAT, notes, and account columns and ignores prefilled closure checkboxes when finding a free row. All required columns, including the expense date, must already exist. Missing or duplicate headers stop submission before any receipt upload or log write. The writer never creates columns.

Instead of hard-coding `expensesSpreadsheetId`, you can also set a Script Property named `EXPENSES_SPREADSHEET_ID`.

## Google Sheet

The expense tab uses these exact field names (columns may appear in any order):

```text
Jméno, Datum uskutečnění výdaje, Název výdaje, Název obchodu,
Kdo to schválil, Částka, Způsob platby, Rozpočet, Podskupina
```

`Jméno` comes from the signed-in Google account. `URL` and `Uzavřeno` are also required for receipt links and closure status. Other columns are preserved. Rename `Datum` to `Datum uskutečnění výdaje` before using the updated writer.

Internal API keys remain stable: `expenseDate`, `name`, `storeName`, `approvedBy`, `amount`, `paymentMethod`, `department` (Rozpočet), and `category` (Podskupina). Apps Script maps each key to exactly one header.

The log tab configured by `sheetId` and `sheetName` uses these columns:

```text
Čas odeslání, Datum uskutečnění výdaje, Název výdaje, Název obchodu,
Kdo to schválil, Částka, Rozpočet, Podskupina, Způsob platby,
URL dokladu, Jméno, E-mail, ID uživatele
```

The log writer matches these headers by name, so columns can be reordered. Leading and trailing spaces are ignored. Missing or duplicate required headers stop submission before uploading a receipt or writing data. There is no reserved column.

## Category Sync

Run this command to regenerate `src/categories.ts`:

```bash
npm run categories:sync -- 1lIR4iRRP4cPpq8TcnPbe-b7Zd91-pdXb4mHJdIyNu1s
```

The general command remains `npm run categories:sync -- <spreadsheetId>`.

The `rozpocty` tab must have budget names in the first row, with their subgroups underneath in the same column. Blank cells and the `DPH` column are ignored. Category names are trimmed, deduplicated within each department, and kept in sheet order. Empty or invalid results do not replace the current category file.

Public sheets are read directly through Google CSV export. Private sheets use `APPS_SCRIPT_WEB_APP_URL` and `APPS_SCRIPT_SECRET` from the environment or `.dev.vars`; deploy the updated Apps Script first and give its owner access to the workbook.

The form uses two levels, budget and subgroup, with search across both. Generated `value` fields retain sheet names for submission; `label` fields control displayed text. Manual edits to the generated file are replaced by the next sync.

`npm run build` uses the current category file and does not sync automatically. Run sync before building when the source categories change.

Deploy the updated Apps Script and web app together to enable the new form and TEST writer. Local build and mapping tests do not submit live expenses.

## Cloudflare Pages

Set these variables in Cloudflare Pages project settings:

```bash
FIREBASE_PROJECT_ID
APPS_SCRIPT_WEB_APP_URL
APPS_SCRIPT_SECRET
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
```

Build command:

```bash
npm run build
```

Build output directory:

```bash
dist
```

Deploy command:

```text
Leave empty
```

Do not use `npx wrangler deploy` as the Pages deploy command. That command deploys a
Workers project and will try to auto-configure this Hono app as a Worker. Cloudflare
Pages should upload the `dist` directory after the build; the build already writes the
advanced Pages Worker to `dist/_worker.js`.

For a manual local deploy outside the Cloudflare Pages Git integration, use:

```bash
npm run deploy:pages
```

Also add your Cloudflare Pages domain to Firebase Authentication authorized domains before testing the deployed site.
