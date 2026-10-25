# IAESTE LC CVUT Expense Manager

Mobile-first receipt and company expense capture app.

## Stack

- React + Vite
- Tailwind CSS
- Firebase Authentication with Google Workspace sign-in
- Hono on Cloudflare Workers with Static Assets
- Google Apps Script for Google Sheets and Google Drive writes

The browser app signs users in with Firebase using Google as the identity provider. Access is restricted to `@iaeste.cz` accounts in the browser and enforced again by the Cloudflare Worker after it verifies the Firebase ID token. The browser prepares the receipt PDF; the Worker encodes it as base64 and forwards the expense to an Apps Script webhook authenticated with a shared secret. Apps Script saves the PDF to Drive and records the expense in Sheets.

## How the App Works: Systems and Request Flow

### What Each System Does

| System | Role in this app |
| --- | --- |
| React + TypeScript | Runs the browser interface: sign-in screens, expense form, receipt selection, preview, and submission feedback. TypeScript checks types during development and builds. |
| Vite | Serves the browser app during development with hot reload and builds the production HTML, JavaScript, and CSS. Locally, it also forwards `/api` requests to the Worker. |
| Tailwind CSS | Provides the styling utilities used to make the interface responsive for phones and computers. |
| Firebase Authentication + Google Workspace | Handles Google sign-in and issues an ID token identifying the user. The app permits verified `@iaeste.cz` accounts. Firebase is used for authentication; expenses and receipts are stored in Google Sheets and Drive. |
| Cloudflare Workers with Static Assets | Hosts the built browser files and runs the backend API in production. Wrangler runs the Worker locally for development. |
| Hono | The small web framework inside the Worker that routes API requests, applies authentication, and returns JSON responses. Zod validates submitted fields, and jose verifies Firebase token signatures and claims. |
| Google Apps Script | Receives authenticated submissions from the Worker and uses the deployment owner's Google permissions to save files and write spreadsheet rows. It also supports the separate expense email action. |
| Google Drive + Google Sheets | Drive stores receipt PDFs in monthly folders. Sheets stores the expense details and the corresponding Drive link in a log and a monthly expense tab. |

### From Entering the URL to a Saved PDF

1. **Open the app URL.** The browser requests the page and loads its JavaScript and CSS. In production, Cloudflare Workers Static Assets serves these files. During development, Vite serves them at port `5173`.
2. **Sign in.** React initializes Firebase Authentication and restores an existing session or shows Google sign-in. After sign-in, Firebase provides an ID token. The interface checks the account's email domain and verification status before showing the expense form.
3. **Fill in the expense and select receipts.** The browser converts selected images into one PDF, with one image per page in the selected order. It uses the browser's canvas to prepare JPEG image data and builds the PDF locally. A single existing PDF is uploaded unchanged. The prepared file stays in browser memory for preview and submission.
4. **Submit to the API.** The browser sends the expense fields and PDF as multipart form data to `POST /api/expenses`, with the Firebase ID token in the `Authorization: Bearer ...` header. Locally, Vite proxies this request to the Wrangler Worker at `127.0.0.1:8788`; in production, the same site's Worker handles it directly.
5. **Verify and forward.** Hono's authentication middleware verifies the token using Google's public keys, checks its expiry, issuer, and Firebase project, and requires a verified `@iaeste.cz` email. The route validates expense fields with Zod, encodes the PDF bytes as base64, and sends JSON containing the expense, verified user details, receipt, and server-side shared secret to Apps Script.
6. **Save in Google Drive and Sheets.** Apps Script checks the shared secret and uses a lock to coordinate submissions. It selects or creates the expense month's Sheet tab and Drive folder, decodes the receipt bytes, and creates the PDF file in Drive. For example, an expense dated `2026-09-29` uses folder `2026_09_Září` and tab `Září 26`. It then writes the expense and Drive link to the log and monthly expense tab.
7. **Show the result.** Apps Script returns the receipt's Drive file ID and URL to the Worker, which returns a success response to the browser. The interface shows a confirmation after the save completes, or an error if the request fails.

