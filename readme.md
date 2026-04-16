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

Run the frontend only:

```bash
npm run dev
```

Build and run with Cloudflare Pages locally:

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

## Google Sheet

Add a tab named exactly:

```text
Expenses
```

Add this header row:

```text
Submitted At, Transaction Date, Merchant, Amount, Currency, Category,
Payment Method, Project/Event, Notes, Receipt URL, User Email, User UID
```

The Apps Script appends data in that order.

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
