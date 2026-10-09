const crypto = require("crypto");
const fetch = require("node-fetch");

/* Texnika ro'yxati formasi (/texnika/) — xodim korxona bergan texnikani va
   ishiga yetishmayotgan texnikani kiritadi. Javob Google Sheets'ga ("Texnika
   ro'yxati" va "Texnika ehtiyoji" varaqlari, har texnika — alohida qator)
   va xulosa Bitrix24'da shaxsiy xabar bo'lib boradi.

   Xodimlar ro'yxati (ism-sharif, lavozim) repoda faqat SHIFRLANGAN holda
   turadi (texnika_royxat.js; repo ochiq). Kalit — Netlify'dagi TEXNIKA_KALIT.
   Ro'yxat sahifaga faqat havoladagi to'g'ri kod bilan beriladi. */

// Texnika turlari har bo'limda o'zi (ro'yxat faylida "turlar"); bo'limda
// berilmagan bo'lsa — shu zaxira ro'yxat. "Boshqa" har doim oxirida.
const BOSHQA = "Boshqa";
const ZAXIRA_TURLAR = [
  "Noutbuk / kompyuter", "Monitor", "Printer / MFU", "Chek printeri", "Skaner",
  "Telefon (smartfon)", "Planshet", "Router / Wi-Fi",
];
const turlarOl = (bolim) => {
  const t = Array.isArray(bolim.turlar) && bolim.turlar.length ? bolim.turlar : ZAXIRA_TURLAR;
  return [...new Set(t.filter((x) => typeof x === "string" && x && x !== BOSHQA)), BOSHQA];
};
const HOLATLAR = { yaxshi: "Ishlaydi", tamir: "Ta'mir kerak", buzuq: "Ishlamaydi" };
// Do'kon standarti: bo'lim ro'yxatidagi har bir texnika filialda kamida 1 ta
// bo'lishi kerak (user 2026-10-09). Forma ularni oldindan qo'yib beradi;
// filialda yo'q bo'lsa soni 0 yoziladi.
const YOQ_HOLAT = "Yo'q";
const MAX_TEXNIKA = 25;
const MAX_EHTIYOJ = 8;
const MAX_SONI = 50;

const ROYXAT_SARLAVHA = [
  "Sana-vaqt", "Bo'lim", "Joy", "Tabel №", "Xodim", "Lavozim",
  "Texnika", "Soni", "Model", "Seriya / inventar №", "Holati", "Izoh",
];
const EHTIYOJ_SARLAVHA = [
  "Sana-vaqt", "Bo'lim", "Joy", "Tabel №", "Xodim", "Lavozim",
  "Kerakli texnika", "Soni", "Nima uchun", "Shoshilinch",
];
// Ro'yxatda yo'q xodim — ismini o'zi yozadi
const YOQ = "__yoq__";

/* ---------------- shifr ---------------- */

const kalitOl = () => {
  const b = Buffer.from(String(process.env.TEXNIKA_KALIT || "").trim(), "base64");
  return b.length === 32 ? b : null;
};

// Havoladagi kod kalitdan hosil qilinadi — alohida sozlama shart emas
const havolaKodi = (kalit) =>
  crypto.createHmac("sha256", kalit).update("texnika-havola").digest("base64url").slice(0, 12);

