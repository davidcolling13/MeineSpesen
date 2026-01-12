import express from 'express';
import nodemailer from 'nodemailer';

const router = express.Router();

// --- SMTP Configuration (IONOS) ---
const transporter = nodemailer.createTransport({
  host: "smtp.ionos.de",
  port: 465,
  secure: true, 
  auth: {
    user: "dispo@colling-transporte.de",
    pass: "Co33ingdispo26",
  },
});

// Verify connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.log("SMTP Connection Error:", error);
  } else {
    console.log("✓ SMTP Server is ready");
  }
});

router.post('/', async (req, res) => {
  const { email, fileName, fileData } = req.body;
  
  if (!email || !fileData) {
      return res.status(400).json({ error: "Email and fileData required" });
  }

  try {
    const base64Content = fileData.split(';base64,').pop();

    const info = await transporter.sendMail({
      from: '"MeineSpesen" <dispo@colling-transporte.de>',
      to: email,
      subject: `Spesenabrechnung: ${fileName}`,
      text: `Hallo,\n\nanbei erhalten Sie Ihre Spesenabrechnung "${fileName}".\n\nMit freundlichen Grüßen\nColling Transporte\n\n(Diese Nachricht wurde automatisch erstellt)`,
      attachments: [
        {
          filename: fileName,
          content: base64Content,
          encoding: 'base64',
        },
      ],
    });

    console.log(`📧 Email sent: ${info.messageId} to ${email}`);
    res.json({ success: true, message: "Email sent successfully", messageId: info.messageId });

  } catch (error) {
    console.error("❌ Error sending email:", error);
    res.status(500).json({ error: "Failed to send email: " + error.message });
  }
});

export default router;