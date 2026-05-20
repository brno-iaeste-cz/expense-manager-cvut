import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readDevVars } from './dev-vars.mjs';

const DEFAULT_DEPARTMENT_SHEETS = ['PR', 'HR', 'EX', 'Akce', 'Projekty', 'Ces\u0165\u00e1k'];
const devVars = loadDevVars();
const departmentSheets = (process.env.CATEGORIES_DEPARTMENT_SHEETS ?? DEFAULT_DEPARTMENT_SHEETS.join(','))
  .split(',')
  .map((sheet) => sheet.trim())
  .filter(Boolean);
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

  const categoryTree = await fetchCategoryTree();

  await writeFile(resolve('src/categories.ts'), renderCategoriesFile(categoryTree), 'utf8');

  const categoryCount = Object.values(categoryTree).reduce((sum, categories) => sum + categories.length, 0);
  const subcategoryCount = Object.values(categoryTree).reduce(
    (sum, categories) => sum + categories.reduce((innerSum, category) => innerSum + category.subcategories.length, 0),
    0,
  );

  console.log(
    `Synced ${Object.keys(categoryTree).length} departments, ${categoryCount} categories and ${subcategoryCount} subcategories.`,
  );
}

async function fetchCategoryTree() {
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
      departments: departmentSheets,
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
  subcategories: string[];
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
  subcategoryValue: string;
  subcategoryLabel: string;
};

export const categoryTree = ${formatValue(tree)} satisfies Record<string, Category[]>;

export const departments: Department[] = ${formatValue(departments)};

export const categorySearchIndex: CategorySearchResult[] = Object.entries(categoryTree).flatMap(
  ([department, categories]) => {
    const departmentLabel = departments.find((item) => item.value === department)?.label ?? department;

    return categories.flatMap((category) =>
      category.subcategories.map((subcategory) => ({
        departmentValue: department,
        departmentLabel,
        categoryValue: category.value,
        categoryLabel: category.label,
        subcategoryValue: subcategory,
        subcategoryLabel: subcategory,
      })),
    );
  },
);
`;
}

function formatValue(value) {
  return JSON.stringify(value, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/"/g, "'");
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
