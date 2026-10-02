/* Hamkorlik formasi funksiyasi sinovi — tarmoqsiz (Telegram va Sheets soxta).

     node tests/hamkorlik.test.js
*/
const assert = require("assert");
const path = require("path");

/* ---- soxta node-fetch: funksiya yuklanishidan OLDIN o'rnatiladi ---- */
let chaqiruvlar = [];
let telegramJavob, sheetsJavob;
const soxtaFetch = async (url, opts = {}) => {
  chaqiruvlar.push({ url: String(url), opts });
  if (String(url).includes("api.telegram.org")) return telegramJavob(url, opts);
  return sheetsJavob(url, opts);
};
const fetchYoli = require.resolve("node-fetch");
require.cache[fetchYoli] = { id: fetchYoli, filename: fetchYoli, loaded: true, exports: soxtaFetch };

const { handler, _ichki } = require(path.join("..", "netlify", "functions", "hamkorlik.js"));

const TOKEN = "123456:SINOV-TOKEN-hech-qayerga-chiqmasin";
const ANKETA = "-1003748978031";          // anketalar guruhi (TELEGRAM_CHAT_ID)
const SMM = "-1004370167447";             // "SMM/Marketing Feliza" — koddagi standart manzil
const MAVZU = 2;                          // "hamkorlik taklifi" subchati
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString("base64");

// multipart yoki JSON so'rovdan maydon qiymati
const maydon = (c, nom) => {
  const b = c.opts.body;
  if (typeof b === "string") return JSON.parse(b)[nom];
  const m = b.getBuffer().toString("utf8").match(new RegExp(`name="${nom}"\\r\\n\\r\\n([^\\r]*)`));
  return m ? m[1] : undefined;
};
const usul = (c) => c.url.split("/").pop();
const tgOk = (natija) => ({ ok: true, status: 200, json: async () => ({ ok: true, result: natija }) });
const tgXato = (status, tavsif) => ({ ok: false, status, json: async () => ({ ok: false, description: tavsif }) });
// Standart soxta Telegram: xabar so'ralgan guruh/mavzuga "tushadi"
const aksSado = async (url, opts) => {
  const c = { opts };
  const mavzu = maydon(c, "message_thread_id");
  return tgOk({
    message_id: 777, chat: { id: Number(maydon(c, "chat_id")) },
    ...(mavzu ? { message_thread_id: Number(mavzu), is_topic_message: true } : {}),
  });
};

function muhit(ustiga = {}) {
  for (const k of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "HAMKORLIK_CHAT_ID", "HAMKORLIK_BOT_TOKEN",
    "SHEETS_WEBHOOK", "HAMKORLIK_TAB"]) {
    delete process.env[k];
  }
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: ANKETA,
    SHEETS_WEBHOOK: "https://script.google.com/macros/s/SINOV/exec",
  }, ustiga);
  for (const [k, v] of Object.entries(ustiga)) if (v === null) delete process.env[k];
  chaqiruvlar = [];
  telegramJavob = aksSado;
  sheetsJavob = async () => ({ ok: false, status: 302 });      // Apps Script: 302 = yozildi
}

const yubor = (body, ctx) => handler(
  { httpMethod: "POST", body: typeof body === "string" ? body : JSON.stringify(body) },
  ctx || { getRemainingTimeInMillis: () => 9000 },
);
const tana = (r) => JSON.parse(r.body);
const tg = () => chaqiruvlar.filter((c) => c.url.includes("api.telegram.org"));
const sh = () => chaqiruvlar.filter((c) => c.url.includes("script.google.com"));
const jim = async (fn) => {                 // kutilgan xato loglarini ekranga chiqarmaslik
  const asl = console.error; const yozilgan = [];
  console.error = (...a) => yozilgan.push(a.map(String).join(" "));
  try { await fn(); } finally { console.error = asl; }
  return yozilgan.join("\n");
};

const BLOGER = {
  turi: "bloger", ism: "Dilnoza", instagram: "@dilnoza.style", obunachilar: "10-50",
  telefon: "+998 90 123 45 67", rasm: JPEG, kanal: "nessa.uz", til: "uz", tuzoq: "",
};
const BOSHQA = {
  turi: "yetkazuvchi", ism: "Aziz", taklif: "Mato yetkazib beramiz.\nNamunalar bor.",
  telefon: "901234567", kanal: "feliza_uz", til: "ru", tuzoq: "",
};

