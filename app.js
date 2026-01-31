const express = require('express');
require('./reminderScheduler');
const bodyParser = require('body-parser');
const db = require('./db');
const app = express();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


const session = require('express-session');
const path = require('path');


// konfiguracja sesji
app.use(session({
  secret: 'tajny_klucz',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // HTTPS => true
}));

app.use(bodyParser.urlencoded({ extended: true }));

// === KROK 3: Middleware requireLogin ===
function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

// === Trasy logowania ===
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'tomczyk') {
    req.session.loggedIn = true;
    res.redirect('/');
  } else {
    res.render('login', { error: 'Nieprawidłowy login lub hasło' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// === Tu dodajesz resztę tras aplikacji ===
// Ale zabezpieczamy je requireLogin:
app.use(requireLogin);

//Logowanie do strony


app.use(session({
  secret: 'Agamakota',  // zmień na coś trudnego
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // true tylko przy HTTPS
}));


// Trasa czyszczenia tylko czynności
app.get('/clean', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM mileage_logs');
    res.send('Tabela czynności została wyczyszczona ✅');
  } catch (err) {
    console.error(err);
    res.status(500).send('Błąd przy czyszczeniu tabeli czynności ❌');
  }
});

// Trasa czyszczenia całej bazy
app.get('/cleanall', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM mileage_logs');
    await db.pool.query('DELETE FROM vehicles');
    res.send('Cała baza danych została wyczyszczona ✅');
  } catch (err) {
    console.error(err);
    res.status(500).send('Błąd przy czyszczeniu całej bazy ❌');
  }
});


//dodane do obslugi zdjec
const multer = require('multer');



// Ustawiamy katalog z plikami statycznymi (np. style.css)
app.use(express.static('public'));

//statyczna ścieżka do zdjęć
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));



// Obsługa formularzy (POST)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());


//dodane do obslugi zdjec
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });



// Ustawiamy EJS jako silnik widoków
app.set('view engine', 'ejs');


// Formularz dodawania nowego pojazdu
app.get('/add', (req, res) => {
  res.render('add');
});

//osługa dodawania
app.post('/add', async (req, res) => {
  try {
    const vehicle = {
      brand: req.body.brand || null,
      model: req.body.model || null,
      garage: req.body.garage || null,
      note: null,
      vin: null,
      year: null,
      policyNumber: null,
      date: null,
      imagePath: null,
      admin: null,
      insuranceDate: null,
      inspectionDate: null,
      reminderEmail: null
    };

    await db.addVehicle(vehicle);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Błąd przy dodawaniu pojazdu');
  }
});

// Uruchomienie serwera
app.listen(PORT, () => {
  console.log(`Serwer działa na http://localhost:${PORT}`);
});
// Wyświetlenie formularza edycji pojazdu
app.get('/edit/:id', async (req, res) => {
  const id = req.params.id;
  const vehicle = await db.getVehicleById(id);
    console.log('Szczegóły pojazdu:', vehicle);
  if (!vehicle) {
    return res.status(404).send('Pojazd nie znaleziony');
  }
  res.render('edit', { vehicle });
});

