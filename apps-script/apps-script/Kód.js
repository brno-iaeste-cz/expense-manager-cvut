const PROD_CONFIG = {
  logSheetId: '1JLyjZACdYu1xU7fI5kItMuYBr6JzWklNew4fa1S0USA',
  logSheetName: 'Expenses',
  EXPENSES_SPREADSHEET_ID: '1PpkXeLnp4ZhtmvfJ5VW5SRenHh5FI1a18QFKbBGz8N4',
  EXPENSES_RECEIPTS_FOLDER_ID: '1yomzfie_yklBFIJeYqqSQJVBP1DdriIm',
  emailRecipient: 'martin.tavoda@iaeste.cz',
  secret: 'GACiQ19dp1g2ZjHANKFZQx1v5PcNJ0HMfUYc152F',
};

const DEV_CONFIG = {
  logSheetId: '1JLyjZACdYu1xU7fI5kItMuYBr6JzWklNew4fa1S0USA',
  logSheetName: 'Expenses',
  EXPENSES_SPREADSHEET_ID: '1PpkXeLnp4ZhtmvfJ5VW5SRenHh5FI1a18QFKbBGz8N4',
  EXPENSES_RECEIPTS_FOLDER_ID: '1yomzfie_yklBFIJeYqqSQJVBP1DdriIm',
  emailRecipient: 'martin.tavoda@iaeste.cz',
  secret: 'GACiQ19dp1g2ZjHANKFZQx1v5PcNJ0HMfUYc152F',
};

const CONFIG = DEV_CONFIG; 

function doPost(e) {
  let expenseLock = null;
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.secret !== CONFIG.secret) {
      return jsonResponse({ ok: false, error: 'Unauthorized.' }, 401);
    }

    if (payload.action === 'getCategories') {
      return getCategories(payload);
    }

    if (payload.action === 'sendExpenseEmail') {
      return sendExpenseEmail(payload);
    }

    const expense = payload.expense;
    const receipt = payload.receipt;
    const user = payload.user || {};

    if (!expense || (expense.paymentMethod !== 'Bez dokladu' && (!receipt || !receipt.base64))) {
      return jsonResponse({ ok: false, error: 'Invalid request.' }, 400);
    }

    const sheet = SpreadsheetApp.openById(CONFIG.logSheetId).getSheetByName(CONFIG.logSheetName);
    if (!sheet) {
      return jsonResponse({ ok: false, error: 'Sheet tab not found.' }, 500);
    }

    const logRow = buildExpenseLogRow(sheet, payload);
    expenseLock = LockService.getScriptLock();
    expenseLock.waitLock(30000);
    const budgetTarget = findBudgetWriteTarget(expense);

    let file = null;
    if (receipt && receipt.base64) {
      const folder = getMonthlyReceiptFolder(DriveApp.getFolderById(CONFIG.EXPENSES_RECEIPTS_FOLDER_ID), expense.expenseDate);
      const filename = buildReceiptFilename(expense, user, receipt.filename);
      const bytes = Utilities.base64Decode(receipt.base64);
      const blob = Utilities.newBlob(bytes, getReceiptMimeType(receipt), filename);
      file = folder.createFile(blob);
    }

    logRow.values[logRow.receiptIndex] = file ? file.getUrl() : '';
    sheet.appendRow(logRow.values);

    writeExpenseToBudgetSpreadsheet(budgetTarget, expense, user, file ? file.getUrl() : '');

    return jsonResponse({
      ok: true,
      receiptFileId: file ? file.getId() : '',
      receiptUrl: file ? file.getUrl() : '',
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) }, 500);
  } finally {
    if (expenseLock && expenseLock.hasLock()) {
      try {
        SpreadsheetApp.flush();
      } finally {
        expenseLock.releaseLock();
      }
    }
  }
}

function buildExpenseLogRow(sheet, payload) {
  const expense = payload.expense;
  const user = payload.user || {};
  const fields = {
    'Čas odeslání': payload.submittedAt || new Date().toISOString(),
    'Datum uskutečnění výdaje': expense.expenseDate || '',
    'Název výdaje': expense.name,
    'Název obchodu': expense.storeName || '',
    'Kdo to schválil': expense.approvedBy || '',
    'Částka': expense.amount,
    'Rozpočet': expense.department,
    'Podskupina': expense.category,
    'Způsob platby': expense.paymentMethod,
    'URL dokladu': '',
    'Jméno': user.name || '',
    'E-mail': user.email || '',
    'ID uživatele': user.uid || '',
  };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map((value) => String(value).trim());
  Object.keys(fields).forEach((header) => {
    const index = headers.indexOf(header);
    if (index < 0) throw new Error('Missing log column: ' + header);
    if (headers.lastIndexOf(header) !== index) throw new Error('Duplicate log column: ' + header);
  });
  return {
    values: headers.map((header) => Object.prototype.hasOwnProperty.call(fields, header) ? fields[header] : ''),
    receiptIndex: headers.indexOf('URL dokladu'),
  };
}

