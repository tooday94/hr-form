const fetch = require("node-fetch");
const FormData = require("form-data");

exports.handler = async (event) => {
  try {
    const { pdfBase64, fullname } = JSON.parse(event.body);

    const buffer = Buffer.from(pdfBase64, "base64");

    const formData = new FormData();
    formData.append("chat_id", process.env.TELEGRAM_CHAT_ID);
    formData.append("caption", `Yangi HR Anketa: ${fullname}`);
    formData.append("document", buffer, {
      filename: "feliza-anketa.pdf",
      contentType: "application/pdf",
    });

    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`,
      {
        method: "POST",
        body: formData,
      }
    );

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.description);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Telegram sent" }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
