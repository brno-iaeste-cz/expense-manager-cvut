import { readFileSync } from 'node:fs';

export const requiredBindings = ['FIREBASE_PROJECT_ID', 'APPS_SCRIPT_WEB_APP_URL', 'APPS_SCRIPT_SECRET'];

export function readDevVars(path = '.dev.vars') {
  const content = readFileSync(path, 'utf8');
  const result = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export function assertRequiredBindings(vars) {
  const missing = requiredBindings.filter((key) => !vars[key]);

  if (missing.length > 0) {
    console.error(`Missing required local bindings in .dev.vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}