const kodTogri = (kalit, kod) => {
  const a = Buffer.from(havolaKodi(kalit));
  const b = Buffer.from(String(kod || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Format: base64( iv[12] | tag[16] | shifrmatn ) — AES-256-GCM
function shifrla(kalit, obyekt) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", kalit, iv);
  const sm = Buffer.concat([c.update(JSON.stringify(obyekt), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), sm]).toString("base64");
}

function ochish(kalit, b64) {
  const b = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", kalit, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
}

function royxatOl(kalit) {
  const { SHIFR } = require("./texnika_royxat.js");
  return ochish(kalit, SHIFR);
}

/* ---------------- yordamchilar ---------------- */

const qisqa = (v, n) => {
  let s = typeof v === "string" ? v : "";
  if (typeof s.toWellFormed === "function") s = s.toWellFormed();
  return Array.from(s.replace(/\s+/g, " ").trim()).slice(0, n).join("").trim();
};

// Formula in'ektsiyasidan himoya (=, +, -, @ bilan boshlangan matn)
const xavfsiz = (v) => {
  const s = String(v == null ? "" : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
};

// Bitrix BB-kodlari ([b], [url] ...) foydalanuvchi matnidan o'tmasin
const bb = (v) => String(v || "").replace(/\[/g, "(").replace(/\]/g, ")");

const toshkentVaqti = (ms) => {
  const [y, m, k, vaqt] = new Date(ms + 5 * 3600 * 1000).toISOString()
    .replace(/\..*$/, "").split(/[-T]/);
  return `${k}.${m}.${y} ${vaqt}`;
};

const javob = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

// Bo'lim → (joy) → xodimlar. Do'kon bo'limida joy (filial) tanlanadi,
// qolganlarida xodimlar to'g'ridan-to'g'ri bo'limda turadi.
function xodimlar(royxat, bolimKalit, joyNomi) {
  const b = (royxat.bolimlar || []).find((x) => x.kalit === bolimKalit);
  if (!b) return null;
  if (Array.isArray(b.joylar)) {
    const j = b.joylar.find((x) => x.nom === joyNomi);
    return j ? { bolim: b, joy: j.nom, xodimlar: j.xodimlar || [] } : null;
  }
  return { bolim: b, joy: "", xodimlar: b.xodimlar || [] };
}

/* ---------------- tekshiruv ---------------- */

function tekshir(d, royxat) {
  const joy = xodimlar(royxat, d.bolim, d.joy);
  if (!joy) return { xato: d.bolim && !(royxat.bolimlar || []).some((x) => x.kalit === d.bolim) ? "bolim" : "joy" };

  let ism, lavozim, tabel = "";
  if (d.xodim === YOQ) {
    ism = qisqa(d.ism, 80);
    lavozim = qisqa(d.lavozim, 60);
    if (!ism) return { xato: "ism" };
    if (!lavozim) return { xato: "lavozim" };
  } else {
    const x = joy.xodimlar.find((v) => v.ism === d.xodim);
    if (!x) return { xato: "xodim" };
    ({ ism, lavozim } = x);
    tabel = String(x.tabel || "");
  }
  const turlar = turlarOl(joy.bolim);
  // Do'konda standart ro'yxat majburiy, "texnika yo'q" belgisi yo'q
  const standart = Array.isArray(joy.bolim.joylar) ? turlar.filter((t) => t !== BOSHQA) : [];

  const texnikaYoq = !standart.length && d.texnika_yoq === true;
  const xom = Array.isArray(d.texnika) ? d.texnika : [];
  if (!texnikaYoq && !xom.length) return { xato: "texnika" };
  if (xom.length > MAX_TEXNIKA) return { xato: "texnika_kop" };
  const texnika = [];
  if (!texnikaYoq) {
    for (let i = 0; i < xom.length; i++) {
      const t = xom[i] || {};
      if (!turlar.includes(t.turi)) return { xato: "texnika_turi", qator: i };
      // berilmasa — 1; bo'sh/null — xato (jimgina 0 = "yo'q" bo'lib qolmasin)
      const soni = t.soni === undefined ? 1 : (t.soni === null || t.soni === "" ? NaN : Number(t.soni));
      const eng = standart.includes(t.turi) ? 0 : 1;      // 0 — filialda yo'q
      if (!Number.isInteger(soni) || soni < eng || soni > MAX_SONI) return { xato: "texnika_soni", qator: i };
      const izoh = qisqa(t.izoh, 200);
      if (t.turi === BOSHQA && !izoh) return { xato: "texnika_boshqa", qator: i };
      if (soni === 0) {
        texnika.push({ turi: t.turi, soni, model: "", seriya: "", holat: YOQ_HOLAT, izoh });
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(HOLATLAR, t.holat)) return { xato: "texnika_holat", qator: i };
      texnika.push({
        turi: t.turi, soni, model: qisqa(t.model, 80), seriya: qisqa(t.seriya, 120),
        holat: HOLATLAR[t.holat], izoh,
      });
    }
    if (standart.some((tur) => !texnika.some((t) => t.turi === tur))) return { xato: "texnika_standart" };
  }

  const xomE = Array.isArray(d.ehtiyoj) ? d.ehtiyoj : [];
  if (xomE.length > MAX_EHTIYOJ) return { xato: "ehtiyoj_kop" };
  const ehtiyoj = [];
  for (let i = 0; i < xomE.length; i++) {
    const e = xomE[i] || {};
    if (!turlar.includes(e.turi)) return { xato: "ehtiyoj_turi", qator: i };
    const soni = Number(e.soni);
    if (!Number.isInteger(soni) || soni < 1 || soni > MAX_SONI) return { xato: "ehtiyoj_soni", qator: i };
    const sabab = qisqa(e.sabab, 300);
    if (!sabab) return { xato: "ehtiyoj_sabab", qator: i };
    ehtiyoj.push({ turi: e.turi, soni, sabab, shoshilinch: e.shoshilinch === true });
  }

  return {
    javob: {
      bolim: joy.bolim.nom, joy: joy.joy, tabel, ism, lavozim,
      royxatdaYoq: d.xodim === YOQ, texnikaYoq, texnika, ehtiyoj,
    },
  };
}

/* ---------------- yozuvlar ---------------- */

function qatorlar(j, sana) {
  const bosh = [sana, j.bolim, j.joy || "—", j.tabel || "", xavfsiz(j.ism), xavfsiz(j.lavozim)];
  const royxat = j.texnikaYoq
    ? [[...bosh, "— texnika yo'q —", "", "", "", "", ""]]
    : j.texnika.map((t) => [...bosh, t.turi, t.soni, xavfsiz(t.model), xavfsiz(t.seriya), t.holat, xavfsiz(t.izoh)]);
  const ehtiyoj = j.ehtiyoj.map((e) => [...bosh, e.turi, e.soni, xavfsiz(e.sabab), e.shoshilinch ? "Ha" : "Yo'q"]);
  return { royxat, ehtiyoj };
}

function bitrixMatni(j, izoh) {
  const joy = j.joy ? `${j.bolim} · ${j.joy}` : j.bolim;
  const q = [
    `[b]🖥 Texnika ro'yxati — ${bb(joy)}[/b]`,
    `${bb(j.ism)} — ${bb(j.lavozim)}${j.royxatdaYoq ? " (ro'yxatda yo'q edi)" : ""}`,
    "",
  ];
  if (j.texnikaYoq) {
    q.push("Korxona texnikasi: yo'q");
  } else {
    q.push(`Korxona texnikasi (${j.texnika.reduce((n, t) => n + t.soni, 0)} dona):`);
    j.texnika.forEach((t, i) => {
      const qism = [t.model, t.seriya ? `№ ${t.seriya}` : "", t.izoh].filter(Boolean).map(bb).join(", ");
      if (t.soni === 0) {
        q.push(`${i + 1}. ${t.turi} · ❌ Filialda yo'q${t.izoh ? " — " + bb(t.izoh) : ""}`);
        return;
      }
      q.push(`${i + 1}. ${t.turi}${t.soni > 1 ? ` × ${t.soni}` : ""}${qism ? " — " + qism : ""}`
        + ` · ${t.holat === "Ishlaydi" ? "✅" : "⚠️"} ${t.holat}`);
    });
  }
  if (j.ehtiyoj.length) {
    q.push("", "Yetishmaydi:");
    j.ehtiyoj.forEach((e) => {
      q.push(`• ${e.turi} × ${e.soni}${e.shoshilinch ? " — [b]shoshilinch[/b]" : ""}: ${bb(e.sabab)}`);
    });
  }
  if (izoh) q.push("", izoh);
  return q.join("\n");
}

/* ---------------- tashqi xizmatlar ---------------- */

async function vaqtBilan(muddatMs, ish) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const soat = ctrl ? setTimeout(() => ctrl.abort(), muddatMs) : null;
  try {
    return await ish(ctrl ? ctrl.signal : undefined);
  } finally {
    if (soat) clearTimeout(soat);
  }
}

// "yozildi" | "kutilmoqda" (vaqt tugadi — Apps Script odatda baribir yozadi) | "xato ..."
async function jadvalga(url, varaq, sarlavha, qator, muddatMs) {
  try {
    return await vaqtBilan(muddatMs, async (signal) => {
      const r = await fetch(url, {
        method: "POST",
        redirect: "manual",          // Apps Script qatorni yozib 302 qaytaradi
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheet: varaq, headers: sarlavha, row: qator }),
        signal,
      });
      return (r.ok || [301, 302, 303].includes(r.status)) ? "yozildi" : `xato ${r.status}`;
    });
  } catch (e) {
    return e && e.name === "AbortError" ? "kutilmoqda" : "xato";
  }
}

