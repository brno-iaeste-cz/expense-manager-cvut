const CONFIG = {
  sheetId: 'PASTE_GOOGLE_SHEET_ID_HERE',
  sheetName: 'Expenses',
  driveFolderId: 'PASTE_GOOGLE_DRIVE_FOLDER_ID_HERE',
  secret: 'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET',
};

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    if (payload.secret !== CONFIG.secret) {
      return jsonResponse({ ok: false, error: 'Unauthorized.' }, 401);
    }

    const expense = payload.expense;
    const receipt = payload.receipt;
    const user = payload.user || {};

    if (!expense || !receipt || !receipt.base64) {
      return jsonResponse({ ok: false, error: 'Invalid request.' }, 400);
    }

    const folder = DriveApp.getFolderById(CONFIG.driveFolderId);
    const filename = buildReceiptFilename(expense.name, receipt.filename);
    const bytes = Utilities.base64Decode(receipt.base64);
    const blob = Utilities.newBlob(bytes, receipt.mimeType || 'image/jpeg', filename);
    const file = folder.createFile(blob);

    const sheet = SpreadsheetApp.openById(CONFIG.sheetId).getSheetByName(CONFIG.sheetName);
    if (!sheet) {
      return jsonResponse({ ok: false, error: 'Sheet tab not found.' }, 500);
    }

    sheet.appendRow([
      payload.submittedAt || new Date().toISOString(),
      expense.name,
      expense.amount,
      expense.department,
      expense.category,
      expense.subcategory,
      expense.paymentMethod,
      file.getUrl(),
      user.email || '',
      user.uid || '',
    ]);

    return jsonResponse({
      ok: true,
      receiptFileId: file.getId(),
      receiptUrl: file.getUrl(),
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) }, 500);
  }
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function buildReceiptFilename(name, originalName) {
  const extension = getExtension(originalName);
  const namePart = String(name || 'expense')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);

  return `${namePart}-${Utilities.getUuid()}${extension}`;
}

function getExtension(filename) {
  const match = String(filename || '').match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0].toLowerCase() : '.jpg';
}
