import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readDevVars } from './dev-vars.mjs';
import { parseCsv, extractCategories, validateCategoryTree } from './category-data.mjs';

const devVars = loadDevVars();
const optional = process.argv.includes('--optional');
const spreadsheetId = readSpreadsheetIdArg(process.argv.slice(2));

try {
  await main();
} catch (error) {
  if (!optional) {
    throw error;
  }

  console.warn(`Skipping category sync: ${error instanceof Error ? error.message : String(error)}`);
}

async function main() {
  if (!spreadsheetId) {
    throw new Error('Missing spreadsheet ID. Use: npm run categories:sync -- <spreadsheetId>');
  }

  const categoryTree = validateCategoryTree(await fetchCategoryTree());

  await writeFile(resolve('src/categories.ts'), renderCategoriesFile(categoryTree), 'utf8');

  const categoryCount = Object.values(categoryTree).reduce((sum, categories) => sum + categories.length, 0);
  console.log(`Synced ${Object.keys(categoryTree).length} departments and ${categoryCount} categories.`);
}

async function fetchCategoryTree() {
  // Public sheets can be synced without deploying Apps Script first.
  const url = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/gviz/tq`);
  url.searchParams.set('tqx', 'out:csv');
  url.searchParams.set('sheet', 'rozpocty');
  try {
    const response = await fetch(url);
    if (response.ok && response.headers.get('content-type')?.includes('text/csv')) {
      return extractCategories(parseCsv(await response.text()));
    }
  } catch {
    // Private sheets use the authenticated Apps Script endpoint below.
  }
  const appScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL ?? devVars.APPS_SCRIPT_WEB_APP_URL;
  const appScriptSecret = process.env.APPS_SCRIPT_SECRET ?? devVars.APPS_SCRIPT_SECRET;

  if (!appScriptUrl || !appScriptSecret) {
    throw new Error('Missing Apps Script configuration. Set APPS_SCRIPT_WEB_APP_URL and APPS_SCRIPT_SECRET in .dev.vars.');
  }

  const response = await fetch(appScriptUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      action: 'getCategories',
      secret: appScriptSecret,
      spreadsheetId,
      sheetName: 'rozpocty',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch categories from Apps Script: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (!payload?.ok || typeof payload.categoryTree !== 'object' || payload.categoryTree === null) {
    throw new Error(payload?.error || 'Apps Script returned an invalid categories payload.');
  }

  return payload.categoryTree;
}

function renderCategoriesFile(tree) {
  const departments = Object.keys(tree).map((department) => ({
    value: department,
    label: department,
  }));

  return `export type Category = {
  value: string;
  label: string;
};

export type Department = {
  value: keyof typeof categoryTree;
  label: string;
};

export type CategorySearchResult = {
  departmentValue: string;
  departmentLabel: string;
  categoryValue: string;
  categoryLabel: string;
};

export const categoryTree = ${formatValue(tree)} satisfies Record<string, Category[]>;

export const departments: Department[] = ${formatValue(departments)};

export const categorySearchIndex: CategorySearchResult[] = Object.entries(categoryTree).flatMap(
  ([department, categories]) => {
    const departmentLabel = departments.find((item) => item.value === department)?.label ?? department;

    return categories.map((category) => ({
      departmentValue: department,
      departmentLabel,
      categoryValue: category.value,
      categoryLabel: category.label,
    }));
  },
);
`;
}

function formatValue(value) {
  return JSON.stringify(value, null, 2);
}

function loadDevVars() {
  try {
    return readDevVars();
  } catch {
    return {};
  }
}

function readSpreadsheetIdArg(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg || arg === '--optional') {
      continue;
    }

    if (arg === '--spreadsheet-id' || arg === '--sheet-id') {
      return argv[index + 1] || '';
    }

    if (arg.startsWith('--spreadsheet-id=')) {
      return arg.slice('--spreadsheet-id='.length);
    }

    if (arg.startsWith('--sheet-id=')) {
      return arg.slice('--sheet-id='.length);
    }

    if (!arg.startsWith('--')) {
      return arg;
    }
  }

  return '';
}