// Ulagich bitta so'rovda bitta qator yozadi. Varaq hali yo'q bo'lsa
// parallel so'rovlar uni bir necha marta yaratmoqchi bo'lib xato beradi —
// shuning uchun har varaqning birinchi qatori alohida, qolgani parallel.
async function varaqqa(url, varaq, sarlavha, qatorlar_, muddatMs) {
  if (!qatorlar_.length) return [];
  const birinchi = await jadvalga(url, varaq, sarlavha, qatorlar_[0], muddatMs);
  const qolgan = await Promise.all(qatorlar_.slice(1).map((q) => jadvalga(url, varaq, sarlavha, q, muddatMs)));
  return [birinchi, ...qolgan];
}

async function bitrixga(webhook, dialog, matn, muddatMs) {
  const asos = webhook.endsWith("/") ? webhook : webhook + "/";
  return vaqtBilan(muddatMs, async (signal) => {
    const r = await fetch(asos + "im.message.add.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ DIALOG_ID: dialog, MESSAGE: matn }),
      signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      throw new Error(`Bitrix ${r.status}: ${j.error_description || j.error || "javob yo'q"}`);
    }
    return j.result;
  });
}

/* ---------------- handler ---------------- */

exports.handler = async (event, context) => {
  const boshi = Date.now();
  const webhook = String(process.env.BITRIX_WEBHOOK || "").trim();
  const dialog = String(process.env.BITRIX_TEXNIKA_DIALOG || "53").trim();
  // Sir (Bitrix kodi) logga chiqmasin
  const tozala = (e) => {
    let m = String((e && e.message) || e);
    if (webhook) m = m.split(webhook).join("<bitrix>");
    return m.replace(/(\/rest\/\d+\/)[A-Za-z0-9]{8,}/g, "$1***");
  };

  try {
    const kalit = kalitOl();
    const q = event.queryStringParameters || {};

    if (event.httpMethod === "GET") {
      // Sirsiz holat: nimalar sozlangan
      if (q.holat) {
        let xodimSoni = null;
        if (kalit) {
          try {
            const r = royxatOl(kalit);
            xodimSoni = (r.bolimlar || []).reduce((n, b) => n + (b.joylar
              ? b.joylar.reduce((k, j) => k + (j.xodimlar || []).length, 0)
              : (b.xodimlar || []).length), 0);
          } catch (e) {
            xodimSoni = "ochilmadi";
          }
        }
        return javob(200, {
          kalit: Boolean(kalit), xodimlar: xodimSoni,
          jadval: Boolean(process.env.SHEETS_WEBHOOK), bitrix: Boolean(webhook),
        });
      }
      // Sahifa uchun ro'yxat — faqat to'g'ri kod bilan
      if (!kalit) return javob(503, { xato: "sozlanmagan" });
      if (!kodTogri(kalit, q.kod)) return javob(403, { xato: "kod" });
      const r = royxatOl(kalit);
      return javob(200, {
        bolimlar: (r.bolimlar || []).map((b) => ({
          kalit: b.kalit, nom: b.nom, turlar: turlarOl(b),
          ...(b.joylar
            ? { joylar: b.joylar.map((j) => ({ nom: j.nom, xodimlar: (j.xodimlar || []).map((x) => ({ ism: x.ism, lavozim: x.lavozim })) })) }
            : { xodimlar: (b.xodimlar || []).map((x) => ({ ism: x.ism, lavozim: x.lavozim })) }),
        })),
      });
    }

    if (event.httpMethod !== "POST") return javob(405, { xato: "usul" });
    if (!kalit) return javob(503, { xato: "sozlanmagan" });

    let d;
    try {
      d = JSON.parse(event.body || "");
    } catch (e) {
      return javob(400, { xato: "sorov" });
    }
    if (!d || typeof d !== "object" || Array.isArray(d)) return javob(400, { xato: "sorov" });
    if (!kodTogri(kalit, d.kod)) return javob(403, { xato: "kod" });
    if (qisqa(d.tuzoq, 200)) return javob(200, { ok: true });      // spam-bot

    const { xato, qator, javob: j } = tekshir(d, royxatOl(kalit));
    if (xato) return javob(400, { xato, ...(qator !== undefined ? { qator } : {}) });

    const sheetsUrl = process.env.SHEETS_WEBHOOK;
    if (!sheetsUrl && !webhook) {
      console.error("Texnika: jadval ham, Bitrix ham sozlanmagan");
      return javob(500, { xato: "server" });
    }

    /* Google Sheets (ikki varaq) va Bitrix24 parallel ketadi — Netlify
       funksiyasi 10 soniyada to'xtatiladi. Bitrix xabarida to'liq ro'yxat
       bor: jadval xato bersa ham ma'lumot yo'qolmaydi. */
    const { royxat, ehtiyoj } = qatorlar(j, toshkentVaqti(Date.now()));
    const qoldi = context && typeof context.getRemainingTimeInMillis === "function"
      ? context.getRemainingTimeInMillis() : 10000 - (Date.now() - boshi);
    const muddat = Math.max(1000, Math.min(3000, (qoldi - 2500) / 2));
    const jadvalIsh = !sheetsUrl ? Promise.resolve([]) : Promise.all([
      varaqqa(sheetsUrl, process.env.TEXNIKA_TAB || "Texnika ro'yxati", ROYXAT_SARLAVHA, royxat, muddat),
      varaqqa(sheetsUrl, process.env.TEXNIKA_EHTIYOJ_TAB || "Texnika ehtiyoji", EHTIYOJ_SARLAVHA, ehtiyoj, muddat),
    ]).then(([a, b]) => [...a, ...b]);
    const bitrixIsh = !webhook ? Promise.resolve(false)
      : bitrixga(webhook, dialog, bitrixMatni(j), 3000).then(() => true, (e) => {
        console.error("Texnika Bitrix xato:", tozala(e));
        return false;
      });
    const [natijalar, bitrixOk] = await Promise.all([jadvalIsh, bitrixIsh]);

    const xatoQator = natijalar.filter((s) => s.startsWith("xato")).length;
    const jadvalOk = Boolean(sheetsUrl) && xatoQator === 0;
    if (xatoQator) {
      console.error(`Texnika Sheets: ${xatoQator}/${natijalar.length} qator yozilmadi`);
      if (bitrixOk) {
        try {
          await bitrixga(webhook, dialog, `⚠️ ${bb(j.ism)}: ${xatoQator} ta qator Google jadvalga `
            + "yozilmadi — yuqoridagi xabardan qo'lda kiriting.", 1500);
        } catch (e) {
          console.error("Texnika Bitrix ogohlantirish xato:", tozala(e));
        }
      }
    }

    if (!jadvalOk && !bitrixOk) return javob(502, { xato: "yuborilmadi" });
    return javob(200, { ok: true, jadval: jadvalOk ? "yozildi" : (sheetsUrl ? "qisman" : "ochirilgan"), bitrix: bitrixOk });
  } catch (e) {
    console.error("Texnika xato:", tozala(e));
    return javob(500, { xato: "server" });
  }
};

// Sinovlar va shifrlash vositasi uchun
exports._ichki = {
  ZAXIRA_TURLAR, BOSHQA, turlarOl, HOLATLAR, YOQ, YOQ_HOLAT, MAX_TEXNIKA, ROYXAT_SARLAVHA, EHTIYOJ_SARLAVHA,
  shifrla, ochish, havolaKodi, kodTogri, tekshir, qatorlar, bitrixMatni, xavfsiz,
};
