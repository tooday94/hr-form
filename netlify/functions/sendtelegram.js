const fetch = require("node-fetch");
const FormData = require("form-data");

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

    const { pdfBase64, fullname } = JSON.parse(event.body);

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

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Telegram sent successfully" }),
    };

  } catch (error) {
    console.error("Telegram Error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
