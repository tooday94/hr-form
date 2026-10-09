/**
 * Texnika formasi (/texnika/) uchun Google Sheets ulagichi — texnika jadvalida.
 *
 * O'rnatish: jadval → Kengaytmalar (Extensions) → Apps Script → shu kodni
 * qo'ying → Deploy → New deployment → Web app → Execute as: Me,
 * Who has access: Anyone → URL Netlify'da TEXNIKA_SHEETS_WEBHOOK ga.
 * Kodni YANGILASH: Deploy → Manage deployments → ✏️ → Version: New version →
 * Deploy (URL o'zgarmaydi).
 *
 * Forma faqat o'z varaqlariga ("Texnika — ...") yozadi; jadvaldagi boshqa
 * varaqlarga tegmaydi. "rows" — bitta formaning barcha qatorlari: bitta blok
 * bo'lib, qulf ostida yoziladi (boshqa forma o'rtaga tushmaydi).
 * Eski ko'rinish ({row: [...]}) ham ishlaydi.
 */
function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var rows = d.rows || (d.row ? [d.row] : []);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(d.sheet);
    if (!sh) {
      sh = ss.insertSheet(d.sheet);
      if (d.headers && d.headers.length) sh.appendRow(d.headers);
    }
    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
