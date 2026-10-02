const fetch = require("node-fetch");
const FormData = require("form-data");

/* Hamkorlik taklifi formasi (/hamkorlik/) — javobni Telegram guruhiga va
   Google Sheets'ga ("Hamkorlik takliflari" varag'i) yuboradi.

   Telegram botidagi (@felizauz_bot) "Hamkorlik taklifi" formasi bilan bir
   xil shablon: o'sha savollar, o'sha variantlar, o'sha varaq, o'sha
   ustunlar — takliflar qaysi yo'ldan kelmasin, bitta ro'yxatda turadi. */

// Yozuvlar botdagi tugmalar bilan AYNAN bir xil (jadvalda "Turi" va
// "Obunachilar" bo'yicha saralash/filtr ishlashi uchun). Forma qaysi tilda
// ochilgan bo'lmasin, jadvalga shu yozuvlar tushadi.
const TURLAR = {
  bloger: "📸 Bloger / reklama",
  yetkazuvchi: "📦 Yetkazib beruvchi (tovar)",
  boshqa: "💡 Boshqa taklif",
};
const OBUNACHILAR = {
  "1-5": "1–5 ming",
  "5-10": "5–10 ming",
  "10-50": "10–50 ming",
  "50-100": "50–100 ming",
  "100+": "100 ming+",
};
// A–I — botdagi bilan bir xil; J — odam qaysi akkauntga yozgani (Sevinch
// havolaga ?k=<akkaunt> qo'shib beradi: nessa.uz, feliza_uz, telegram_nessa ...)
const SARLAVHALAR = [
  "Sana-vaqt", "Username", "Ism", "Turi", "Taklif", "Instagram",
  "Obunachilar", "Statistika", "Telefon", "Manba",
];

const RASM_CHEGARA = 5 * 1024 * 1024;   // bayt (forma rasmni o'zi siqadi, odatda < 1 MB)

// Takliflar boradigan joy: "guruh" yoki "guruh:mavzu" (forum guruhdagi
// subchat). Netlify'dagi HAMKORLIK_CHAT_ID bo'lsa — o'sha; bo'lmasa shu
// standart; u ham bo'sh bo'lsa — anketalar guruhi (TELEGRAM_CHAT_ID).
// Bot o'sha guruh a'zosi bo'lishi shart. Yuborib bo'lmasa taklif yo'qolmaydi:
// anketalar guruhiga tushadi (sababi bilan).
const HAMKORLIK_MANZIL = "";

const manzil = (v) => {
  const [chat, mavzu] = String(v || "").trim().split(":");
  if (!/^-?\d+$/.test(chat || "")) return null;
  return { chat, mavzu: /^\d+$/.test(mavzu || "") ? Number(mavzu) : null };
};
const MAVZU_YOQ = /thread not found|topic.?(closed|deleted)/i;

const bor = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);
// Uzunlik belgilar bo'yicha kesiladi (emoji o'rtasidan bo'linib, Telegram
// rad etadigan buzuq matn chiqmasin)
const qisqa = (v, n) => {
  let s = typeof v === "string" ? v : "";
  if (typeof s.toWellFormed === "function") s = s.toWellFormed();
  return Array.from(s.trim()).slice(0, n).join("").trim();
};
// Bir qatorli maydon: ichidagi yangi qator xabarda soxta satr yasamasin
const birQator = (v, n) => qisqa(typeof v === "string" ? v.replace(/\s+/g, " ") : "", n);

// Formula in'ektsiyasidan himoya: =, +, -, @ bilan boshlangan matnni
// Google Sheets formula deb bajaradi. Boshiga apostrof qo'yilsa oddiy
// matn bo'lib qoladi (apostrof ko'rinmaydi); "+998..." ham saqlanadi.
const xavfsiz = (v) => {
  const s = String(v == null ? "" : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
};

// Akkaunt nomi havoladan keladi — faqat harf, raqam, "_" va "." qoldiriladi
// (guruh xabariga begona matn tiqishtirib bo'lmasin). Topilmasa — "".
const akkauntNomi = (v) => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[a-z0-9_.]{1,40}$/.test(s) ? s : "";
};
// Telegram heshtegi nuqtada uziladi: nessa.uz → #nessa_uz
const heshteg = (akkaunt) => "#" + akkaunt.replace(/[^a-z0-9_]/g, "_");

