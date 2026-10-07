const fetch = require("node-fetch");

/* amoCRM chat webhooki uchun VOSITACHI (2026-10-07).
   amoCRM serverlari Rossiyada; ularning tarmog'idan Railway manzillari
   (Sevinch, Insight) goh ochiladi, goh ochilmaydi — amoCRM javobsiz
   so'rovlarni sanab webhookni o'zi o'chiradi (05.10 dan Sevinch jim edi).
   Netlify manzili esa Rossiyaning barcha tugunlaridan ochiladi.

   Bu funksiya so'rov tanasini o'zgartirmasdan Insight proksisiga uzatadi
   (u Railway ichki tarmog'i orqali Sevinchga beradi). Maxfiy kalit yo'lda
   keladi va shu yerda TEKSHIRILMAYDI — uni Sevinchning o'zi tekshiradi. */
const MANZIL = "https://designerbot-production.up.railway.app/webhook/amocrm/chat/";

exports.handler = async (event) => {
  const ok = { statusCode: 200, headers: { "Content-Type": "application/json" }, body: '{"status":"ok"}' };
  if (event.httpMethod === "GET") return ok;            // amoCRM manzilni GET bilan tekshiradi
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "" };
  const kalit = (event.path || "").split("/").filter(Boolean).pop() || "";
  if (!kalit || kalit === "amocrm-relay") return { statusCode: 404, body: "" };
  const tana = event.isBase64Encoded ? Buffer.from(event.body || "", "base64") : (event.body || "");
  const nazorat = new AbortController();
  const taymer = setTimeout(() => nazorat.abort(), 8000);
  try {
    const r = await fetch(MANZIL + encodeURIComponent(decodeURIComponent(kalit)), {
      method: "POST", body: tana, signal: nazorat.signal,
      headers: { "Content-Type": event.headers["content-type"] || "application/x-www-form-urlencoded" },
    });
    console.log("amocrm-relay ->", r.status, "bayt=" + Buffer.byteLength(tana));
  } catch (e) {
    console.log("amocrm-relay xato:", e.name, e.message);   // amoCRM'ga baribir 200 — aks holda webhookni o'chiradi
  } finally {
    clearTimeout(taymer);
  }
  return ok;
};
