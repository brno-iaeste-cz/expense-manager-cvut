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

test('TEST writer maps separate department/category columns and skips existing expenses', () => {
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
  context.SpreadsheetApp = { openById: () => ({ getSheetByName: (name) => { assert.equal(name, 'TEST'); return sheet; } }) };
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
