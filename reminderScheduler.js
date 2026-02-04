const { getAllVehicles } = require('./db');
const { sendReminderEmail } = require('./mailer');
const cron = require('node-cron');

cron.schedule('00 10 * * *', async () => { 
  console.log('⏰ Uruchamiam codzienne skanowanie terminów...');
  try {
    const vehicles = await getAllVehicles();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    vehicles.forEach(v => {
      const email = v.reminderemail || v.reminderEmail;
      if (!email) return;

      const dates = {
        'Ubezpieczenie OC': v.insurancedate || v.insuranceDate,
        'Przegląd Techniczny': v.inspectiondate || v.inspectionDate
      };

      Object.entries(dates).forEach(([label, dateValue]) => {
        if (dateValue) {
          const dateLimit = new Date(dateValue);
          dateLimit.setHours(0, 0, 0, 0);
          
          const diffTime = dateLimit - today;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          // NOWA LOGIKA: Wysyłaj, jeśli zostało 10 dni LUB termin już minął (diffDays < 0)
          if (diffDays <= 10) {
            let statusPrefix = '🔔 Nadchodzący termin';
            let messagePart = `kończy się za ${diffDays} dni`;

            if (diffDays < 0) {
              statusPrefix = '⚠️ TERMIN UPŁYNĄŁ';
              messagePart = `minął ${Math.abs(diffDays)} dni temu!`;
            } else if (diffDays === 0) {
              statusPrefix = '🔥 TERMIN DZISIAJ';
              messagePart = `kończy się DZISIAJ`;
            }

            sendReminderEmail(
              email,
              `${statusPrefix}: ${v.brand} ${v.model} - ${label}`,
              `Pojazd: ${v.brand} ${v.model}\nCzynność: ${label}\nStatus: ${messagePart} (${dateValue}).\n\nProsimy o niezwłoczną aktualizację danych w systemie po załatwieniu sprawy.`
            );
            
            console.log(`✉️ Wysłano przypomnienie dla ${v.brand} (${label}: ${diffDays} dni)`);
          }
        }
      });
    });
  } catch (err) {
    console.error('❌ Błąd podczas skanowania terminów:', err);
  }
}, {
  timezone: 'Europe/Warsaw'
});
