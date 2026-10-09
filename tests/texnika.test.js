/* Texnika formasi funksiyasi sinovi — tarmoqsiz (Sheets va Bitrix soxta).
   Sinov o'z kaliti va o'z ro'yxati bilan ishlaydi — haqiqiy kalit kerak emas.

     node tests/texnika.test.js
*/
const assert = require("assert");
const crypto = require("crypto");
const path = require("path");

/* ---- soxta node-fetch: funksiya yuklanishidan OLDIN o'rnatiladi ---- */
let chaqiruvlar = [];
let sheetsJavob, bitrixJavob;
const soxtaFetch = async (url, opts = {}) => {
  chaqiruvlar.push({ url: String(url), opts, tana: JSON.parse(opts.body || "{}") });
  if (String(url).includes("/rest/")) return bitrixJavob(url, opts);
  return sheetsJavob(url, opts);
};
const fetchYoli = require.resolve("node-fetch");
require.cache[fetchYoli] = { id: fetchYoli, filename: fetchYoli, loaded: true, exports: soxtaFetch };

const FUNK = path.join(__dirname, "..", "netlify", "functions");
const { handler, _ichki } = require(path.join(FUNK, "texnika.js"));

const KALIT = crypto.randomBytes(32);
const KOD = _ichki.havolaKodi(KALIT);
const ROYXAT = {
  bolimlar: [
    { kalit: "dokon", nom: "Do'kon", turlar: ["Antikraja", "Konditsioner", "Chek printeri", "Skaner"], joylar: [
      { nom: "Chilonzor", xodimlar: [
        { tabel: "901", ism: "Toshmatov Sardor Akmal o'g'li", lavozim: "Filial rahbari" },
        { tabel: "902", ism: "Aliyeva Malika Rustam qizi", lavozim: "Kassir" },
      ] },
      { nom: "Andijon", xodimlar: [] },
    ] },
    { kalit: "ofis", nom: "Ofis", turlar: ["Noutbuk / kompyuter", "Monitor"],
      xodimlar: [{ ism: "Karimova Dilnoza", lavozim: "Buxgalter" }] },
    { kalit: "ombor", nom: "Ombor", xodimlar: [] },
  ],
};
// Shifrlangan ro'yxat moduli — haqiqiy fayl o'rniga
const royxatYoli = path.join(FUNK, "texnika_royxat.js");
require.cache[royxatYoli] = {
  id: royxatYoli, filename: royxatYoli, loaded: true,
  exports: { SHIFR: _ichki.shifrla(KALIT, ROYXAT) },
};

const WEBHOOK = "https://feliza.bitrix24.kz/rest/79/MAXFIYkod1234567/";
const SHEETS = "https://script.google.com/macros/s/SINOV/exec";

function muhit(ustiga = {}) {
  for (const k of ["TEXNIKA_KALIT", "SHEETS_WEBHOOK", "BITRIX_WEBHOOK", "BITRIX_TEXNIKA_DIALOG"]) delete process.env[k];
  Object.assign(process.env, {
    TEXNIKA_KALIT: KALIT.toString("base64"), SHEETS_WEBHOOK: SHEETS, BITRIX_WEBHOOK: WEBHOOK,
  }, ustiga);
  for (const [k, v] of Object.entries(ustiga)) if (v === null) delete process.env[k];
  chaqiruvlar = [];
  sheetsJavob = async () => ({ ok: false, status: 302 });      // Apps Script: 302 = yozildi
  bitrixJavob = async () => ({ ok: true, status: 200, json: async () => ({ result: 1 }) });
}

const get = (q) => handler({ httpMethod: "GET", queryStringParameters: q }, null);
const post = (d) => handler({ httpMethod: "POST", body: JSON.stringify(d) }, { getRemainingTimeInMillis: () => 9800 });
const tana = (r) => JSON.parse(r.body);
const sheets = () => chaqiruvlar.filter((c) => c.url === SHEETS);
const bitrix = () => chaqiruvlar.filter((c) => c.url.includes("/rest/"));

const ASOS = {
  kod: KOD, bolim: "dokon", joy: "Chilonzor", xodim: "Aliyeva Malika Rustam qizi",
  texnika: [
    { turi: "Konditsioner", soni: 3, model: "Artel", seriya: "A1, A2, A3", holat: "yaxshi" },
    { turi: "Chek printeri", model: "Xprinter", seriya: "", holat: "tamir" },
  ],
  ehtiyoj: [{ turi: "Skaner", soni: 1, sabab: "kassada sekin", shoshilinch: true }],
};

let otdi = 0;
async function sinov(nom, fn) {
  try {
    await fn();
    otdi++;
  } catch (e) {
    console.error(`✗ ${nom}\n   ${e.stack.split("\n").slice(0, 3).join("\n   ")}`);
    process.exitCode = 1;
  }
}

