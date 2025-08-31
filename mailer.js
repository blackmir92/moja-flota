const nodemailer = require('nodemailer');

// umożliwia połączenie mimo braku certyfikatu
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'nasze.pojazdy@gmail.com',
    pass: 'vpgx kghj miqx xoby' // <- wygenerowane hasło z Gmaila
  }
});

async function sendReminderEmail(to, subject, text) {
  try {
    await transporter.sendMail({
      from: '"FleetApp" <nasze.pojazdy@gmail.com>',
      to,
      subject,
      text
    });
    console.log(`Wysłano e-mail do ${to}: ${subject}`);
  } catch (err) {
    console.error('Błąd przy wysyłce maila:', err);
  }
}

module.exports = {
  sendReminderEmail
};
