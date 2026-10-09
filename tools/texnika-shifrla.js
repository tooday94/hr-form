/* Xodimlar ro'yxatini shifrlab netlify/functions/texnika_royxat.js ga yozadi.
   Ochiq ro'yxat va kalit repoga KIRMAYDI (repo ochiq) — ular kompyuterda
   alohida papkada turadi.

     node tools/texnika-shifrla.js <xodimlar.json> <kalit.txt>

   kalit.txt yo'q bo'lsa — yangi kalit yaratiladi. Uning qiymati Netlify'da
   TEXNIKA_KALIT bo'lishi kerak. Oxirida forma havolasi chiqadi. */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { _ichki } = require(path.join(__dirname, "..", "netlify", "functions", "texnika.js"));

const [royxatYoli, kalitYoli] = process.argv.slice(2);
if (!royxatYoli || !kalitYoli) {
  console.error("Ishlatish: node tools/texnika-shifrla.js <xodimlar.json> <kalit.txt>");
  process.exit(1);
}

let kalitB64 = fs.existsSync(kalitYoli) ? fs.readFileSync(kalitYoli, "utf8").trim() : "";
if (!kalitB64) {
  kalitB64 = crypto.randomBytes(32).toString("base64");
  fs.writeFileSync(kalitYoli, kalitB64 + "\n", { mode: 0o600 });
  console.log("Yangi kalit yaratildi:", kalitYoli, "→ Netlify'da TEXNIKA_KALIT ga qo'ying");
}
const kalit = Buffer.from(kalitB64, "base64");
if (kalit.length !== 32) throw new Error("kalit 32 bayt (base64) bo'lishi kerak");

const royxat = JSON.parse(fs.readFileSync(royxatYoli, "utf8"));
// Tuzilma tekshiruvi: bo'lim → (joylar →) xodimlar {ism, lavozim}
let soni = 0;
for (const b of royxat.bolimlar || []) {
  if (!b.kalit || !b.nom) throw new Error("bo'limda kalit/nom yo'q");
  const guruhlar = b.joylar ? b.joylar : [b];
  for (const g of guruhlar) {
    const ismlar = new Set();
    for (const x of g.xodimlar || []) {
      if (!x.ism || !x.lavozim) throw new Error(`${b.nom} ${g.nom || ""}: ism/lavozim yo'q`);
      if (ismlar.has(x.ism)) throw new Error(`${b.nom} ${g.nom || ""}: takror ism ${x.ism}`);
      ismlar.add(x.ism);
      soni++;
    }
  }
}

const chiqish = path.join(__dirname, "..", "netlify", "functions", "texnika_royxat.js");
fs.writeFileSync(chiqish,
  "/* Xodimlar ro'yxati — SHIFRLANGAN (AES-256-GCM, kalit Netlify'dagi TEXNIKA_KALIT).\n"
  + "   Yangilash: node tools/texnika-shifrla.js <xodimlar.json> <kalit.txt> */\n"
  + `exports.SHIFR = ${JSON.stringify(_ichki.shifrla(kalit, royxat))};\n`);

console.log(`Shifrlandi: ${soni} xodim, ${(royxat.bolimlar || []).length} bo'lim → ${path.relative(process.cwd(), chiqish)}`);
console.log(`Havola: https://hrforma.netlify.app/texnika/?kod=${_ichki.havolaKodi(kalit)}`);