// Sana botdagi yozuvlar bilan bir xil ko'rinishda: 02.10.2026 23:18:44 (Toshkent)
const toshkentVaqti = (ms) => {
  const [y, m, k, vaqt] = new Date(ms + 5 * 3600 * 1000).toISOString()
    .replace(/\..*$/, "").split(/[-T]/);
  return `${k}.${m}.${y} ${vaqt}`;
};

const javob = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

// Faqat haqiqiy rasm guruhga uzatiladi (JPEG / PNG / WebP)
function rasmTuri(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", nom: "statistika.jpg" };
  }
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") {
    return { mime: "image/png", nom: "statistika.png" };
  }
  if (buf.length > 12 && buf.toString("latin1", 0, 4) === "RIFF"
      && buf.toString("latin1", 8, 12) === "WEBP") {
    return { mime: "image/webp", nom: "statistika.webp" };
  }
  return null;
}

// Forma javobini tekshiradi. Xato bo'lsa {xato: "<kod>"} — kodni sahifa
// foydalanuvchi tilidagi matnga aylantiradi.
function tekshir(d) {
  if (!bor(TURLAR, d.turi)) return { xato: "turi" };
  const t = {
    turKalit: d.turi,
    turi: TURLAR[d.turi],
    ism: birQator(d.ism, 80),
    telefon: birQator(d.telefon, 40),
    instagram: "",
    obunachilar: "",
    taklif: "",
    rasm: null,
    akkaunt: akkauntNomi(d.kanal),
    til: d.til === "ru" ? "ru" : "uz",
  };
  if (!t.ism) return { xato: "ism" };

  if (t.turKalit === "bloger") {
    t.instagram = birQator(d.instagram, 120);
    if (!t.instagram) return { xato: "instagram" };
    if (!bor(OBUNACHILAR, d.obunachilar)) return { xato: "obunachilar" };
    t.obunachilar = OBUNACHILAR[d.obunachilar];

    const b64 = typeof d.rasm === "string" ? d.rasm : "";
    if (!b64) return { xato: "rasm" };
    if (b64.length > RASM_CHEGARA * 1.4) return { xato: "rasm_katta" };
    const buf = Buffer.from(b64, "base64");
    const tur = rasmTuri(buf);
    if (!tur) return { xato: "rasm_format" };
    if (buf.length > RASM_CHEGARA) return { xato: "rasm_katta" };
    t.rasm = { buf, ...tur };
  } else {
    t.taklif = qisqa(d.taklif, 3000);
    if (!t.taklif) return { xato: "taklif" };
  }

  if (t.telefon.replace(/\D/g, "").length < 9) return { xato: "telefon" };
  return { taklif: t };
}

function xabarMatni(t) {
  const q = [
    "🤝 Hamkorlik taklifi (sayt orqali)",
    `Akkaunt: ${t.akkaunt ? heshteg(t.akkaunt) : "ko'rsatilmagan"}`,
    "",
    `Turi: ${t.turi}`,
    `Ism: ${t.ism}`,
  ];
  if (t.turKalit === "bloger") {
    q.push(`Instagram: ${t.instagram}`, `Obunachilar: ${t.obunachilar}`);
  } else {
    q.push(`Taklif: ${t.taklif}`);
  }
  q.push(`Telefon: ${t.telefon}`);
  if (t.til === "ru") q.push("Til: ruscha");
  return q.join("\n");
}