function parseExpenseDate(expenseDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(expenseDate || ''));
  if (!match) throw new Error('Invalid expense date. Expected YYYY-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new Error('Invalid expense date.');
  }
  return { year: match[1], month: match[2] };
}

function getExpenseMonthSheetName(expenseDate) {
  const date = parseExpenseDate(expenseDate);
  const months = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
  return months[Number(date.month) - 1] + ' ' + date.year.slice(-2);
}

function getMonthlyReceiptFolder(parentFolder, expenseDate) {
  const date = parseExpenseDate(expenseDate);
  const months = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
  const name = date.year + '_' + date.month + '_' + months[Number(date.month) - 1];
  // Called under the submission lock so concurrent uploads reuse the same folder.
  const existing = parentFolder.getFoldersByName(name);
  return existing.hasNext() ? existing.next() : parentFolder.createFolder(name);
}

function findLatestMonthlyExpenseSheet(spreadsheet) {
  const months = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
  let latest = null;
  let latestMonth = -1;
  spreadsheet.getSheets().forEach((sheet) => {
    const match = /^(\S+) (\d{2})$/.exec(sheet.getName());
    if (!match) return;
    const month = months.indexOf(match[1]);
    if (month < 0) return;
    const monthIndex = (2000 + Number(match[2])) * 12 + month;
    if (monthIndex > latestMonth) {
      latest = sheet;
      latestMonth = monthIndex;
    }
  });
  return latest;
}