// Obsługa aktualizacji pojazdu (formularz POST)
app.post('/edit/:id', async (req, res) => {
  const id = req.params.id;
  const updates = req.body; // przyjdzie JSON z polami do zmiany

  try {
    // Zakładam, że db.updateVehicleDetails obsługuje teraz dynamiczne pola
    await db.updateVehicleDetails(id, updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

//aktualizacja zapis danych pojazdu
app.post('/edit/vehicle/:id', async (req, res) => {
  const id = req.params.id;
  const updates = req.body;

  try {
    // 1. Pobieramy stare dane, żeby nie skasować czegoś, czego nie edytowaliśmy (np. zdjęcia)
    const currentVehicle = await db.getVehicleById(id);

    if (!currentVehicle) {
      return res.status(404).json({ success: false, message: 'Pojazd nie znaleziony' });
    }

    // 2. Łączymy stare dane z nowymi
    const vehicleToSave = { ...currentVehicle, ...updates };

    // 3. Zapisujemy bezpiecznie całość
    await db.updateVehicleDetails(id, vehicleToSave);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Błąd zapisu danych pojazdu:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Aktualizacja danych dat i przeglądów
app.post('/update-reminders/:id', async (req, res) => {
  const { id } = req.params;
  const { insuranceDate, inspectionDate, reminderEmail, policyNumber } = req.body;

  console.log("Update reminders payload:", { id, insuranceDate, inspectionDate, reminderEmail, policyNumber });

  try {
    await db.updateVehicleReminders(id, { insuranceDate, inspectionDate, reminderEmail, policyNumber });
    console.log("Reminders updated for vehicle:", id);
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating reminders:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});




// Usuwanie pojazdu (POST)
app.post('/delete/:id', async (req, res) => {
  const id = req.params.id;
  await db.deleteVehicle(id);
  res.redirect('/');
});

app.get('/vehicle/:id', async (req, res) => {
  const id = req.params.id;
  const vehicle = await db.getVehicleById(id);
  if (!vehicle) {
    return res.status(404).send('Nie znaleziono pojazdu');
  }
  res.render('vehicle', { vehicle });
});

//dodane do obsugi zdjec
app.post('/upload/:id', upload.single('image'), async (req, res) => {
  const id = req.params.id;
  const imagePath = req.file.filename;

  try {
    await db.updateVehicleDetails(id, { imagePath });
    res.json({ success: true, imagePath });
  } catch (err) {
    console.error('Błąd aktualizacji zdjęcia:', err);
    res.status(500).json({ success: false });
  }
});

//pobieranie danych aby pokazac w prawej kolumnie
app.get('/vehicle-data/:id', async (req, res) => {
  try {
    const vehicle = await db.getVehicleById(req.params.id);
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: 'Błąd przy pobieraniu danych pojazdu.' });
  }
});
//zwraca listę unikalnych garaży

//odswiezanie kafelkow
app.get('/api/vehicles', async (req, res) => {
  try {
    const garage = req.query.garage;
    const allVehicles = await db.getAllVehicles();

    const filtered = garage
      ? allVehicles.filter(v => v.garage === garage)
      : allVehicles;

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: 'Błąd przy pobieraniu pojazdów' });
  }
});


//alert o zbliżających się terminach
function getDaysLeft(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  const target = new Date(dateStr);
  const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  return diff;
}

app.get("/", async (req, res) => {
  try {
    const vehicles = await db.getAllVehicles();
    const garages = [...new Set(vehicles.map(v => v.garage).filter(Boolean))];

    const alerts = [];

    vehicles.forEach(v => {
      const insDays = getDaysLeft(v.insuranceDate);
      const inspDays = getDaysLeft(v.inspectionDate);

      if (insDays !== null && insDays <= 30) {
        alerts.push(`${v.brand} ${v.model} – koniec ubezpieczenia za ${insDays} dni`);
      }
      if (inspDays !== null && inspDays <= 30) {
        alerts.push(`${v.brand} ${v.model} – koniec przeglądu za ${inspDays} dni`);
      }
    });

    res.render("index", {
      vehicles,
      garages,
      alerts,
      selectedVehicle: null 
    });
  } catch (err) {
    console.error("Błąd pobierania danych:", err);
    res.status(500).send("Błąd serwera");
  }
});

app.get('/vehicle/:id/mileage', async (req, res) => {
  try {
    const id = req.params.id;
    // Używamy tej samej funkcji db, której używasz przy eksporcie do Excela
    const logs = await db.getMileageLogs(id);
    res.json(logs);
  } catch (err) {
    console.error("Błąd pobierania historii:", err);
    res.status(500).json({ error: "Błąd serwera" });
  }
});

// Zapis przebiegu z czynnością i datą
app.post('/vehicle/:id/mileage', async (req, res) => {
  try {
    const vehicleId = req.params.id;

    // Odczyt danych
    const mileage = Number(req.body.mileage);
    const action = req.body.action || '';
    
    // POPRAWKA: Obsługa 'eventDate' (backend) ORAZ 'eventdate' (frontend)
    const eventDate = req.body.eventDate || req.body.eventdate || new Date().toISOString().split('T')[0];

    if (!Number.isFinite(mileage) || mileage <= 0) {
      return res.status(400).json({ success: false, error: 'Nieprawidłowy przebieg' });
    }

    // Zapis do bazy
    const insertedId = await db.addMileageLog(vehicleId, mileage, action, eventDate);

    // Zwracamy odpowiedź JSON
    res.json({ 
      success: true, 
      id: insertedId || null,
      mileage,
      action,
      eventdate: eventDate // odsyłamy to co zapisaliśmy
    });
  } catch (err) {
    console.error('Błąd przy zapisie przebiegu:', err);
    res.status(500).json({ success: false, error: 'Błąd serwera' });
  }
});

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');


app.get('/export/excel', async (req, res) => {
  try {
    const vehicles = await db.getAllVehicles();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pojazdy + Historia');

    // Ustaw szerokości kolumn
    sheet.columns = [
      { header: 'ID pojazdu', key: 'id', width: 10 },
      { header: 'Marka', key: 'brand', width: 15 },
      { header: 'Model', key: 'model', width: 15 },
      { header: 'Garaż', key: 'garage', width: 15 },
      { header: 'VIN', key: 'vin', width: 20 },
      { header: 'Rok', key: 'year', width: 8 },
      { header: 'Polisa', key: 'policyNumber', width: 15 },
      { header: 'Data ubezp.', key: 'insuranceDate', width: 15 },
      { header: 'Data przeglądu', key: 'inspectionDate', width: 15 },
      { header: 'Email przypomnienia', key: 'reminderEmail', width: 25 },
      { header: 'Przebieg', key: 'mileage', width: 12 },
      { header: 'Zdarzenie', key: 'event', width: 25 },
      { header: 'Data zdarzenia', key: 'eventDate', width: 15 }
    ];

    // Styl nagłówka
    sheet.getRow(1).font = { bold: true };

    for (const vehicle of vehicles) {
      // Wiersz główny z pojazdem
      sheet.addRow({
        id: vehicle.id,
        brand: vehicle.brand,
        model: vehicle.model,
        garage: vehicle.garage,
        vin: vehicle.vin,
        year: vehicle.year,
        policyNumber: vehicle.policyNumber,
        insuranceDate: vehicle.insuranceDate,
        inspectionDate: vehicle.inspectionDate,
        reminderEmail: vehicle.reminderEmail
      }).font = { bold: true }; // pogrubione dane pojazdu

      // Pobierz jego zdarzenia
      const logs = await db.getMileageLogs(vehicle.id);
      if (logs.length > 0) {
        logs.forEach(log => {
          sheet.addRow({
            mileage: log.mileage,
            acton: log.action,
            eventDate: log.eventDate
          });
        });
      } else {
        // Jeśli brak historii — wstaw pustą linię
        sheet.addRow({ action: 'Brak zdarzeń' });
      }

      // Pusta linia odstępu
      sheet.addRow({});
    }

    // Wyślij plik do pobrania
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="pojazdy_historia.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Błąd eksportu do Excel');
  }
});


//eksport do PDF
app.get('/export/pdf', async (req, res) => {
  try {
    const vehicles = await db.getAllVehicles();
    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="pojazdy.pdf"');

    doc.pipe(res);

    //polskie znaki na pózniej. sciagnac plik i wrzucić do front //doc.font(path.join(__dirname, 'fonts', 'DejaVuSans.ttf'));
    doc.fontSize(18).text('Raport pojazdów i rejestru zdarzeń', { align: 'center' });
    doc.moveDown();

    for (const v of vehicles) {
      // Sekcja pojazdu
      doc.fontSize(12).fillColor('black').text(`ID: ${v.id}`);
      doc.text(`Marka: ${v.brand || ''}`);
      doc.text(`Model: ${v.model || ''}`);
      doc.text(`Garaż: ${v.garage || ''}`);
      doc.text(`VIN: ${v.vin || ''}`);
      doc.text(`Rok: ${v.year || ''}`);
      doc.text(`Polisa: ${v.policyNumber || ''}`);
      doc.text(`Data ubezpieczenia: ${v.insuranceDate || ''}`);
      doc.text(`Data przeglądu: ${v.inspectionDate || ''}`);
      doc.text(`Email przypomnienia: ${v.reminderEmail || ''}`);
      doc.moveDown(0.5);

      // Pobranie rejestru zdarzeń
      const logs = await db.getMileageLogs(v.id);
      if (logs.length > 0) {
        doc.fontSize(11).fillColor('blue').text('Rejestr zdarzeń:');
        doc.fontSize(10).fillColor('black');
        logs.forEach(log => {
          doc.text(
            `• ${log.eventDate || ''} | ${log.mileage} km | ${log.action || ''}`
          );
        });
      } else {
        doc.fontSize(10).fillColor('gray').text('Brak zdarzeń w rejestrze');
      }

      doc.moveDown(1);
      doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke(); // linia oddzielająca pojazdy
      doc.moveDown(1);
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Błąd eksportu do PDF');
  }
});

//czyszczenie tabeli rejestru:
app.get('/wipe-mileage', async (req, res) => {
  try {
    await db.wipeMileageLogs();
    res.send('mileage_logs wyczyszczone');
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});
//czyszczenie tabeli wszystkich:
app.get('/wipe-all', async (req, res) => {
  try {
    await db.wipeMileageLogs();
    await db.vehicles();
    res.send('wszystkie tabele wyczyszczone');
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

