const fetch = require("node-fetch");
const FormData = require("form-data");

// Jadval ustunlari: [formadagi nom, sarlavha] — tartib shu yerda belgilanadi
const USTUNLAR = [
  ["fullname", "F.I.Sh"], ["birthdate", "Tug'ilgan sana"], ["age", "Yoshi"],
  ["phone", "Telefon"], ["extra_contact", "Qo'shimcha aloqa"], ["telegram", "Telegram"],
  ["citizenship", "Fuqaroligi"], ["nation", "Millati"],
  ["passport", "Pasport"], ["passport_info", "Pasport ma'lumoti"],
  ["address_permanent", "Doimiy manzil"], ["address_current", "Hozirgi manzil"],
  ["education_level", "Ma'lumoti"], ["education_place", "O'qigan joyi"],
  ["speciality", "Mutaxassisligi"], ["graduation_year", "Bitirgan yili"],
  ["marital_status", "Oilaviy holati"], ["children", "Farzandlari"],
  ["company1", "Ish 1: kompaniya"], ["position1", "Ish 1: lavozim"],
  ["period1", "Ish 1: muddat"], ["tasks1", "Ish 1: vazifalar"], ["reason1", "Ish 1: ketish sababi"],
  ["company2", "Ish 2: kompaniya"], ["position2", "Ish 2: lavozim"],
  ["period2", "Ish 2: muddat"], ["tasks2", "Ish 2: vazifalar"], ["reason2", "Ish 2: ketish sababi"],
  ["busy", "Hozir nima bilan band"], ["priority", "Ish tanlashda muhimi"],
  ["six_months", "6 oydan keyin"], ["dislike", "Xohlamaydigan ishlar"],
  ["past_tasks", "Avvalgi vazifalar"], ["confident", "Ishonchli vaziyat"],
  ["customer_case", "Xaridor 'o'ylab ko'raman' desa"], ["unclear_task", "Vazifani tushunmasa"],
  ["preference", "Yaqin fikr"], ["recent_learn", "Yaqinda o'rgangani"],
  ["interests", "Qiziqishlari"], ["job_duration", "Ish muddati"],
  ["leave_reason", "Tez ketish sababi"],
];

exports.handler = async (event) => {
  try {

    /* ===== METHOD CHECK ===== */
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method Not Allowed" })
      };
    }

    /* ===== ENV CHECK ===== */
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      throw new Error("Telegram environment variables not set");
    }

    if (!event.body) {
      throw new Error("Empty request body");
    }

    const { pdfBase64, fullname, fields, vakansiya } = JSON.parse(event.body);

    if (!pdfBase64) {
      throw new Error("PDF data missing");
    }

    /* ===== BASE64 TO BUFFER ===== */
    const buffer = Buffer.from(pdfBase64, "base64");

    /* ===== FORM DATA ===== */
    const formData = new FormData();
    formData.append("chat_id", process.env.TELEGRAM_CHAT_ID);
    formData.append(
      "caption",
      `📄 Yangi HR Anketa\n\n👤 Ism: ${fullname || "Noma'lum"}`
        + (vakansiya ? `\n💼 Vakansiya: ${vakansiya}` : "")
    );
    formData.append("document", buffer, {
      filename: "feliza-anketa.pdf",
      contentType: "application/pdf",
    });

    /* ===== TELEGRAM REQUEST ===== */
    const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`;

    const response = await fetch(telegramUrl, {
      method: "POST",
      body: formData,
      headers: formData.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Telegram HTTP Error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.description);
    }

    /* ===== GOOGLE SHEETS (ixtiyoriy) =====
       SHEETS_WEBHOOK — jadvaldagi Apps Script veb-ilova URL'i (Telegram
       boti bilan bir xil ulagich). Sozlanmagan bo'lsa yoki xato bersa —
       anketa baribir yuborilgan hisoblanadi: PDF Telegramga ketgan. */
    let sheets = "ochirilgan";
    if (process.env.SHEETS_WEBHOOK && fields) {
      try {
        const msg = result.result || {};
        const chat = String((msg.chat || {}).id || "");
        const pdfLink = chat.startsWith("-100")
          ? `https://t.me/c/${chat.slice(4)}/${msg.message_id}` : "";
        const sana = new Date(Date.now() + 5 * 3600 * 1000)
          .toISOString().replace("T", " ").slice(0, 19);     // Toshkent vaqti
        const row = [sana, vakansiya || "", pdfLink]
          .concat(USTUNLAR.map(([k]) => String(fields[k] == null ? "" : fields[k])));
        const r = await fetch(process.env.SHEETS_WEBHOOK, {
          method: "POST",
          // Apps Script qatorni birinchi so'rovda yozadi va 302 qaytaradi;
          // yo'naltirishga ergashilmaydi (keyingi manzil xato sahifa beradi)
          redirect: "manual",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheet: process.env.SHEETS_TAB || "HR anketalar",
            headers: ["Sana-vaqt", "Vakansiya", "PDF"].concat(USTUNLAR.map(([, n]) => n)),
            row,
          }),
        });
        sheets = (r.ok || [301, 302, 303].includes(r.status)) ? "yozildi" : `xato ${r.status}`;
      } catch (e) {
        console.error("Sheets Error:", e);
        sheets = "xato";
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Telegram sent successfully", sheets }),
    };

  } catch (error) {
    console.error("Telegram Error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
