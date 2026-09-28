import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { parseCsv, extractCategories, validateCategoryTree } from './category-data.mjs';

const scriptPath = `apps-script/apps-script/${readdirSync('apps-script/apps-script').find((name) => name.endsWith('.js'))}`;
const context = vm.createContext({});
vm.runInContext(readFileSync(scriptPath, 'utf8'), context);

test('log writer follows reordered headers, trims whitespace, and has no reserved column', () => {
  const headers = ['Čas odeslání', 'Datum uskutečnění výdaje', 'Název výdaje', 'Název obchodu', 'Kdo to schválil', 'Částka        ', 'Rozpočet        ', 'Podskupina        ', 'Způsob platby', 'URL dokladu  ', 'Jméno        ', 'E-mail', ' ID uživatele'];
  const payload = {
    submittedAt: '2026-09-28T21:33:38.496Z',
    expense: { expenseDate: '2026-09-28', name: 'Food', storeName: 'Shop', approvedBy: 'Approver', amount: 120, department: 'HR', category: 'Porady', paymentMethod: 'Hotovost' },
    user: { name: 'User', email: 'user@example.com', uid: 'user-id' },
  };
  const sheet = { getLastColumn: () => headers.length, getRange: () => ({ getDisplayValues: () => [headers] }) };
  const row = context.buildExpenseLogRow(sheet, payload);
  assert.deepEqual(Array.from(row.values), [payload.submittedAt, '2026-09-28', 'Food', 'Shop', 'Approver', 120, 'HR', 'Porady', 'Hotovost', '', 'User', 'user@example.com', 'user-id']);
  assert.equal(row.receiptIndex, 9);
  headers.reverse();
  const reordered = context.buildExpenseLogRow(sheet, payload);
  assert.deepEqual(Array.from(reordered.values), Array.from(row.values).reverse());
  assert.equal(reordered.receiptIndex, 3);
  headers.push('Částka');
  assert.throws(() => context.buildExpenseLogRow(sheet, payload), /Duplicate log column/);
  headers.pop();
  headers.pop();
  assert.throws(() => context.buildExpenseLogRow(sheet, payload), /Missing log column/);
});

test('CSV preserves commas, quotes, newlines, and trailing blanks', () => {
  assert.deepEqual(parseCsv('"HR","Office",\r\n"Porady, Schuzky","A ""quote""",\r\n"two\nlines",,'), [
    ['HR', 'Office', ''], ['Porady, Schuzky', 'A "quote"', ''], ['two\nlines', '', ''],
  ]);
  assert.throws(() => parseCsv('"unfinished'));
});

test('both category parsers read columns, skip VAT and blanks, and deduplicate', () => {
  const rows = [[' HR ', 'Office', 'DPH', ''], ['Porady ', 'IT', '21%', 'ignored'], ['Porady', '', '12%'], ['Akce', "O'Brien"]];
  const expected = { HR: [{ value: 'Porady', label: 'Porady' }, { value: 'Akce', label: 'Akce' }], Office: [{ value: 'IT', label: 'IT' }, { value: "O'Brien", label: "O'Brien" }] };
  assert.deepEqual(JSON.parse(JSON.stringify(extractCategories(rows))), expected);
  assert.deepEqual(JSON.parse(JSON.stringify(context.extractCategories(rows))), expected);
  assert.throws(() => extractCategories([['DPH'], ['21%']]));
  assert.throws(() => extractCategories([['HR', 'HR'], ['A', 'B']]));
  assert.throws(() => validateCategoryTree({ HR: [{ value: 'A', label: 'A', subcategories: ['B'] }] }));
});

test('monthly writer maps separate department/category columns and skips existing expenses', () => {
  const headers = ['Jméno', 'Název výdaje ', 'Název obchodu', 'Kdo to schválil', 'Rozpočet', 'Podskupina', 'Částka', 'DPH', 'Způsob platby', 'URL', 'Poznámka', 'Uzavřeno', 'Protiúčet', 'Datum uskutečnění výdaje\u00a0'];
  const existing = ['User', 'Old expense', '', '', '', '', '', '', '', '', '', 'FALSE', ''];
  const blank = headers.map((_, i) => i === 11 ? 'FALSE' : '');
  const writes = new Map();
  const sheet = {
    getLastColumn: () => headers.length,
    getLastRow: () => 3,
    getMaxRows: () => 100,
    getMaxColumns: () => 26,
    getRange: (row, column) => ({
      getDisplayValues: () => row === 1 ? [headers] : [existing, blank],
      setValue: (value) => writes.set(`${row}:${column}`, value),
    }),
  };
  context.SpreadsheetApp = { openById: () => ({ getSheetByName: (name) => { assert.equal(name, 'Září 26'); return sheet; } }) };
  const expense = { name: 'Food', storeName: 'Shop', approvedBy: 'Approver', department: 'HR', category: 'Porady', amount: 120, expenseDate: '2026-09-28', paymentMethod: 'Hotovost' };
  const target = context.findBudgetWriteTarget(expense);
  assert.equal(target.row, 3);
  context.writeExpenseToBudgetSpreadsheet(target, expense, { name: 'User' }, 'receipt-url');
  assert.equal(writes.get('3:5'), 'HR');
  assert.equal(writes.get('3:6'), 'Porady');
  assert.equal(writes.get('3:3'), 'Shop');
  assert.equal(writes.get('3:4'), 'Approver');
  assert.equal(writes.get('3:10'), 'receipt-url');
  assert.equal(writes.get('3:12'), false);
  assert.equal(writes.get('3:14'), '2026-09-28');
  assert.equal([...writes.keys()].some((key) => key.startsWith('1:')), false);
  for (const column of [8, 11, 13]) assert.equal(writes.has(`3:${column}`), false);
  assert.equal([...writes.keys()].some((key) => key.startsWith('2:')), false);
  headers[13] = 'Datum';
  assert.throws(() => context.findBudgetWriteTarget(expense), /Missing expense column: Datum uskutečnění výdaje/);
  headers[13] = 'Datum uskutečnění výdaje';
  headers.push('Rozpočet');
  assert.throws(() => context.findBudgetWriteTarget(expense), /Duplicate expense column: Rozpočet/);
  headers.pop();
  headers[4] = 'Unexpected';
  assert.throws(() => context.findBudgetWriteTarget(expense), /Missing expense column/);
});