The saved PDF lives in **Google Drive**. Submission does not automatically download a copy to the phone or PC disk; a local copy can be downloaded from Drive. Expenses submitted as **Bez dokladu** can be saved without a receipt file.

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` for Vite / frontend:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
EXPENSES_SPREADSHEET_ID=...
EXPENSES_RECEIPTS_FOLDER_ID=...
```

Create `.dev.vars` for Wrangler / backend:

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

Build and run the production frontend and Worker together locally:

```bash
npm run build
npm run preview
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
   - your Cloudflare Worker domain (`workers.dev` or a custom domain)
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
   - `EXPENSES_SPREADSHEET_ID`
   - `EXPENSES_RECEIPTS_FOLDER_ID`
   - `secret`
5. Click **Deploy** -> **New deployment**.
6. Select type **Web app**.
7. Set **Execute as** to **Me**.
8. Set **Who has access** to **Anyone**.
9. Deploy and authorize the script.
10. Copy the Web app URL into `APPS_SCRIPT_WEB_APP_URL`.
11. Use the same script `secret` value for `APPS_SCRIPT_SECRET`.

If you manage the existing Apps Script project with `clasp`, use [clasp-deploy.sh](clasp-deploy.sh) from the repository root. It requires Node.js and `clasp` on your PATH; on Windows, run it in Git Bash:

```bash
bash clasp-deploy.sh "version name" devel
APPS_SCRIPT_PROD_DEPLOYMENT_ID="your-production-deployment-id" bash clasp-deploy.sh "version name" prod
```

The script uses [apps-script/.clasp.json](apps-script/.clasp.json), reuses your existing clasp login (or starts login if needed), temporarily selects `DEV_CONFIG` or `PROD_CONFIG`, pushes the source, creates a version named `[devel] version name` or `[prod] version name`, and updates the selected deployment. The local source is restored when the script exits, including on failure.

Development defaults to deployment `AKfycbw657CPSuhVofzoXoUZBeQ3pk7TG_1YyAil1atPyWQIJZchHExUzIk4yFYevQp0T7yj`; override it with `APPS_SCRIPT_DEV_DEPLOYMENT_ID` if needed. The production deployment ID is not recorded in this repository, so `prod` requires `APPS_SCRIPT_PROD_DEPLOYMENT_ID` and stops before login or push if it is missing. Use an existing Web app deployment ID, not the script ID or the full URL.

Useful inspection commands (run from the `apps-script` directory):

```bash
clasp deployments
clasp versions
```

The web app URL is public, so the secret must be long and unguessable. A good value is at least 32 random characters.

`EXPENSES_SPREADSHEET_ID` points to the expense workbook. Each submission selects a Czech month/year tab using its expense date: `2026-09-29` goes to `Září 26`, and `2027-01-01` goes to `Leden 27`. A missing month tab is copied from the latest dated Czech month/year tab (regardless of tab position). Only the copy is cleared below row 1, including values, formulas, and cell notes; headers, formatting, column widths, and validation rules are retained. TEST and other non-month tabs are ignored. If no monthly tab exists yet, the first one is created with standard headers and a bold, frozen header row. Existing monthly tabs are reused; their headers must match the field names below. Invalid calendar dates are rejected.

Header whitespace is trimmed; legacy aliases are not accepted. The writer stores budget and subgroup in separate columns, preserves VAT, notes, and account columns, and ignores prefilled closure checkboxes when finding a free row. Missing or duplicate headers in an existing tab stop submission before any receipt upload or log write. A script lock protects month creation and row selection from concurrent submissions. Existing TEST records are not migrated; this routing applies to new submissions. The log workbook continues receiving all submissions in its configured log tab.

Instead of hard-coding `EXPENSES_SPREADSHEET_ID`, you can also set a Script Property named `EXPENSES_SPREADSHEET_ID`.

Receipts are saved inside monthly subfolders of `EXPENSES_RECEIPTS_FOLDER_ID`, based on the expense date. Names use `YYYY_MM_Month` with capitalized Czech month names including diacritics, for example `2025_05_Květen` or `2026_09_Září`. The writer reuses a matching child folder or creates it under the submission lock. Submissions without a receipt do not create folders. Existing receipt files are not moved.

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

Deploy the updated Apps Script to enable monthly routing. Local mapping tests do not submit live expenses.

## Cloudflare Workers

The application is deployed as one Worker named `em-iacvut`, configured in [wrangler.jsonc](wrangler.jsonc). Wrangler bundles the API from [worker/index.ts](worker/index.ts) and uploads the Vite frontend from `dist` as Static Assets. API routes (`/api` and `/api/*`) always reach the Worker; frontend navigation uses the SPA fallback to `index.html`.

### Deploy from Git

1. Open **Workers & Pages** in the Cloudflare dashboard and select **Create application**.
2. Use the **Workers** flow and import this Git repository.
3. Set the Worker name to `em-iacvut` and use the repository root as the root directory.
4. Configure these commands:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Preview command (if preview builds are enabled) | `npx wrangler versions upload` |

The preview command uploads a Worker version without promoting it to production. Version preview URLs are enabled by `preview_urls: true` in `wrangler.jsonc`. These versions use the configured backend bindings; use a separate Worker or Wrangler environment if branch builds should write to a separate Apps Script deployment. The asset directory is already configured as `dist` in `wrangler.jsonc`; there is no separate build output directory field to fill in. The build produces frontend files only. Wrangler compiles the backend during deployment, outside the public assets directory.

### Frontend build variables

Under **Settings > Build > Variables and secrets**, set the variables used by Vite:

```dotenv
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
EXPENSES_SPREADSHEET_ID=...
EXPENSES_RECEIPTS_FOLDER_ID=...
```

These values are included in the browser bundle. Set them before the first build; changes require a new build and deployment. Locally they come from `.env.local`.

### Backend runtime variables

Under **Settings > Variables and Secrets**, configure:

| Name | Type | Value |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Variable | Same project ID as `VITE_FIREBASE_PROJECT_ID` |
| `APPS_SCRIPT_WEB_APP_URL` | Variable | Apps Script Web app URL ending in `/exec` |
| `APPS_SCRIPT_SECRET` | Secret | The secret from the selected Apps Script configuration |

Build variables and runtime variables are separate settings. The backend values must be configured at runtime so the API can access them. `keep_vars: true` in `wrangler.jsonc` preserves dashboard-managed variables across Wrangler deployments. Local development and preview read backend values from `.dev.vars`; this file is not uploaded as production configuration.

After deployment, add the Worker hostname (for example, `em-iacvut.<your-subdomain>.workers.dev`) or your custom hostname to **Firebase Authentication > Settings > Authorized domains**. Configure frontend build values and backend runtime values for any preview environments you use as well.

### Local verification and manual deployment

Run the built frontend and API together locally:

```bash
npm run build
npm run preview
```

Open `http://localhost:8788`. For live frontend editing, continue using `npm run dev` at `http://localhost:5173`; its API process uses the `public` directory for assets, so it does not require an existing `dist` build.

To check packaging without publishing:

```bash
npx wrangler deploy --dry-run
```

For a manual deployment after configuring Cloudflare runtime variables and local frontend values:

```bash
npx wrangler login
npm run deploy
```

If replacing an existing Pages deployment, verify the new `workers.dev` site before moving its custom domain to the Worker. Existing Pages settings and variables are not transferred automatically.

References: [Workers build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [Static Assets routing](https://developers.cloudflare.com/workers/static-assets/binding/), and [Pages to Workers migration](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/).
