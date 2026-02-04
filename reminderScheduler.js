const { getAllVehicles } = require('./db'); // Użyjemy głównej funkcji pobierania
const { sendReminderEmail } = require('./mailer');
const cron = require('node-cron');

// Harmonogram: 15:59 (jeśli tak sugeruje Twój komentarz, to powinno być '59 15 * * *')
// Obecnie masz '16 00 * * *' co oznacza 00:16 w nocy.
cron.schedule('18 09 * * *', async () => { 
  console.log('⏰ Uruchamiam sprawdzanie przypomnień mailowych...');
  try {
    const vehicles = await getAllVehicles();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminderDaysBefore = 10;

    vehicles.forEach(v => {
      // Pobieramy dane obsługując małe i duże litery
      const email = v.reminderemail || v.reminderEmail;
      const dates = {
        'Ubezpieczenie': v.insurancedate || v.insuranceDate,
        'Przegląd': v.inspectiondate || v.inspectionDate
      };

      if (!email) return; // Jeśli brak maila, pomiń pojazd

      Object.entries(dates).forEach(([label, dateValue]) => {
        if (dateValue) {
          const dateLimit = new Date(dateValue);
          dateLimit.setHours(0, 0, 0, 0);
          
          const diffTime = dateLimit - today;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          console.log(`🔍 Sprawdzam ${v.brand}: ${label} za ${diffDays} dni`);

          if (diffDays === reminderDaysBefore) {
            sendReminderEmail(
              email,
              `🔔 Przypomnienie: ${v.brand} ${v.model} - ${label}`,
              `Cześć! Przypominamy, że za ${diffDays} dni (${dateValue}) kończy się ${label} w Twoim pojeździe ${v.brand} ${v.model}.`
            );
          }
        }
      });
    });
  } catch (err) {
    console.error('❌ Błąd przy sprawdzaniu przypomnień:', err);
  }
}, {
  timezone: 'Europe/Warsaw'
});
