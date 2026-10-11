/**
 * Smart Mentor → Google Sheets connector
 * ---------------------------------------
 * Paste this whole file into Extensions → Apps Script in your Google Sheet,
 * then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Copy the Web App URL into script.js → CONFIG.dataCollection.googleSheetUrl.
 *
 * The website sends four kinds of records. Each goes to its own tab:
 *   Sign-ups  – new accounts (name, email)
 *   Logins    – each time someone logs in
 *   Profiles  – onboarding answers (major, year, career goal, daily time, focus)
 *   Upgrades  – people who completed Stripe checkout for Plus
 *
 * Passwords are NEVER sent to this sheet.
 * Download anytime as Excel: File → Download → Microsoft Excel (.xlsx).
 */

var TABS = {
  signup:  { name: 'Sign-ups', headers: ['Received', 'Name', 'Email'],                    fields: ['name', 'email'] },
  login:   { name: 'Logins',   headers: ['Received', 'Name', 'Email'],                    fields: ['name', 'email'] },
  profile: { name: 'Profiles', headers: ['Received', 'Name', 'Email', 'Education level', 'Major', 'Academic year', 'Career goal', 'Daily minutes', 'Main focus'],
             fields: ['name', 'email', 'level', 'major', 'year', 'careerGoal', 'minutes', 'focus'] },
  upgrade: { name: 'Upgrades', headers: ['Received', 'Name', 'Email', 'Plan', 'Stripe checkout session (verify in Stripe)'],
             fields: ['name', 'email', 'plan', 'stripeSession'] },
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var tab = TABS[data.type];
    if (!tab) return ContentService.createTextOutput('ignored');

    var sheet = getOrCreateSheet_(tab);
    var row = [new Date()].concat(tab.fields.map(function (f) { return clean_(data[f]); }));
    sheet.appendRow(row);
    return ContentService.createTextOutput('ok');
  } catch (err) {
    return ContentService.createTextOutput('error');
  } finally {
    lock.releaseLock();
  }
}

/** Visiting the Web App URL in a browser shows this — handy to confirm it's deployed. */
function doGet() {
  return ContentService.createTextOutput('Smart Mentor sheet connector is running.');
}

function getOrCreateSheet_(tab) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(tab.name);
  if (!sheet) {
    sheet = ss.insertSheet(tab.name);
    sheet.appendRow(tab.headers);
    sheet.getRange(1, 1, 1, tab.headers.length).setFontWeight('bold').setBackground('#EEF2FF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Keeps values short and stops spreadsheet formulas from being injected. */
function clean_(value) {
  var s = value === undefined || value === null ? '' : String(value).slice(0, 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
