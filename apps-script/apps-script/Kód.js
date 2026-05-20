const CONFIG = {
  sheetId: '1fisxKO42wsDBjQx-UZGiOhUqg9ZFYTBSW4IAk6nj-CY',
  sheetName: 'Expenses',
  expensesSpreadsheetId: '1dMACC3Gyeor0Xv-mh0sN1y7sDOepLLiNeljMUqwdjWE', //dev: 1dMACC3Gyeor0Xv-mh0sN1y7sDOepLLiNeljMUqwdjWE, prod: 1GpLzU2RkzoDuTGyh2lxRA8h8xrbh0weJ1TILRWY9qCA
  driveFolderId: '1mwZucy4X0_FLU8xP6h8qYfvH8uadM001', //dev: 1mwZucy4X0_FLU8xP6h8qYfvH8uadM001, prod: 1zwG1WNtUu0OLi-KYv98iz5y6NBgJl0R5
  emailRecipient: 'martin.tavoda@iaeste.cz', // finance.brno@iaeste.cz
  senderAlias: 'it.brno@iaeste.cz',
  secret: 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET',
};

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.secret !== CONFIG.secret) {
      return jsonResponse({ ok: false, error: 'Unauthorized.' }, 401);
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

    const sheet = SpreadsheetApp.openById(CONFIG.sheetId).getSheetByName(CONFIG.sheetName);
    if (!sheet) {
      return jsonResponse({ ok: false, error: 'Sheet tab not found.' }, 500);
    }

    const budgetTarget = findBudgetWriteTarget(expense);

    const folder = DriveApp.getFolderById(CONFIG.driveFolderId);
    let file = null;
    if (receipt && receipt.base64) {
      const filename = buildReceiptFilename(expense, user, receipt.filename);
      const bytes = Utilities.base64Decode(receipt.base64);
      const blob = Utilities.newBlob(bytes, getReceiptMimeType(receipt), filename);
      file = folder.createFile(blob);
    }

    sheet.appendRow([
      payload.submittedAt || new Date().toISOString(),
      expense.expenseDate || '',
      expense.name,
      expense.amount,
      expense.department,
      expense.category,
      expense.subcategory,
      expense.paymentMethod,
      file ? file.getUrl() : '',
      user.name || '',
      user.email || '',
      user.uid || '',
    ]);

    writeExpenseToBudgetSpreadsheet(budgetTarget, expense, user);

    return jsonResponse({
      ok: true,
      receiptFileId: file ? file.getId() : '',
      receiptUrl: file ? file.getUrl() : '',
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) }, 500);
  }
}

function findBudgetWriteTarget(expense) {
  const spreadsheetId = getExpensesSpreadsheetId();
  if (!spreadsheetId) {
    return null;
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(expense.department);
  if (!sheet) {
    throw new Error(`Department sheet not found: ${expense.department}`);
  }

  const categoryBlock = findCategoryBlock(sheet, expense.category);
  if (!categoryBlock) {
    throw new Error(`Category block not found: ${expense.department} / ${expense.category}`);
  }

  const expenseHeaderRow = findExpenseHeaderRow(sheet, categoryBlock.startColumn);
  if (!expenseHeaderRow) {
    throw new Error(`Expense table header not found: ${expense.department} / ${expense.category}`);
  }

  const row = findNextExpenseRow(sheet, expenseHeaderRow, categoryBlock.startColumn);

  return {
    sheet,
    row,
    startColumn: categoryBlock.startColumn,
  };
}

function writeExpenseToBudgetSpreadsheet(target, expense, user) {
  if (!target) {
    return;
  }

  const amount = Number(expense.amount);
  const note = expense.name;
  let payer = '';
  if (expense.paymentMethod != 'Soukromá platba'){
    payer = expense.paymentMethod || '';
  } else{
    payer = user.name || user.email || '';
  }
  

  target.sheet.getRange(target.row, target.startColumn, 1, 5).setValues([
    [false, Number.isFinite(amount) ? amount : expense.amount, expense.subcategory, note, payer],
  ]);
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
  const aliases = GmailApp.getAliases();
  if (aliases.indexOf(CONFIG.senderAlias) === -1) {
    throw new Error(`Sender alias is not available for this Apps Script account: ${CONFIG.senderAlias}`);
  }

  GmailApp.sendEmail(CONFIG.emailRecipient, email.subject, email.body, {
    from: CONFIG.senderAlias,
    name: user.name || user.email || 'IAESTE Expense Manager',
    replyTo: user.email || '',
    attachments: [attachment],
  });

  return jsonResponse({ ok: true });
}

function authorizeMailPermission() {
  GmailApp.getAliases();
}

function getExpensesSpreadsheetId() {
  const configuredId = CONFIG.expensesSpreadsheetId;
  if (configuredId && configuredId !== 'PASTE_EXPENSES_SPREADSHEET_ID_HERE') {
    return configuredId;
  }

  return PropertiesService.getScriptProperties().getProperty('EXPENSES_SPREADSHEET_ID');
}

function findCategoryBlock(sheet, category) {
  const lastColumn = sheet.getLastColumn();
  const categoryRow = sheet.getRange(1, 1, 2, lastColumn).getDisplayValues();

  for (let column = 1; column <= lastColumn; column += 1) {
    const categoryName = String(categoryRow[0][column - 1] || '').trim();
    const type = String(categoryRow[1][column - 1] || '').trim();

    if (categoryName === category && type === 'Výdaje') {
      return { startColumn: column };
    }
  }

  return null;
}

function findExpenseHeaderRow(sheet, startColumn) {
  const maxRows = sheet.getLastRow();
  const values = sheet.getRange(1, startColumn, maxRows, 1).getDisplayValues();

  for (let row = 1; row <= maxRows; row += 1) {
    if (String(values[row - 1][0] || '').trim() === 'Cena') {
      return row;
    }
  }

  return null;
}

function findNextExpenseRow(sheet, headerRow, startColumn) {
  const firstDataRow = headerRow + 1;
  const maxRows = sheet.getMaxRows();
  const rowCount = maxRows - headerRow;

  if (rowCount <= 0) {
    sheet.insertRowsAfter(maxRows, 1);
    return maxRows + 1;
  }

  const values = sheet.getRange(firstDataRow, startColumn, rowCount, 5).getDisplayValues();

  for (let index = 0; index < values.length; index += 1) {
    const row = values[index];
    const hasData = row.slice(1).some((value) => String(value || '').trim() !== '');

    if (!hasData) {
      return firstDataRow + index;
    }
  }

  sheet.insertRowsAfter(maxRows, 1);
  return maxRows + 1;
}

function buildBudgetExpenseNote(expense) {
  const parts = [expense.name];

  if (expense.paymentMethod) {
    parts.push(expense.paymentMethod);
  }

  return parts.filter(Boolean).join(' - ');
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