test('expense month uses the expense date across year boundaries and validates real dates', () => {
  for (const [date, name] of [['2026-09-01', 'Září 26'], ['2026-12-31', 'Prosinec 26'], ['2027-01-01', 'Leden 27'], ['2024-02-29', 'Únor 24']]) {
    assert.equal(context.getExpenseMonthSheetName(date), name);
  }
  for (const date of ['', '2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-09-00', '2026-9-1', '2026-09-01T00:00:00Z']) {
    assert.throws(() => context.getExpenseMonthSheetName(date), /Invalid expense date/);
  }
});

test('receipt folders use expense year/month, are scoped to the parent, and are reused', () => {
  const folders = new Map();
  const created = [];
  const parent = {
    getFoldersByName: (name) => ({ hasNext: () => folders.has(name), next: () => folders.get(name) }),
    createFolder: (name) => {
      const folder = { name };
      folders.set(name, folder);
      created.push(name);
      return folder;
    },
  };
  const may = context.getMonthlyReceiptFolder(parent, '2025-05-10');
  assert.equal(may.name, '2025_05_Květen');
  assert.equal(context.getMonthlyReceiptFolder(parent, '2025-05-31'), may);
  const names = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
  names.forEach((name, index) => {
    const month = String(index + 1).padStart(2, '0');
    assert.equal(context.getMonthlyReceiptFolder(parent, `2026-${month}-01`).name, `2026_${month}_${name}`);
  });
  assert.equal(created.length, 13);
  const untouchedParent = { getFoldersByName: () => assert.fail('Invalid dates must not access Drive') };
  assert.throws(() => context.getMonthlyReceiptFolder(untouchedParent, '2025-02-29'), /Invalid expense date/);
});

test('missing month is created with headers once and reused without modifying existing rows', () => {
  const sheets = new Map();
  let creations = 0;
  let headerWrites = 0;
  const spreadsheet = {
    getSheets: () => [],
    getSheetByName: (name) => sheets.get(name),
    insertSheet: (name) => {
      creations += 1;
      const sheet = {
        getRange: (row, column, rows, columns) => {
          assert.deepEqual([row, column, rows, columns], [1, 1, 1, 14]);
          return { setValues: ([headers]) => {
            headerWrites += 1;
            assert.equal(headers[1], 'Datum uskutečnění výdaje');
            assert.equal(headers[5], 'Rozpočet');
            assert.equal(headers[6], 'Podskupina');
            return { setFontWeight: (weight) => assert.equal(weight, 'bold') };
          } };
        },
        setFrozenRows: (count) => assert.equal(count, 1),
      };
      sheets.set(name, sheet);
      return sheet;
    },
  };
  const september = context.getMonthlyExpenseSheet(spreadsheet, '2026-09-29');
  assert.equal(context.getMonthlyExpenseSheet(spreadsheet, '2026-09-01'), september);
  context.getMonthlyExpenseSheet(spreadsheet, '2026-10-01');
  assert.equal(creations, 2);
  assert.equal(headerWrites, 2);
  assert.deepEqual([...sheets.keys()], ['Září 26', 'Říjen 26']);
  assert.throws(() => context.getMonthlyExpenseSheet(spreadsheet, '2026-02-30'));
  assert.equal(creations, 2);
});

test('latest monthly template is selected by date and only the copied entries are cleared', () => {
  const calls = [];
  const copy = {
    getMaxRows: () => 100,
    getMaxColumns: () => 14,
    getRange: (...args) => {
      assert.deepEqual(args, [2, 1, 99, 14]);
      return {
        clearContent: () => calls.push('clear entries'),
        clearNote: () => calls.push('clear notes'),
      };
    },
    setName: (name) => calls.push(name),
  };
  const sheets = ['TEST', 'Prosinec 25', 'Leden 26', 'rozpocty', 'Listopad 25'].map((name) => ({
    getName: () => name,
    copyTo: (destination) => {
      assert.equal(destination, spreadsheet);
      calls.push(`copy ${name}`);
      return copy;
    },
  }));
  const spreadsheet = { getSheets: () => sheets, getSheetByName: () => null };
  assert.equal(context.getMonthlyExpenseSheet(spreadsheet, '2026-02-01'), copy);
  assert.deepEqual(calls, ['copy Leden 26', 'clear entries', 'clear notes', 'Únor 26']);
  // Backdated submissions also use the latest available monthly layout.
  calls.length = 0;
  context.getMonthlyExpenseSheet(spreadsheet, '2025-10-01');
  assert.equal(calls[0], 'copy Leden 26');
  calls.length = 0;
  spreadsheet.getSheetByName = () => sheets[2];
  assert.equal(context.getMonthlyExpenseSheet(spreadsheet, '2026-01-01'), sheets[2]);
  assert.deepEqual(calls, []);
});