(async () => {
  await sinov("shifr: ochiladi, boshqa kalit bilan ochilmaydi", () => {
    const s = _ichki.shifrla(KALIT, ROYXAT);
    assert.deepStrictEqual(_ichki.ochish(KALIT, s), ROYXAT);
    assert.throws(() => _ichki.ochish(crypto.randomBytes(32), s));
    assert.ok(!s.includes("Aliyeva"));
  });

  await sinov("kod: to'g'ri/noto'g'ri", () => {
    assert.ok(_ichki.kodTogri(KALIT, KOD));
    assert.ok(!_ichki.kodTogri(KALIT, KOD.slice(0, -1) + (KOD.endsWith("A") ? "B" : "A")));
    assert.ok(!_ichki.kodTogri(KALIT, ""));
    assert.ok(!_ichki.kodTogri(KALIT, undefined));
  });

  await sinov("GET kodsiz — 403, ro'yxat berilmaydi", async () => {
    muhit();
    const r = await get({});
    assert.strictEqual(r.statusCode, 403);
    assert.ok(!r.body.includes("Aliyeva"));
    assert.strictEqual((await get({ kod: "notogri" })).statusCode, 403);
  });

  await sinov("GET to'g'ri kod — bo'limlar, joylar, xodimlar, har bo'lim o'z turlari", async () => {
    muhit();
    const r = await get({ kod: KOD });
    assert.strictEqual(r.statusCode, 200);
    const b = tana(r);
    assert.strictEqual(b.bolimlar.length, 3);
    assert.strictEqual(b.bolimlar[0].joylar[0].xodimlar[1].lavozim, "Kassir");
    assert.ok(!("tabel" in b.bolimlar[0].joylar[0].xodimlar[1]), "tabel sahifaga berilmaydi");
    assert.strictEqual(b.bolimlar[1].xodimlar[0].ism, "Karimova Dilnoza");
    assert.deepStrictEqual(b.bolimlar[0].turlar, ["Antikraja", "Konditsioner", "Chek printeri", "Skaner", "Boshqa"]);
    assert.deepStrictEqual(b.bolimlar[1].turlar, ["Noutbuk / kompyuter", "Monitor", "Boshqa"]);
    assert.deepStrictEqual(b.bolimlar[2].turlar, [..._ichki.ZAXIRA_TURLAR, "Boshqa"]);
  });

  await sinov("turlar: takror va «Boshqa» bitta, oxirida", () => {
    assert.deepStrictEqual(_ichki.turlarOl({ turlar: ["Boshqa", "A", "A", ""] }), ["A", "Boshqa"]);
  });

  await sinov("GET kalit sozlanmagan — 503", async () => {
    muhit({ TEXNIKA_KALIT: null });
    assert.strictEqual((await get({ kod: KOD })).statusCode, 503);
    assert.strictEqual((await post(ASOS)).statusCode, 503);
  });

  await sinov("holat: sirsiz", async () => {
    muhit();
    const r = await get({ holat: "1" });
    assert.deepStrictEqual(tana(r), { kalit: true, xodimlar: 3, jadval: true, bitrix: true });
    assert.ok(!r.body.includes("MAXFIY") && !r.body.includes("Aliyeva"));
  });

  await sinov("POST: har texnika alohida qator, ehtiyoj alohida varaqda, Bitrix'ga xulosa", async () => {
    muhit();
    const r = await post(ASOS);
    assert.strictEqual(r.statusCode, 200, r.body);
    assert.deepStrictEqual(tana(r), { ok: true, jadval: "yozildi", bitrix: true });
    const s = sheets();
    const royxat = s.filter((c) => c.tana.sheet === "Texnika ro'yxati");
    const ehtiyoj = s.filter((c) => c.tana.sheet === "Texnika ehtiyoji");
    assert.strictEqual(royxat.length, 2);
    assert.strictEqual(ehtiyoj.length, 1);
    assert.deepStrictEqual(royxat[0].tana.headers, _ichki.ROYXAT_SARLAVHA);
    const q = royxat.map((c) => c.tana.row);
    assert.deepStrictEqual(q[0].slice(1), ["Do'kon", "Chilonzor", "902", "Aliyeva Malika Rustam qizi", "Kassir",
      "Konditsioner", 3, "Artel", "A1, A2, A3", "Ishlaydi", ""]);
    assert.strictEqual(q[1][7], 1, "soni berilmasa — 1");
    assert.strictEqual(q[1][10], "Ta'mir kerak");
    assert.strictEqual(q[0].length, _ichki.ROYXAT_SARLAVHA.length);
    assert.match(q[0][0], /^\d\d\.\d\d\.\d{4} \d\d:\d\d:\d\d$/);
    assert.deepStrictEqual(ehtiyoj[0].tana.row.slice(3), ["902", "Aliyeva Malika Rustam qizi", "Kassir", "Skaner", 1, "kassada sekin", "Ha"]);
    assert.strictEqual(ehtiyoj[0].tana.row.length, _ichki.EHTIYOJ_SARLAVHA.length);
    const b = bitrix();
    assert.strictEqual(b.length, 1);
    assert.ok(b[0].url.endsWith("/im.message.add.json"));
    assert.strictEqual(b[0].tana.DIALOG_ID, "53");
    const m = b[0].tana.MESSAGE;
    for (const t of ["Chilonzor", "Aliyeva Malika Rustam qizi", "Kassir", "Konditsioner × 3 — Artel, № A1, A2, A3",
      "(4 dona)", "⚠️ Ta'mir kerak", "Skaner × 1", "shoshilinch"]) {
      assert.ok(m.includes(t), `Bitrix xabarida yo'q: ${t}\n${m}`);
    }
  });

  await sinov("POST: Bitrix dialog sozlamadan", async () => {
    muhit({ BITRIX_TEXNIKA_DIALOG: "chat123" });
    await post(ASOS);
    assert.strictEqual(bitrix()[0].tana.DIALOG_ID, "chat123");
  });

  await sinov("POST: ro'yxatda yo'q xodim — ismini o'zi yozadi", async () => {
    muhit();
    const r = await post({ ...ASOS, joy: "Andijon", xodim: _ichki.YOQ, ism: "Yangi Xodim", lavozim: "Sotuvchi" });
    assert.strictEqual(r.statusCode, 200, r.body);
    assert.deepStrictEqual(sheets()[0].tana.row.slice(3, 6), ["", "Yangi Xodim", "Sotuvchi"]);
    assert.ok(bitrix()[0].tana.MESSAGE.includes("ro'yxatda yo'q edi"));
    assert.strictEqual(tana(await post({ ...ASOS, xodim: _ichki.YOQ, ism: "", lavozim: "x" })).xato, "ism");
    assert.strictEqual(tana(await post({ ...ASOS, xodim: _ichki.YOQ, ism: "A", lavozim: "" })).xato, "lavozim");
  });

  await sinov("POST: texnika yo'q — bitta belgi qatori", async () => {
    muhit();
    const r = await post({ ...ASOS, bolim: "ofis", joy: "", xodim: "Karimova Dilnoza", texnika_yoq: true, texnika: [], ehtiyoj: [] });
    assert.strictEqual(r.statusCode, 200, r.body);
    const s = sheets();
    assert.strictEqual(s.length, 1);
    assert.deepStrictEqual(s[0].tana.row.slice(1, 7), ["Ofis", "—", "", "Karimova Dilnoza", "Buxgalter", "— texnika yo'q —"]);
    assert.strictEqual(s[0].tana.row.length, _ichki.ROYXAT_SARLAVHA.length);
    assert.ok(bitrix()[0].tana.MESSAGE.includes("Korxona texnikasi: yo'q"));
  });

  await sinov("POST: tekshiruv xatolari (kod va qator raqami bilan)", async () => {
    muhit();
    const x = async (d) => tana(await post({ ...ASOS, ...d }));
    assert.strictEqual((await x({ bolim: "yoq" })).xato, "bolim");
    assert.strictEqual((await x({ joy: "Toshkent" })).xato, "joy");
    assert.strictEqual((await x({ xodim: "Begona Odam" })).xato, "xodim");
    assert.strictEqual((await x({ texnika: [] })).xato, "texnika");
    assert.deepStrictEqual(await x({ texnika: [ASOS.texnika[0], { turi: "Boshqa", holat: "yaxshi" }] }),
      { xato: "texnika_boshqa", qator: 1 });
    assert.deepStrictEqual(await x({ texnika: [{ turi: "Muzlatgich", holat: "yaxshi" }] }), { xato: "texnika_turi", qator: 0 });
    // boshqa bo'limning turi — o'tmaydi
    assert.deepStrictEqual(await x({ texnika: [{ turi: "Monitor", holat: "yaxshi" }] }), { xato: "texnika_turi", qator: 0 });
    assert.deepStrictEqual(await x({ texnika: [{ turi: "Skaner", holat: "zor" }] }), { xato: "texnika_holat", qator: 0 });
    assert.deepStrictEqual(await x({ texnika: [{ turi: "Skaner", soni: 0, holat: "yaxshi" }] }), { xato: "texnika_soni", qator: 0 });
    assert.deepStrictEqual(await x({ texnika: [{ turi: "Skaner", soni: 51, holat: "yaxshi" }] }), { xato: "texnika_soni", qator: 0 });
    assert.deepStrictEqual(await x({ texnika: [{ turi: "Skaner", soni: 1.5, holat: "yaxshi" }] }), { xato: "texnika_soni", qator: 0 });
    assert.strictEqual((await x({ texnika: Array(16).fill(ASOS.texnika[0]) })).xato, "texnika_kop");
    assert.deepStrictEqual(await x({ ehtiyoj: [{ turi: "Monitor", soni: 1, sabab: "a" }] }), { xato: "ehtiyoj_turi", qator: 0 });
    assert.deepStrictEqual(await x({ ehtiyoj: [{ turi: "Skaner", soni: 0, sabab: "a" }] }), { xato: "ehtiyoj_soni", qator: 0 });
    assert.deepStrictEqual(await x({ ehtiyoj: [{ turi: "Skaner", soni: 2.5, sabab: "a" }] }), { xato: "ehtiyoj_soni", qator: 0 });
    assert.deepStrictEqual(await x({ ehtiyoj: [{ turi: "Skaner", soni: 1, sabab: " " }] }), { xato: "ehtiyoj_sabab", qator: 0 });
    assert.strictEqual(chaqiruvlar.length, 0, "xato so'rov hech qayerga yuborilmasin");
  });

  await sinov("POST: noto'g'ri kod — 403, hech narsa yuborilmaydi", async () => {
    muhit();
    assert.strictEqual((await post({ ...ASOS, kod: "boshqa" })).statusCode, 403);
    assert.strictEqual(chaqiruvlar.length, 0);
  });

  await sinov("POST: spam-tuzoq — ok, yuborilmaydi", async () => {
    muhit();
    assert.strictEqual((await post({ ...ASOS, tuzoq: "bot" })).statusCode, 200);
    assert.strictEqual(chaqiruvlar.length, 0);
  });

  await sinov("POST: formula va BB-kod in'ektsiyasi", async () => {
    muhit();
    await post({ ...ASOS, texnika: [{ turi: "Skaner", model: "=HYPERLINK(\"x\")", seriya: "+998", holat: "yaxshi", izoh: "[url=http://x]y[/url]" }] });
    const row = sheets()[0].tana.row;
    assert.strictEqual(row[8], "'=HYPERLINK(\"x\")");
    assert.strictEqual(row[9], "'+998");
    const m = bitrix()[0].tana.MESSAGE;
    assert.ok(!m.includes("[url") && m.includes("(url=http://x)"));
  });

  await sinov("Jadval xato — Bitrix'da to'liq ro'yxat + ogohlantirish, foydalanuvchiga ok", async () => {
    muhit();
    sheetsJavob = async () => ({ ok: false, status: 500 });
    const r = await post(ASOS);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(tana(r).jadval, "qisman");
    const b = bitrix();
    assert.strictEqual(b.length, 2);
    assert.ok(b[1].tana.MESSAGE.includes("3 ta qator Google jadvalga yozilmadi"));
  });

  await sinov("Jadval ham, Bitrix ham xato — 502 (odam qayta yuboradi), sir logga chiqmaydi", async () => {
    muhit();
    const loglar = [];
    const asl = console.error;
    console.error = (...a) => loglar.push(a.join(" "));
    try {
      sheetsJavob = async () => ({ ok: false, status: 500 });
      bitrixJavob = async (url) => { throw new Error(`request to ${url}im.message.add.json failed`); };
      const r = await post(ASOS);
      assert.strictEqual(r.statusCode, 502);
      assert.strictEqual(tana(r).xato, "yuborilmadi");
    } finally {
      console.error = asl;
    }
    const hammasi = loglar.join("\n");
    assert.ok(hammasi.includes("Bitrix") && !hammasi.includes("MAXFIYkod"), hammasi);
  });

  await sinov("Faqat Bitrix sozlangan (jadvalsiz) ham ishlaydi", async () => {
    muhit({ SHEETS_WEBHOOK: null });
    const r = await post(ASOS);
    assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(tana(r), { ok: true, jadval: "ochirilgan", bitrix: true });
    assert.strictEqual(sheets().length, 0);
  });

  await sinov("Jadval varag'i birinchi qator bilan yaratiladi, qolganlari keyin", async () => {
    muhit();
    let ochiq = 0, birinchiTugadi = false, xato = false;
    sheetsJavob = async (url, opts) => {
      const t = JSON.parse(opts.body);
      if (t.sheet === "Texnika ro'yxati") {
        if (ochiq === 0 && !birinchiTugadi && t.row[6] !== "Konditsioner") xato = true;
        ochiq++;
        await new Promise((r) => setTimeout(r, 20));
        ochiq--;
        birinchiTugadi = true;
      }
      return { ok: false, status: 302 };
    };
    await post(ASOS);
    assert.ok(!xato, "varaqning birinchi qatori boshqalardan oldin yozilishi kerak");
  });

  console.log(process.exitCode ? `\n${otdi} ta sinov o'tdi, qolganlari YIQILDI` : `Texnika formasi to'g'ri ✓  (${otdi} sinov)`);
})();
