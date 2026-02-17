const nodemailer = require("nodemailer");

exports.handler = async (event) => {
  try {
    const { pdfBase64, fullname } = JSON.parse(event.body);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `Yangi HR Anketa - ${fullname}`,
      text: "Yangi anketa biriktirilgan.",
      attachments: [
        {
          filename: "feliza-anketa.pdf",
          content: pdfBase64,
          encoding: "base64"
        }
      ]
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Email sent" })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