let soni = 0;
async function holat(nom, fn) {
  muhit();
  try {
    await fn();
    soni++;
  } catch (e) {
    console.error("  ✗", nom, "\n   ", e.message);
    process.exitCode = 1;
  }
}

(async () => {
  await holat("POST emas — 405", async () => {
    const r = await handler({ httpMethod: "GET" }, {});
    assert.strictEqual(r.statusCode, 405);
    assert.strictEqual(chaqiruvlar.length, 0);
  });

  await holat("buzuq so'rov — 400, hech narsa yuborilmaydi", async () => {
    for (const b of ["", "{", "[]", "null", '"matn"']) {
      const r = await yubor(b);
      assert.strictEqual(r.statusCode, 400, b);
      assert.strictEqual(tana(r).xato, "sorov");
    }
    assert.strictEqual(chaqiruvlar.length, 0);
  });

  await holat("spam tuzog'i to'ldirilgan — 'yuborildi' deydi, hech qayerga yubormaydi", async () => {
    const r = await yubor({ ...BLOGER, tuzoq: "http://spam.example" });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(chaqiruvlar.length, 0);
  });

  await holat("majburiy maydonlar — har biri o'z kodi bilan", async () => {
    const kutilgan = [
      [{ ...BLOGER, turi: "" }, "turi"],
      [{ ...BLOGER, turi: "constructor" }, "turi"],
      [{ ...BLOGER, turi: "__proto__" }, "turi"],
      [{ ...BLOGER, ism: "   " }, "ism"],
      [{ ...BLOGER, instagram: "" }, "instagram"],
      [{ ...BLOGER, obunachilar: "ko'p" }, "obunachilar"],
      [{ ...BLOGER, obunachilar: "toString" }, "obunachilar"],
      [{ ...BLOGER, rasm: "" }, "rasm"],
      [{ ...BLOGER, rasm: Buffer.from("<script>alert(1)</script>").toString("base64") }, "rasm_format"],
      [{ ...BLOGER, rasm: Buffer.from("MZ" + "x".repeat(300)).toString("base64") }, "rasm_format"],
      [{ ...BLOGER, rasm: "A".repeat(8 * 1024 * 1024) }, "rasm_katta"],
      [{ ...BLOGER, telefon: "12345" }, "telefon"],
      [{ ...BOSHQA, taklif: "  " }, "taklif"],
      [{ ...BOSHQA, telefon: "" }, "telefon"],
    ];
    for (const [d, kod] of kutilgan) {
      const r = await yubor(d);
      assert.strictEqual(r.statusCode, 400, kod);
      assert.strictEqual(tana(r).xato, kod);
    }
    assert.strictEqual(chaqiruvlar.length, 0, "xato formada hech narsa yuborilmasligi kerak");
  });

  await holat("bloger — SMM guruhidagi hamkorlik subchatiga; anketalar guruhiga HECH NARSA", async () => {
    const r = await yubor(BLOGER);
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(tana(r), { ok: true, sheets: "yozildi" });

    assert.strictEqual(tg().length, 1);
    assert.strictEqual(usul(tg()[0]), "sendPhoto");
    assert.strictEqual(maydon(tg()[0], "chat_id"), SMM);
    assert.strictEqual(maydon(tg()[0], "message_thread_id"), String(MAVZU));
    const qism = tg()[0].opts.body.getBuffer();
    const matn = qism.toString("utf8");
    for (const s of ["🤝 Hamkorlik taklifi (sayt orqali)", "Akkaunt: #nessa_uz\n", "Turi: 📸 Bloger / reklama",
      "Ism: Dilnoza", "Instagram: @dilnoza.style", "Obunachilar: 10–50 ming", "Telefon: +998 90 123 45 67"]) {
      assert.ok(matn.includes(s), "xabarda yo'q: " + s);
    }
    assert.ok(!matn.includes("Til: ruscha"));
    assert.ok(!matn.includes(ANKETA), "anketalar guruhiga yuborilmasligi kerak");
    assert.ok(qism.includes(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "rasm baytlari yo'q");
    assert.ok(matn.includes('filename="statistika.jpg"'));

    assert.strictEqual(sh().length, 1);
    assert.strictEqual(sh()[0].opts.redirect, "manual");
    const j = JSON.parse(sh()[0].opts.body);
    assert.strictEqual(j.sheet, "Hamkorlik takliflari");
    assert.deepStrictEqual(j.headers, ["Sana-vaqt", "Username", "Ism", "Turi", "Taklif", "Instagram",
      "Obunachilar", "Statistika", "Telefon", "Manba"]);
    assert.strictEqual(j.row.length, 10);
    // sana botdagi yozuvlar bilan bir xil ko'rinishda
    assert.ok(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/.test(j.row[0]), j.row[0]);
    assert.deepStrictEqual(j.row.slice(1), ["", "Dilnoza", "📸 Bloger / reklama", "", "'@dilnoza.style",
      "10–50 ming", "https://t.me/c/4370167447/2/777", "'+998 90 123 45 67", "nessa.uz"]);
  });

  await holat("yetkazib beruvchi — matnli xabar subchatga, rasm ustuni bo'sh, ruscha belgisi", async () => {
    const r = await yubor(BOSHQA);
    assert.deepStrictEqual(tana(r), { ok: true, sheets: "yozildi" });
    assert.strictEqual(tg().length, 1);
    assert.strictEqual(usul(tg()[0]), "sendMessage");
    const x = JSON.parse(tg()[0].opts.body);
    assert.strictEqual(x.chat_id, SMM);
    assert.strictEqual(x.message_thread_id, MAVZU);
    assert.strictEqual(x.parse_mode, undefined, "matn oddiy bo'lishi kerak (HTML/Markdown emas)");
    assert.ok(x.text.includes("Akkaunt: #feliza_uz\n"));
    assert.ok(x.text.includes("Turi: 📦 Yetkazib beruvchi (tovar)"));
    assert.ok(x.text.includes("Taklif: Mato yetkazib beramiz.\nNamunalar bor."));
    assert.ok(x.text.includes("Til: ruscha"));
    const row = JSON.parse(sh()[0].opts.body).row;
    assert.deepStrictEqual(row.slice(1), ["", "Aziz", "📦 Yetkazib beruvchi (tovar)",
      "Mato yetkazib beramiz.\nNamunalar bor.", "", "", "", "901234567", "feliza_uz"]);
  });

  await holat("akkaunt nomi — heshteg bo'lib chiqadi, begona matn o'tmaydi", async () => {
    const { akkauntNomi, heshteg, toshkentVaqti } = _ichki;
    assert.strictEqual(heshteg(akkauntNomi("nessa.uz")), "#nessa_uz");
    assert.strictEqual(heshteg(akkauntNomi(" Feliza_UZ ")), "#feliza_uz");
    assert.strictEqual(heshteg(akkauntNomi("telegram_nessa")), "#telegram_nessa");
    for (const yomon of ["<b>zara</b>", "nessa uz", "#nessa", "a\nTelefon: 000", "x".repeat(41), "", null, 7, {}]) {
      assert.strictEqual(akkauntNomi(yomon), "", String(yomon));
    }
    assert.strictEqual(toshkentVaqti(Date.UTC(2026, 9, 2, 18, 18, 44)), "02.10.2026 23:18:44");
    assert.strictEqual(toshkentVaqti(Date.UTC(2026, 11, 31, 19, 0, 5)), "01.01.2027 00:00:05");

    // havolasiz ochilgan yoki buzilgan akkaunt nomi — "ko'rsatilmagan" / "sayt"
    await yubor({ ...BOSHQA, kanal: "<b>zara</b>", til: "en" });
    const text = JSON.parse(tg()[0].opts.body).text;
    assert.ok(text.includes("Akkaunt: ko'rsatilmagan\n"), text);
    assert.ok(!text.includes("zara") && !text.includes("Til: ruscha"));
    assert.strictEqual(JSON.parse(sh()[0].opts.body).row[9], "sayt");
  });

  await holat("formula va soxta satr — zararsizlantiriladi", async () => {
    await yubor({ ...BOSHQA, ism: "=HYPERLINK(\"http://x\")\nTelefon: 000", taklif: "-1+1", telefon: "+998901234567" });
    const row = JSON.parse(sh()[0].opts.body).row;
    assert.strictEqual(row[2], "'=HYPERLINK(\"http://x\") Telefon: 000");
    assert.strictEqual(row[4], "'-1+1");
    assert.strictEqual(row[8], "'+998901234567");
    const text = JSON.parse(tg()[0].opts.body).text;
    assert.ok(text.includes("Ism: =HYPERLINK(\"http://x\") Telefon: 000\n"), "ism bir qatorda qolishi kerak");
  });

  await holat("uzun va emoji bilan tugagan matn — butun belgilar bilan kesiladi", async () => {
    await yubor({ ...BOSHQA, taklif: "a".repeat(2999) + "🤍🤍🤍", ism: "И".repeat(200) });
    const row = JSON.parse(sh()[0].opts.body).row;
    assert.strictEqual(Array.from(row[4]).length, 3000);
    assert.ok(row[4].endsWith("🤍"));
    assert.strictEqual(row[4], row[4].toWellFormed());
    assert.strictEqual(Array.from(row[2]).length, 80);
  });

  /* ---- nosozliklar ---- */

  await holat("vaqtinchalik nosozlik (Telegram 5xx) — 502, hech narsa yozilmaydi: odam qayta yuboradi", async () => {
    await jim(async () => {
      telegramJavob = async () => tgXato(502, "Bad Gateway");
      const r = await yubor(BLOGER);
      assert.strictEqual(r.statusCode, 502);
      assert.strictEqual(tana(r).xato, "yuborilmadi");
    });
    assert.strictEqual(tg().length, 1, "anketalar guruhiga hech narsa ketmasligi kerak");
    assert.strictEqual(sh().length, 0);
  });

  await holat("tarmoq xatosi — 502, token logga chiqmaydi", async () => {
    const log = await jim(async () => {
      telegramJavob = async (url) => { throw new Error(`request to ${url} failed, reason: ECONNRESET`); };
      const r = await yubor(BLOGER);
      assert.strictEqual(r.statusCode, 502);
    });
    assert.ok(log.length > 0);
    assert.ok(!log.includes(TOKEN) && !log.includes("SINOV-TOKEN"), "token logda ko'rinmasligi kerak");
    assert.strictEqual(sh().length, 0);
  });

  await holat("bot SMM guruhida yo'q — taklif jadvalga yoziladi, anketalar guruhiga FAQAT ogohlantirish", async () => {
    await jim(async () => {
      telegramJavob = async (url, opts) => (maydon({ opts }, "chat_id") === SMM
        ? tgXato(403, "Forbidden: bot is not a member of the supergroup chat") : aksSado(url, opts));
      const r = await yubor(BLOGER);
      assert.strictEqual(r.statusCode, 200);
      assert.deepStrictEqual(tana(r), { ok: true, sheets: "yozildi", guruh: "yuborilmadi" });
    });
    // jadval: hamma maydon bor, rasm o'rnida izoh
    const row = JSON.parse(sh()[0].opts.body).row;
    assert.deepStrictEqual(row.slice(1), ["", "Dilnoza", "📸 Bloger / reklama", "", "'@dilnoza.style",
      "10–50 ming", "rasm guruhga yuborilmadi", "'+998 90 123 45 67", "nessa.uz"]);
    // anketalar guruhiga — faqat ogohlantirish, taklif mazmunisiz
    assert.strictEqual(tg().length, 2);
    assert.strictEqual(usul(tg()[1]), "sendMessage");
    const ogoh = JSON.parse(tg()[1].opts.body);
    assert.strictEqual(ogoh.chat_id, ANKETA);
    assert.ok(ogoh.text.includes("yubora olmayapti") && ogoh.text.includes("bot is not a member"));
    assert.ok(ogoh.text.includes("skrinshoti saqlanmadi"));
    for (const sir of ["Dilnoza", "dilnoza.style", "998", "10–50", "nessa"]) {
      assert.ok(!ogoh.text.includes(sir), "ogohlantirishda taklif mazmuni bo'lmasligi kerak: " + sir);
    }
  });

  await holat("bot SMM guruhida yo'q va jadval ham ishlamadi — 502, odamga xato ko'rsatiladi", async () => {
    await jim(async () => {
      telegramJavob = async (url, opts) => (maydon({ opts }, "chat_id") === SMM
        ? tgXato(403, "Forbidden: bot was kicked from the supergroup chat") : aksSado(url, opts));
      sheetsJavob = async () => ({ ok: false, status: 500 });
      const r = await yubor(BOSHQA);
      assert.strictEqual(r.statusCode, 502);
      assert.strictEqual(tana(r).xato, "yuborilmadi");
    });
    const ogoh = JSON.parse(tg()[1].opts.body);
    assert.strictEqual(ogoh.chat_id, ANKETA);
    assert.ok(ogoh.text.includes("jadvalga ham yozilmadi"));
  });

  await holat("subchat o'chirilgan — o'sha guruhning umumiy chatiga, izoh bilan", async () => {
    await jim(async () => {
      telegramJavob = async (url, opts) => (maydon({ opts }, "message_thread_id")
        ? tgXato(400, "Bad Request: message thread not found") : aksSado(url, opts));
      const r = await yubor(BLOGER);
      assert.strictEqual(r.statusCode, 200);
      assert.deepStrictEqual(tana(r), { ok: true, sheets: "yozildi" });
    });
    assert.strictEqual(tg().length, 2);
    assert.strictEqual(maydon(tg()[1], "chat_id"), SMM);
    assert.strictEqual(maydon(tg()[1], "message_thread_id"), undefined);
    assert.ok(tg()[1].opts.body.getBuffer().toString("utf8").includes("mavzusi topilmadi"));
    assert.strictEqual(JSON.parse(sh()[0].opts.body).row[7], "https://t.me/c/4370167447/777");
  });

  await holat("jadval xato berdi — taklif qabul qilinadi, o'sha subchatga ogohlantirish ketadi", async () => {
    sheetsJavob = async () => ({ ok: false, status: 500 });
    await jim(async () => {
      const r = await yubor(BLOGER);
      assert.strictEqual(r.statusCode, 200);
      assert.strictEqual(tana(r).sheets, "xato 500");
    });
    assert.strictEqual(tg().length, 2);
    const ogoh = JSON.parse(tg()[1].opts.body);
    assert.strictEqual(ogoh.chat_id, SMM);
    assert.strictEqual(ogoh.message_thread_id, MAVZU);
    assert.strictEqual(ogoh.reply_to_message_id, 777);
    assert.ok(ogoh.text.includes("jadvalga yozilmadi"));
  });

  await holat("jadval javob bermay qoldi — vaqt tugashidan oldin 'kutilmoqda' bilan qaytadi", async () => {
    sheetsJavob = (url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener("abort", () => {
        const e = new Error("aborted"); e.name = "AbortError"; reject(e);
      });
    });
    const t = Date.now();
    const r = await yubor(BLOGER, { getRemainingTimeInMillis: () => 4000 });
    const otdi = Date.now() - t;
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(tana(r).sheets, "kutilmoqda");
    assert.ok(otdi >= 1000 && otdi < 3000, "kutish vaqti: " + otdi);
    assert.strictEqual(tg().length, 1, "vaqt tugaganda ogohlantirish yuborilmaydi");
  });

  /* ---- sozlamalar ---- */

  await holat("manzil yozuvi: guruh yoki guruh:mavzu", async () => {
    const { manzil } = _ichki;
    assert.deepStrictEqual(manzil("-1002223334445:77"), { chat: "-1002223334445", mavzu: 77 });
    assert.deepStrictEqual(manzil(" -1002223334445 "), { chat: "-1002223334445", mavzu: null });
    assert.deepStrictEqual(manzil("-100222:abc"), { chat: "-100222", mavzu: null });
    for (const v of ["", null, undefined, "guruh", ":77", "@kanal"]) assert.strictEqual(manzil(v), null, String(v));
  });

  await holat("Netlify'dagi HAMKORLIK_CHAT_ID va HAMKORLIK_TAB koddagi standartdan ustun", async () => {
    muhit({ HAMKORLIK_CHAT_ID: "-1009999:45", HAMKORLIK_TAB: "Sinov varag'i" });
    await yubor(BOSHQA);
    const x = JSON.parse(tg()[0].opts.body);
    assert.strictEqual(x.chat_id, "-1009999");
    assert.strictEqual(x.message_thread_id, 45);
    assert.strictEqual(JSON.parse(sh()[0].opts.body).sheet, "Sinov varag'i");

    muhit({ HAMKORLIK_CHAT_ID: "-1009999" });
    await yubor(BOSHQA);
    assert.strictEqual(JSON.parse(tg()[0].opts.body).message_thread_id, undefined);
  });

  await holat("alohida bot (HAMKORLIK_BOT_TOKEN) — taklifni u yuboradi; tokenlar log va xabarda yo'q", async () => {
    const IKKINCHI = "777:IKKINCHI-BOT-TOKENI";
    muhit({ HAMKORLIK_BOT_TOKEN: IKKINCHI });
    await yubor(BOSHQA);
    assert.ok(tg()[0].url.includes(IKKINCHI) && !tg()[0].url.includes(TOKEN));

    muhit({ HAMKORLIK_BOT_TOKEN: IKKINCHI });
    const log = await jim(async () => {
      telegramJavob = async (url, opts) => (String(url).includes(IKKINCHI)
        ? tgXato(403, "Forbidden: bot is not a member of the supergroup chat") : aksSado(url, opts));
      const r = await yubor(BOSHQA);
      assert.strictEqual(r.statusCode, 200);
    });
    assert.ok(tg()[1].url.includes(TOKEN), "ogohlantirishni anketa boti yuboradi");
    assert.ok(!log.includes(IKKINCHI) && !log.includes(TOKEN), "token logda");
    assert.ok(!JSON.parse(tg()[1].opts.body).text.includes("IKKINCHI"), "token guruh xabarida");
  });

  await holat("jadval ulanmagan — faqat guruhga", async () => {
    muhit({ SHEETS_WEBHOOK: null });
    const r = await yubor(BOSHQA);
    assert.deepStrictEqual(tana(r), { ok: true, sheets: "ochirilgan" });
    assert.strictEqual(sh().length, 0);
    assert.strictEqual(tg().length, 1);
  });

  await holat("Telegram sozlanmagan — 500, yolg'on 'yuborildi' demaydi", async () => {
    await jim(async () => {
      muhit({ TELEGRAM_BOT_TOKEN: null });
      const r = await yubor(BOSHQA);
      assert.strictEqual(r.statusCode, 500);
      assert.strictEqual(tana(r).xato, "server");
      assert.strictEqual(chaqiruvlar.length, 0);
    });
  });

  await holat("PNG va WebP ham qabul qilinadi", async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(50)]);
    assert.strictEqual(_ichki.rasmTuri(png).mime, "image/png");
    assert.strictEqual(_ichki.rasmTuri(webp).mime, "image/webp");
    assert.strictEqual(_ichki.rasmTuri(Buffer.from("GIF89a")), null);
    const r = await yubor({ ...BLOGER, rasm: png.toString("base64") });
    assert.strictEqual(r.statusCode, 200);
    assert.ok(tg()[0].opts.body.getBuffer().toString("latin1").includes('filename="statistika.png"'));
  });

  await holat("holat tekshiruvi (GET ?holat=1) — bot va guruhdagi o'rni; hech narsa yuborilmaydi", async () => {
    telegramJavob = async (url) => (String(url).endsWith("/getMe")
      ? tgOk({ id: 42, username: "anketa_bot" }) : tgOk({ status: "member" }));
    const r = await handler({ httpMethod: "GET", queryStringParameters: { holat: "1" } }, {});
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(tana(r), { bot: "@anketa_bot", manzil: `${SMM}:${MAVZU}`, guruhda: "member" });
    assert.deepStrictEqual(tg().map(usul), ["getMe", "getChatMember"]);
    assert.strictEqual(JSON.parse(tg()[1].opts.body).chat_id, SMM);
    assert.ok(!r.body.includes(TOKEN));

    muhit();
    telegramJavob = async (url) => (String(url).endsWith("/getMe")
      ? tgOk({ id: 42, username: "anketa_bot" }) : tgXato(400, "Bad Request: chat not found"));
    const r2 = await handler({ httpMethod: "GET", queryStringParameters: { holat: "1" } }, {});
    assert.strictEqual(tana(r2).guruhda, "Bad Request: chat not found");
  });

  if (process.exitCode) {
    console.error("HAMKORLIK FORMASI SINOVI YIQILDI");
  } else {
    console.log(`Hamkorlik formasi funksiyasi to'g'ri ✓  (${soni} holat)`);
  }
})();
