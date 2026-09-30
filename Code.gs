/**
 * RSVP backend for the Rio & Olivia invitation.
 * Paste this into Extensions → Apps Script of your Google Sheet, then deploy as a web app.
 *
 * Sheet "RSVP" columns:
 *   Name | Attendance | Pax | First submitted | Last updated
 *
 * One row per guest name: if the same name submits again, their row is updated,
 * not duplicated. So a guest who changes their mind just submits again.
 */

const SHEET_NAME = 'RSVP';
const MAX_PAX = 5;
const HEADERS = ['Name', 'Attendance', 'Pax', 'First submitted', 'Last updated'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // serialize concurrent submissions so rows don't collide

    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const attending = body.attending === 'yes' ? 'yes' : body.attending === 'no' ? 'no' : null;
    let pax = parseInt(body.pax, 10);

    if (!name) return json({ ok: false, error: 'missing_name' });
    if (!attending) return json({ ok: false, error: 'missing_attendance' });
    if (attending === 'no') pax = 0;
    else if (!(pax >= 1 && pax <= MAX_PAX)) return json({ ok: false, error: 'invalid_pax' });

    const sheet = getSheet_();
    const now = new Date();
    const status = attending === 'yes' ? 'Attending' : 'Not attending';
    const safeName = neutralizeFormula_(name);

    const row = findRowByName_(sheet, name);
    if (row) {
      sheet.getRange(row, 2, 1, 2).setValues([[status, pax]]);
      sheet.getRange(row, 5).setValue(now);
    } else {
      sheet.appendRow([safeName, status, pax, now, now]);
    }

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server_error' });
  } finally {
    lock.releaseLock();
  }
}

// Visiting the web app URL in a browser shows this: a quick "is it deployed?" check.
function doGet() {
  return json({ ok: true, service: 'rsvp' });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function findRowByName_(sheet, name) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const key = name.toLowerCase();
  const names = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < names.length; i++) {
    const cell = String(names[i][0]).replace(/^'/, '').trim().toLowerCase();
    if (cell === key) return i + 2;
  }
  return 0;
}

// Names come from a URL anyone can edit. A name starting with = + - @ would run as a
// spreadsheet formula, so prefix it with an apostrophe to store it as plain text.
function neutralizeFormula_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