async function telegramga(token, chat, t, mavzu, izoh) {
  const matn = xabarMatni(t) + (izoh ? `\n\n${izoh}` : "");
  let res;
  if (t.rasm) {
    const fd = new FormData();
    fd.append("chat_id", chat);
    if (mavzu) fd.append("message_thread_id", String(mavzu));
    fd.append("caption", matn);
    fd.append("photo", t.rasm.buf, { filename: t.rasm.nom, contentType: t.rasm.mime });
    res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST", body: fd, headers: fd.getHeaders(),
    });
  } else {
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat, text: matn, disable_web_page_preview: true,
        ...(mavzu ? { message_thread_id: mavzu } : {}),
      }),
    });
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) {
    throw new Error(`Telegram ${res.status}: ${j.description || "javob yo'q"}`);
  }
  return j.result || {};
}

// Qaytaradi: "yozildi" | "kutilmoqda" (vaqt tugadi — Apps Script odatda
// baribir yozib qo'yadi) | "xato ..." (aniq yozilmadi)
async function jadvalga(url, qator, muddatMs) {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const soat = ctrl ? setTimeout(() => ctrl.abort(), muddatMs) : null;
  try {
    const r = await fetch(url, {
      method: "POST",
      // Apps Script qatorni birinchi so'rovda yozadi va 302 qaytaradi;
      // yo'naltirishga ergashilmaydi (keyingi manzil xato sahifa beradi)
      redirect: "manual",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sheet: process.env.HAMKORLIK_TAB || "Hamkorlik takliflari",
        headers: SARLAVHALAR,
        row: qator,
      }),
      signal: ctrl ? ctrl.signal : undefined,
    });
    return (r.ok || [301, 302, 303].includes(r.status)) ? "yozildi" : `xato ${r.status}`;
  } catch (e) {
    return e && e.name === "AbortError" ? "kutilmoqda" : "xato";
  } finally {
    if (soat) clearTimeout(soat);
  }
}