function getMonthlyExpenseSheet(spreadsheet, expenseDate) {
  const name = getExpenseMonthSheetName(expenseDate);
  const existing = spreadsheet.getSheetByName(name);
  if (existing) return existing;
  const template = findLatestMonthlyExpenseSheet(spreadsheet);
  if (template) {
    const sheet = template.copyTo(spreadsheet);
    // Clear only the copy's body; keep headers, formatting and validation rules.
    if (sheet.getMaxRows() > 1) {
      const entries = sheet.getRange(2, 1, sheet.getMaxRows() - 1, sheet.getMaxColumns());
      entries.clearContent();
      entries.clearNote();
    }
    sheet.setName(name);
    return sheet;
  }
  const sheet = spreadsheet.insertSheet(name);
  const headers = ['Jméno', 'Datum uskutečnění výdaje', 'Název výdaje', 'Název obchodu', 'Kdo to schválil', 'Rozpočet', 'Podskupina', 'Částka', 'DPH', 'Způsob platby', 'URL', 'Poznámka', 'Uzavřeno', 'Protiúčet'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function findBudgetWriteTarget(expense) {
  const spreadsheetId = getExpensesSpreadsheetId();
  if (!spreadsheetId) return null;
  const sheet = getMonthlyExpenseSheet(SpreadsheetApp.openById(spreadsheetId), expense.expenseDate);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map((value) => String(value).trim());
  const fieldHeaders = {
    user: 'Jméno',
    expenseDate: 'Datum uskutečnění výdaje',
    name: 'Název výdaje',
    storeName: 'Název obchodu',
    approvedBy: 'Kdo to schválil',
    amount: 'Částka',
    paymentMethod: 'Způsob platby',
    department: 'Rozpočet',
    category: 'Podskupina',
    receiptUrl: 'URL',
    closed: 'Uzavřeno',
  };
  const columns = {};
  Object.keys(fieldHeaders).forEach((key) => {
    const index = headers.indexOf(fieldHeaders[key]);
    if (index < 0) throw new Error('Missing expense column: ' + fieldHeaders[key]);
    if (headers.lastIndexOf(fieldHeaders[key]) !== index) throw new Error('Duplicate expense column: ' + fieldHeaders[key]);
    columns[key] = index + 1;
  });
  // Ignore prefilled checkboxes when locating the first unused expense row.
  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues() : [];
  const emptyIndex = rows.findIndex((row) => row.every((value, index) =>
    index === columns.closed - 1 || String(value).trim() === ''));
  return { sheet, columns, row: emptyIndex < 0 ? rows.length + 2 : emptyIndex + 2 };
}

function writeExpenseToBudgetSpreadsheet(target, expense, user, receiptUrl) {
  if (!target) return;
  if (target.row > target.sheet.getMaxRows()) target.sheet.insertRowsAfter(target.sheet.getMaxRows(), 1);
  const values = {
    user: user.name || user.email || '',
    name: expense.name,
    storeName: expense.storeName,
    approvedBy: expense.approvedBy,
    department: expense.department,
    category: expense.category,
    amount: Number(expense.amount),
    paymentMethod: expense.paymentMethod,
    receiptUrl: receiptUrl || '',
    closed: false,
    expenseDate: expense.expenseDate,
  };
  Object.keys(values).forEach((key) => {
    target.sheet.getRange(target.row, target.columns[key]).setValue(values[key]);
  });
}

function sendExpenseEmail(payload) {
  const email = payload.email || {};
  const expense = payload.expense || {};
  const receipt = payload.receipt || {};
  const user = payload.user || {};

  if (!email.subject || !email.body || !expense.name || !receipt.base64) {
    return jsonResponse({ ok: false, error: 'Invalid email request.' }, 400);
  }

  const bytes = Utilities.base64Decode(receipt.base64);
  const attachment = Utilities.newBlob(
    bytes,
    getReceiptMimeType(receipt),
    buildReceiptFilename(expense, user, receipt.filename),
  );
  GmailApp.sendEmail(CONFIG.emailRecipient, email.subject, email.body, {
    attachments: [attachment],
  });

  return jsonResponse({ ok: true });
}

function getCategories(payload) {
  const spreadsheetId = String(payload.spreadsheetId || '').trim();
  if (!spreadsheetId) {
    return jsonResponse({ ok: false, error: 'Spreadsheet ID is required.' }, 400);
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName('rozpocty');
  if (!sheet) throw new Error('Sheet tab not found: rozpocty');
  return jsonResponse({ ok: true, categoryTree: extractCategories(sheet.getDataRange().getDisplayValues()) });
}

function authorizeMailPermission() {
  GmailApp.getAliases();
}

function extractCategories(rows) {
  const tree = Object.create(null);
  (rows[0] || []).forEach((header, column) => {
    const department = String(header).trim();
    if (!department || department.toUpperCase() === 'DPH') return;
    const categories = unique(rows.slice(1).map((row) => String(row[column] || '').trim()).filter(Boolean));
    if (!categories.length) return;
    if (Object.prototype.hasOwnProperty.call(tree, department)) throw new Error('Duplicate department: ' + department);
    tree[department] = categories.map((value) => ({ value: value, label: value }));
  });
  if (!Object.keys(tree).length) throw new Error('No departments found in rozpocty.');
  return tree;
}

function getExpensesSpreadsheetId() {
  const configuredId = CONFIG.EXPENSES_SPREADSHEET_ID;
  if (configuredId && configuredId !== 'PASTE_EXPENSES_SPREADSHEET_ID_HERE') {
    return configuredId;
  }

  return PropertiesService.getScriptProperties().getProperty('EXPENSES_SPREADSHEET_ID');
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function buildReceiptFilename(expense, user, originalName) {
  const extension = getReceiptExtension(originalName);
  const datePart = formatExpenseDateForFilename(expense.expenseDate);
  const namePart = sanitizeFilenamePart(expense.name, 'expense', 60);
  const amountPart = sanitizeAmountForFilename(expense.amount);
  const surnamePart = sanitizeFilenamePart(getUserSurname(user), 'unknown', 40);

  return `${datePart}_${namePart}_${amountPart}_${surnamePart}${extension}`;
}

function getReceiptExtension(filename) {
  const match = String(filename || '').match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0].toLowerCase() : '.pdf';
}

function getReceiptMimeType(receipt) {
  const mimeType = String((receipt && receipt.mimeType) || '').toLowerCase();
  if (mimeType) {
    return mimeType;
  }

  return getReceiptExtension(receipt && receipt.filename) === '.pdf' ? 'application/pdf' : 'application/octet-stream';
}

function formatExpenseDateForFilename(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[1]}${match[2]}${match[3]}`;
  }

  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
}

function sanitizeFilenamePart(value, fallback, maxLength) {
  const normalized = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLength);

  return normalized || fallback;
}

function sanitizeAmountForFilename(value) {
  const amount = Number(value);
  if (Number.isFinite(amount)) {
    return amount.toFixed(2).replace('.', '-');
  }

  return sanitizeFilenamePart(value, '0', 20);
}

function getUserSurname(user) {
  const nameParts = String(user.name || '').trim().split(/\s+/).filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts[nameParts.length - 1];
  }

  return String(user.email || '').split('@')[0] || 'unknown';
}

function unique(values) {
  const seen = {};
  const result = [];

  values.forEach((value) => {
    if (seen[value]) {
      return;
    }

    seen[value] = true;
    result.push(value);
  });

  return result;
}
