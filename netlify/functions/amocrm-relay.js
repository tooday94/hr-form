const fetch = require("node-fetch");

/* amoCRM chat webhooki uchun VOSITACHI (2026-10-07).
   amoCRM serverlari Rossiyada; ularning tarmog'idan Railway manzillari
   (Sevinch, Insight) goh ochiladi, goh ochilmaydi — amoCRM javobsiz
   so'rovlarni sanab webhookni o'zi o'chiradi (05.10 dan Sevinch jim edi).
   Netlify manzili esa Rossiyaning barcha tugunlaridan ochiladi.

   Bu funksiya so'rov tanasini o'zgartirmasdan Insight proksisiga uzatadi
   (u Railway ichki tarmog'i orqali Sevinchga beradi). Maxfiy kalit yo'lda
   keladi va shu yerda TEKSHIRILMAYDI — uni Sevinchning o'zi tekshiradi. */
// Asosiy yo'l — Insight proksisi; u qayta ishga tushayotgan bo'lsa (har push'da
// ~30–60 s) — Sevinchning o'ziga to'g'ridan-to'g'ri (Netlify'dan Railway ochiladi).
const MANZILLAR = [
  "https://designerbot-production.up.railway.app/webhook/amocrm/chat/",
  "https://web-production-948bc.up.railway.app/webhook/amocrm/chat/",
];

async function uzat(manzil, tana, tur) {
  const nazorat = new AbortController();
  const taymer = setTimeout(() => nazorat.abort(), 4000);
  try {
    const r = await fetch(manzil, { method: "POST", body: tana, signal: nazorat.signal,
                                    headers: { "Content-Type": tur } });
    return r.status;
  } finally {
    clearTimeout(taymer);
  }
}

exports.handler = async (event) => {
  const ok = { statusCode: 200, headers: { "Content-Type": "application/json" }, body: '{"status":"ok"}' };
  if (event.httpMethod === "GET") return ok;            // amoCRM manzilni GET bilan tekshiradi
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };
  const kalit = (event.path || "").split("/").filter(Boolean).pop() || "";
  if (!kalit || kalit === "amocrm-relay") return { statusCode: 404, body: "" };
  const tana = event.isBase64Encoded ? Buffer.from(event.body || "", "base64") : (event.body || "");
  const tur = event.headers["content-type"] || "application/x-www-form-urlencoded";
  const yol = encodeURIComponent(decodeURIComponent(kalit));
  for (const manzil of MANZILLAR) {
    try {
      const holat = await uzat(manzil + yol, tana, tur);
      console.log("amocrm-relay ->", new URL(manzil).host, holat, "bayt=" + Buffer.byteLength(tana));
      if (holat < 500) break;                 // 2xx/4xx — yetib bordi (401 = noto'g'ri kalit)
    } catch (e) {
      console.log("amocrm-relay xato:", new URL(manzil).host, e.name, e.message);
    }
  }
  return ok;                                  // amoCRM'ga doim 200 — aks holda webhookni o'chiradi
};
