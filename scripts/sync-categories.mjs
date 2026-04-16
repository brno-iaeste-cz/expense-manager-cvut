import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const DEFAULT_SPREADSHEET_ID = '1dMACC3Gyeor0Xv-mh0sN1y7sDOepLLiNeljMUqwdjWE';
const DEFAULT_DEPARTMENT_SHEETS = ['PR', 'HR', 'EX', 'Akce', 'Projekty', 'Cesťák'];
const spreadsheetId = process.env.EXPENSES_SPREADSHEET_ID ?? DEFAULT_SPREADSHEET_ID;
const departmentSheets = (process.env.CATEGORIES_DEPARTMENT_SHEETS ?? DEFAULT_DEPARTMENT_SHEETS.join(','))
  .split(',')
  .map((sheet) => sheet.trim())
  .filter(Boolean);
const optional = process.argv.includes('--optional');

try {
  await main();
} catch (error) {
  if (!optional) {
    throw error;
  }

  console.warn(`Skipping category sync: ${error instanceof Error ? error.message : String(error)}`);
}

async function main() {
  const categoryTree = {};
  const workbook = await fetchWorkbook(spreadsheetId);

  for (const sheet of departmentSheets) {
    const rows = workbook.sheets.get(sheet);
    if (!rows) {
      continue;
    }

    const categories = extractCategories(rows);

    if (categories.length > 0) {
      categoryTree[sheet] = categories;
    }
  }

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

async function fetchWorkbook(id) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${id}/export`);
  url.searchParams.set('format', 'xlsx');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch spreadsheet: ${response.status} ${response.statusText}`);
  }

  const entries = readZipEntries(Buffer.from(await response.arrayBuffer()));
  const sharedStrings = parseSharedStrings(entries.get('xl/sharedStrings.xml') ?? '');
  const sheetNames = parseSheetNames(entries.get('xl/workbook.xml') ?? '');
  const sheets = new Map();

  sheetNames.forEach((sheet, index) => {
    const xml = entries.get(`xl/worksheets/sheet${index + 1}.xml`);
    if (xml) {
      sheets.set(sheet, parseWorksheet(xml, sharedStrings));
    }
  });

  return { sheets };
}

function extractCategories(rows) {
  const headerRow = rows[0] ?? [];
  const typeRow = rows[1] ?? [];
  const categories = [];

  for (let column = 0; column < typeRow.length; column += 1) {
    if (typeRow[column] !== 'Výdaje' || !headerRow[column]) {
      continue;
    }

    const category = headerRow[column];
    const subcategories = [];

    for (let row = 3; row < rows.length; row += 1) {
      const value = rows[row]?.[column]?.trim() ?? '';

      if (value === 'Cena') {
        break;
      }

      if (value && value !== 'Odvětví') {
        subcategories.push(value);
      }
    }

    categories.push({
      value: category,
      label: category,
      subcategories: unique(subcategories),
    });
  }

  return categories;
}

function readZipEntries(buffer) {
  const entries = new Map();
  const endOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid XLSX central directory.');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);

    if (compressionMethod === 0) {
      entries.set(fileName, compressedData.toString('utf8'));
    } else if (compressionMethod === 8) {
      entries.set(fileName, inflateRawSync(compressedData).toString('utf8'));
    }

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error('Invalid XLSX file.');
}

function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((textMatch) => decodeXml(textMatch[1])).join(''),
  );
}

function parseSheetNames(xml) {
  return [...xml.matchAll(/<sheet\b[^>]*\bname="([^"]+)"/g)].map((match) => decodeXml(match[1]));
}

function parseWorksheet(xml, sharedStrings) {
  const rows = [];

  for (const rowMatch of xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIndex = Number(rowMatch[1]) - 1;
    rows[rowIndex] ??= [];

    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1] ?? cellMatch[2];
      const body = cellMatch[3] ?? '';
      const cellReference = attributes.match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!cellReference) {
        continue;
      }

      const columnIndex = columnNameToIndex(cellReference.match(/^[A-Z]+/)?.[0] ?? 'A');
      const type = attributes.match(/\bt="([^"]+)"/)?.[1];
      const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      let value = '';

      if (type === 's' && valueMatch) {
        value = sharedStrings[Number(valueMatch[1])] ?? '';
      } else if (type === 'inlineStr') {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join('');
      } else if (valueMatch) {
        value = decodeXml(valueMatch[1]);
      }

      rows[rowIndex][columnIndex] = value;
    }
  }

  return rows;
}

function columnNameToIndex(columnName) {
  let index = 0;

  for (const character of columnName) {
    index = index * 26 + character.charCodeAt(0) - 64;
  }

  return index - 1;
}

function decodeXml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function unique(values) {
  return [...new Set(values)];
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
  department: string;
  departmentLabel: string;
  category: string;
  categoryLabel: string;
  subcategory: string;
};

export const categoryTree = ${formatValue(tree)} satisfies Record<string, Category[]>;

export const departments: Department[] = ${formatValue(departments)};

export const categorySearchIndex: CategorySearchResult[] = Object.entries(categoryTree).flatMap(
  ([department, categories]) => {
    const departmentLabel = departments.find((item) => item.value === department)?.label ?? department;

    return categories.flatMap((category) =>
      category.subcategories.map((subcategory) => ({
        department,
        departmentLabel,
        category: category.value,
        categoryLabel: category.label,
        subcategory,
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
