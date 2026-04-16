# IAESTE LC Brno Expense Manager

Mobile-first receipt and company expense capture app.

## Stack

- React + Vite
- Tailwind CSS
- Firebase Authentication with email/password
- Hono on a Cloudflare Pages advanced Worker
- Google Apps Script for Google Sheets and Google Drive writes

The browser app signs users in with Firebase. The Cloudflare Pages Worker verifies the Firebase ID token, converts the uploaded receipt image to base64, and forwards the expense to a private Apps Script webhook. Apps Script saves the image to Drive and appends the row to the Sheet.

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

## Apps Script Setup

1. Open the existing Google Sheet.
2. Go to **Extensions** -> **Apps Script**.
3. Replace the script contents with [apps-script/Code.gs](apps-script/Code.gs).
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

The web app URL is public, so the secret must be long and unguessable. A good value is at least 32 random characters.

`expensesSpreadsheetId` is the budget spreadsheet used for category tabs such as `PR`, `HR`, `EX`, `Akce`, and `Projekty`. When an expense is submitted, Apps Script appends the row to the `Expenses` tab and also writes the amount into the matching budget sheet block:

- `department` selects the spreadsheet tab.
- `category` selects the block whose first row contains the category name and whose second row contains `Výdaje`.
- `subcategory` is written into the `Odvětví` column.

Instead of hard-coding `expensesSpreadsheetId`, you can also set a Script Property named `EXPENSES_SPREADSHEET_ID`.

## Google Sheet

Add a tab named exactly:

```text
Expenses
```

Add this header row:

```text
Submitted At, Name, Amount, Department, Category, Subcategory,
Payment Method, Receipt URL, User Email, User UID
```

The Apps Script appends data in that order.

## Category Sync

Expense departments, categories, and subcategories are generated into `src/categories.ts` from the budgeting Google Sheet.

Run a manual sync:

```bash
npm run categories:sync
```

The default source spreadsheet is:

```text
https://docs.google.com/spreadsheets/d/1dMACC3Gyeor0Xv-mh0sN1y7sDOepLLiNeljMUqwdjWE/edit
```

The sync reads these sheet tabs:

```text
PR, HR, EX, Akce, Projekty, Cesťák
```

Only tabs that contain category blocks are written to `src/categories.ts`. A category block is detected by a `Výdaje` cell in the second row. The category name is read from the first row of that same column, and subcategories are read from the same column under `Odvětví` until `Cena`.

`npm run build` runs the sync automatically before building. This prebuild sync is optional: if the spreadsheet cannot be downloaded, the build continues with the last generated `src/categories.ts`.

To use a different spreadsheet or tab list:

```powershell
$env:EXPENSES_SPREADSHEET_ID="..."
$env:CATEGORIES_DEPARTMENT_SHEETS="PR,HR,EX,Akce,Projekty"
npm run categories:sync
```

The spreadsheet must be readable by the machine running the command.

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

Also add your Cloudflare Pages domain to Firebase Authentication authorized domains before testing the deployed site.