exports.handler = async (event, context) => {
  const boshi = Date.now();
  // Anketa boti va guruhi — zaxira manzil; hamkorlik uchun alohida bot
  // (HAMKORLIK_BOT_TOKEN) bo'lmasa o'sha bot yuboradi
  const zaxiraToken = process.env.TELEGRAM_BOT_TOKEN;
  const zaxiraChat = process.env.TELEGRAM_CHAT_ID;
  const asosiyToken = process.env.HAMKORLIK_BOT_TOKEN || zaxiraToken;
  const asosiy = manzil(process.env.HAMKORLIK_CHAT_ID || HAMKORLIK_MANZIL);
  // Sirni logga chiqarmaslik: node-fetch xatosi matnida URL (token bilan) bo'ladi
  const tozala = (e) => [zaxiraToken, asosiyToken].filter(Boolean).reduce(
    (m, tok) => m.split(tok).join("<token>"), String((e && e.message) || e));

  try {
    if (event.httpMethod !== "POST") return javob(405, { xato: "usul" });

    let d;
    try {
      d = JSON.parse(event.body || "");
    } catch (e) {
      return javob(400, { xato: "sorov" });
    }
    if (!d || typeof d !== "object" || Array.isArray(d)) return javob(400, { xato: "sorov" });

    // Spam-botlar ko'rinmas maydonni ham to'ldiradi: "yuborildi" deymiz,
    // lekin hech qayerga yubormaymiz
    if (qisqa(d.tuzoq, 200)) return javob(200, { ok: true });

    const { xato, taklif: t } = tekshir(d);
    if (xato) return javob(400, { xato });

    const asosiyBor = Boolean(asosiy && asosiyToken);
    const zaxiraBor = Boolean(zaxiraChat && zaxiraToken);
    if (!asosiyBor && !zaxiraBor) {
      console.error("Hamkorlik: Telegram sozlanmagan (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)");
      return javob(500, { xato: "server" });
    }

    /* 1. Telegram — asosiy yozuv (skrinshot faqat shu yerda saqlanadi).
          Hamkorlik guruhiga (mavzusiga) yuboriladi; bo'lmasa — anketalar
          guruhiga. Hech qayerga o'tmasa hech narsa yozilmagan bo'ladi:
          odam qayta yuboradi. */
    let msg, token = asosiyToken, sabab = "";
    if (asosiyBor) {
      try {
        msg = await telegramga(asosiyToken, asosiy.chat, t, asosiy.mavzu);
      } catch (e) {
        sabab = tozala(e);
        if (asosiy.mavzu && MAVZU_YOQ.test(sabab)) {
          // Mavzu o'chirilgan yoki yopilgan — o'sha guruhning umumiy chatiga
          try {
            msg = await telegramga(asosiyToken, asosiy.chat, t, null,
              "⚠️ \"Hamkorlik taklifi\" mavzusi topilmadi — umumiy chatga tushdi.");
          } catch (e2) {
            sabab = tozala(e2);
          }
        }
        if (!msg) console.error("Hamkorlik guruhiga yuborilmadi:", sabab);
      }
    }
    const zaxiraBoshqa = zaxiraBor
      && !(asosiyBor && String(asosiy.chat) === String(zaxiraChat) && !asosiy.mavzu
           && asosiyToken === zaxiraToken);
    if (!msg && zaxiraBoshqa) {
      try {
        token = zaxiraToken;
        msg = await telegramga(zaxiraToken, zaxiraChat, t, null, asosiyBor
          ? `⚠️ Hamkorlik guruhiga yuborib bo'lmadi, shu yerga tushdi.\nSabab: ${sabab.slice(0, 200)}`
          : "");
      } catch (e) {
        console.error("Hamkorlik Telegram xato:", tozala(e));
      }
    }
    if (!msg) return javob(502, { xato: "yuborilmadi" });
    const chat = String((msg.chat || {}).id || "");
    // Xabar mavzuga (subchatga) tushgan bo'lsa — o'sha mavzu
    const mavzu = msg.is_topic_message && msg.message_thread_id ? msg.message_thread_id : null;

    /* 2. Google Sheets. Xato bersa ham taklif yo'qolmaydi — u guruhda bor;
          guruhga "jadvalga yozilmadi" deb aytiladi. */
    let sheets = "ochirilgan";
    if (process.env.SHEETS_WEBHOOK) {
      // Mavzudagi xabar havolasi: /c/<guruh>/<mavzu>/<xabar>
      const havola = chat.startsWith("-100") && msg.message_id
        ? `https://t.me/c/${chat.slice(4)}/${mavzu ? mavzu + "/" : ""}${msg.message_id}` : "";
      const sana = toshkentVaqti(Date.now());
      const qator = [
        sana, "", xavfsiz(t.ism), t.turi, xavfsiz(t.taklif), xavfsiz(t.instagram),
        t.obunachilar, t.rasm ? (havola || "rasm guruhda") : "", xavfsiz(t.telefon),
        t.akkaunt || "sayt",
      ];
      // Netlify funksiyasi 10 soniyada to'xtatiladi — undan oldin javob qaytarish kerak
      const qoldi = context && typeof context.getRemainingTimeInMillis === "function"
        ? context.getRemainingTimeInMillis() : 10000 - (Date.now() - boshi);
      sheets = await jadvalga(process.env.SHEETS_WEBHOOK, qator,
                              Math.max(1000, Math.min(6000, qoldi - 2500)));

      if (sheets.startsWith("xato")) {
        console.error("Hamkorlik Sheets:", sheets);
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chat,
              ...(mavzu ? { message_thread_id: mavzu } : {}),
              reply_to_message_id: msg.message_id,
              allow_sending_without_reply: true,
              text: "⚠️ Bu taklif Google jadvalga yozilmadi — \"Hamkorlik takliflari\" "
                + "varag'iga qo'lda kiritib qo'ying.",
            }),
          });
        } catch (e) {
          console.error("Hamkorlik ogohlantirish xato:", tozala(e));
        }
      }
    }

    return javob(200, { ok: true, sheets });
  } catch (e) {
    console.error("Hamkorlik xato:", tozala(e));
    return javob(500, { xato: "server" });
  }
};

// Sinovlar uchun (tests/hamkorlik.test.js)
exports._ichki = { tekshir, xabarMatni, xavfsiz, rasmTuri, akkauntNomi, heshteg, toshkentVaqti, manzil, SARLAVHALAR };
