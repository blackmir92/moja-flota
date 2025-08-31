const { getVehiclesWithReminders } = require('./db');
const { sendReminderEmail } = require('./mailer');
const cron = require('node-cron');


cron.schedule('16 00 * * *', async () => { // 15:59 czasu lokalnego w Warszawie
  console.log('Sprawdzam przypomnienia mailowe...');
  try {
    const vehicles = await getVehiclesWithReminders();

    const today = new Date();
    const reminderDaysBefore = 10;

    vehicles.forEach(vehicle => {
      ['insuranceDate', 'inspectionDate'].forEach(dateField => {
        if (vehicle[dateField]) {
          const dateLimit = new Date(vehicle[dateField]);
          const diffDays = Math.ceil((dateLimit - today) / (1000 * 60 * 60 * 24));

          if (diffDays === reminderDaysBefore) {
            sendReminderEmail(
              vehicle.reminderEmail,
              `${vehicle.brand} ${vehicle.model} - Przypomnienie o ${dateField}`,
              `Przypominamy, że ${dateField} Twojego pojazdu ${vehicle.brand} ${vehicle.model} kończy się za ${diffDays} dni (${vehicle[dateField]}).`
            );
          }
        }
      });
    });
  } catch (err) {
    console.error('Błąd przy sprawdzaniu przypomnień:', err);
  }
}, {
  timezone: 'Europe/Warsaw' // <-- ważne, żeby uruchamiać zgodnie z czasem polskim
});