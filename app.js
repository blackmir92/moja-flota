const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
require('./reminderScheduler');

const app = express();
const PORT = process.env.PORT || 3000;


app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// === KONFIGURACJA SESJI ==
app.use(session({
  secret: 'Agamakota',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// === MIDDLEWARE ===
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// Katalogi statyczne
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// === AUTORYZACJA ===
function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

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

// Zabezpieczenie tras poniżej
app.use(requireLogin);

// === KONFIGURACJA MULTER (ZDJĘCIA) ===
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');

// === TRASY POJAZDÓW ===

app.get("/", async (req, res) => {
  try {
    const vehicles = await db.getAllVehicles();
    const garages = [...new Set(vehicles.map(v => v.garage).filter(Boolean))];
    const alerts = [];

    vehicles.forEach(v => {
      // Pobieramy daty, sprawdzając oba warianty nazw kolumn
      const insDate = v.insuranceDate || v.insurancedate;
      const inspDate = v.inspectionDate || v.inspectiondate;

      const insDays = getDaysLeft(insDate);
      const inspDays = getDaysLeft(inspDate);

      // Alert dla ubezpieczenia (do 30 dni)
      if (insDays !== null) {
        if (insDays <= 0) {
          alerts.push(`⚠️ ${v.brand} ${v.model} – ubezpieczenie wygasło!`);
        } else if (insDays <= 30) {
          alerts.push(`📅 ${v.brand} ${v.model} – koniec OC za ${insDays} dni`);
        }
      }

      // Alert dla przeglądu (do 30 dni)
      if (inspDays !== null) {
        if (inspDays <= 0) {
          alerts.push(`❌ ${v.brand} ${v.model} – brak aktualnego przeglądu!`);
        } else if (inspDays <= 30) {
          alerts.push(`🔧 ${v.brand} ${v.model} – koniec przeglądu za ${inspDays} dni`);
        }
      }
    });

    res.render("index", { vehicles, garages, alerts, selectedVehicle: null });
  } catch (err) {
    console.error("Błąd ładowania strony głównej:", err);
    res.status(500).send("Błąd serwera");
  }
});

app.get('/add', (req, res) => {
  res.render('add');
});

app.post('/add', async (req, res) => {
  try {
    const vehicle = {
      brand: req.body.brand || null,
      model: req.body.model || null,
      garage: req.body.garage || null,
      note: null, vin: null, year: null, policyNumber: null,
      date: null, imagePath: null, admin: null,
      insuranceDate: null, inspectionDate: null, reminderEmail: null
    };
    await db.addVehicle(vehicle);
    res.redirect('/');
  } catch (err) {
    res.status(500).send('Błąd przy dodawaniu pojazdu');
  }
});

app.post('/edit/vehicle/:id', async (req, res) => {
  const id = req.params.id;
  const allowedFields = ['brand', 'model', 'garage', 'vin', 'year', 'note', 'plate', 'imagePath'];
  const updates = {};
  
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) updates[key] = req.body[key];
  });

  try {
    const currentVehicle = await db.getVehicleById(id);
    if (!currentVehicle) return res.status(404).json({ success: false, message: 'Pojazd nie znaleziony' });

    const vehicleWithFixedKeys = {
      ...currentVehicle,
      insuranceDate: currentVehicle.insuranceDate || currentVehicle.insurancedate,
      inspectionDate: currentVehicle.inspectionDate || currentVehicle.inspectiondate,
      reminderEmail: currentVehicle.reminderEmail || currentVehicle.reminderemail,
      policyNumber: currentVehicle.policyNumber || currentVehicle.policynumber,
      plate: currentVehicle.plate,
      // Pamiętamy stare zdjęcie z bazy:
      imagePath: currentVehicle.imagepath || currentVehicle.imagePath 
    };

    // Łączymy stare dane z nowymi
    const vehicleToSave = { ...vehicleWithFixedKeys, ...updates };

    // --- 🛡️ BEZPIECZNIK ZDJĘCIA ---
    // Jeśli z frontendu przyszło puste pole zdjęcia (null, "" lub "fred"), 
    // a w bazie mieliśmy już jakieś zdjęcie, to go nie nadpisujemy!
    if (!updates.imagePath || updates.imagePath === "" || updates.imagePath.includes("fred.jpg")) {
        vehicleToSave.imagePath = vehicleWithFixedKeys.imagePath;
    }
    // -----------------------------

    await db.updateVehicleDetails(id, vehicleToSave);
    res.json({ success: true });
  } catch (err) {
    console.error("Błąd podczas edycji:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/update-reminders/:id', async (req, res) => {
  const { id } = req.params;
  const { insuranceDate, inspectionDate, reminderEmail, policyNumber } = req.body;
  try {
    await db.updateVehicleReminders(id, { insuranceDate, inspectionDate, reminderEmail, policyNumber });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/upload/:id', upload.single('image'), async (req, res) => {
  const id = req.params.id;
  if (!req.file) return res.status(400).json({ success: false, message: "Brak pliku" });
  const imagePath = req.file.filename;

  try {
    const currentVehicle = await db.getVehicleById(id);
    const vehicleWithFixedKeys = {
      ...currentVehicle,
      insuranceDate: currentVehicle.insuranceDate || currentVehicle.insurancedate,
      inspectionDate: currentVehicle.inspectionDate || currentVehicle.inspectiondate,
      reminderEmail: currentVehicle.reminderEmail || currentVehicle.reminderemail,
      policyNumber: currentVehicle.policyNumber || currentVehicle.policynumber,
      plate: currentVehicle.plate
    };
    const vehicleToSave = { ...vehicleWithFixedKeys, imagePath: imagePath };
    await db.updateVehicleDetails(id, vehicleToSave);
    res.json({ success: true, imagePath });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.get('/vehicle-data/:id', async (req, res) => {
  try {
    const vehicle = await db.getVehicleById(req.params.id);
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: 'Błąd danych' });
  }
});

app.get('/vehicle/:id/mileage', async (req, res) => {
  try {
    const logs = await db.getMileageLogs(req.params.id);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: "Błąd serwera" });
  }
});

app.post('/vehicle/:id/mileage', async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const mileage = Number(req.body.mileage);
    const action = req.body.action || '';
    const eventDate = req.body.eventDate || req.body.eventdate || new Date().toISOString().split('T')[0];

    if (!Number.isFinite(mileage) || mileage <= 0) return res.status(400).json({ success: false, error: 'Błąd przebiegu' });

    const insertedId = await db.addMileageLog(vehicleId, mileage, action, eventDate);
    res.json({ success: true, id: insertedId, mileage, action, eventdate: eventDate });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

app.post('/delete/:id', async (req, res) => {
  await db.deleteVehicle(req.params.id);
  res.redirect('/');
});

// === EKSPORTY ===
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

app.get('/export/excel', async (req, res) => {
  try {
    const vehicles = await db.getAllVehicles();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pełny Raport Floty');

    // 1. Definiujemy WSZYSTKIE kolumny (Pojazd + Rejestr)
    sheet.columns = [
      { header: 'Marka', key: 'brand', width: 15 },
      { header: 'Model', key: 'model', width: 15 },
      { header: 'Nr Rejestracyjny', key: 'plate', width: 15 },
      { header: 'Garaż', key: 'garage', width: 15 },
      { header: 'VIN', key: 'vin', width: 20 },
      { header: 'Rok', key: 'year', width: 10 },
      { header: 'Nr Polisy', key: 'policyNumber', width: 20 },
      { header: 'Ubezpieczenie do', key: 'insuranceDate', width: 15 },
      { header: 'Przegląd do', key: 'inspectionDate', width: 15 },
      { header: 'Email przypomnień', key: 'reminderEmail', width: 25 },
      { header: 'Notatki', key: 'note', width: 30 },
      // Kolumny z rejestru przebiegu
      { header: 'Data Zdarzenia', key: 'logDate', width: 15 },
      { header: 'Przebieg (km)', key: 'logMileage', width: 15 },
      { header: 'Czynność / Opis', key: 'logAction', width: 30 }
    ];

    // Stylizacja nagłówka (opcjonalnie, żeby było ładniej)
    sheet.getRow(1).font = { bold: true };

    for (const v of vehicles) {
      const logs = await db.getMileageLogs(v.id);

      // Mapujemy dane pojazdu, dbając o wielkość liter z PostgreSQL
      const vehicleBase = {
        brand: v.brand,
        model: v.model,
        plate: v.plate,
        garage: v.garage,
        vin: v.vin,
        year: v.year,
        policyNumber: v.policyNumber || v.policynumber,
        insuranceDate: v.insuranceDate || v.insurancedate,
        inspectionDate: v.inspectionDate || v.inspectiondate,
        reminderEmail: v.reminderEmail || v.reminderemail,
        note: v.note
      };

      if (logs && logs.length > 0) {
        logs.forEach(l => {
          sheet.addRow({
            ...vehicleBase,
            logDate: l.eventDate || l.eventdate,
            logMileage: l.mileage,
            logAction: l.action
          });
        });
      } else {
        // Jeśli brak logów, dodajemy sam pojazd z pustymi danymi rejestru
        sheet.addRow({
          ...vehicleBase,
          logAction: 'Brak wpisów w rejestrze'
        });
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Raport_Floty_' + new Date().toISOString().split('T')[0] + '.xlsx"');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Błąd eksportu Excel:", err);
    res.status(500).send('Błąd podczas generowania pliku Excel');
  }
});

app.get('/export/pdf', async (req, res) => {
  try {
    const vehicles = await db.getAllVehicles();
    // Tworzymy dokument, ale NIE dodajemy strony automatycznie przy starcie
    const doc = new PDFDocument({ margin: 40, size: 'A4', autoFirstPage: false });

    const today = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Raport_Floty_${today}.pdf"`);
    
    doc.pipe(res);

    const fontName = 'Roboto-VariableFont_wdth,wght.ttf';
    const fontPath = path.join(__dirname, fontName);
    if (fs.existsSync(fontPath)) {
        doc.font(fontPath);
    }

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const logs = await db.getMileageLogs(v.id);

      // DODAJEMY STRONĘ TYLKO TUTAJ
      doc.addPage();

      // --- NAGŁÓWEK ---
      doc.fontSize(22).fillColor('#2c3e50').text(`${v.brand} ${v.model}`, 40, 40);
      doc.fontSize(10).fillColor('#7f8c8d').text(`Data raportu: ${new Date().toLocaleDateString('pl-PL')}`, { align: 'right' });
      doc.moveDown(1);

      // --- MINIATURKA ZDJĘCIA ---
      const imagePathRaw = v.imagepath || v.imagePath;
      const fullImagePath = imagePathRaw ? path.join(__dirname, 'uploads', imagePathRaw) : null;

      if (fullImagePath && fs.existsSync(fullImagePath)) {
        try {
          doc.image(fullImagePath, 400, 80, { width: 150 });
        } catch (imgErr) {
          console.error("Błąd obrazka:", imgErr);
        }
      }

      // --- DANE TECHNICZNE ---
      doc.fillColor('#000').fontSize(12);
      let currentY = 80;
      doc.text(`Numer rejestracyjny: ${v.plate || '-'}`, 40, currentY);
      doc.text(`VIN: ${v.vin || '-'}`, 40, currentY + 20);
      doc.text(`Rok produkcji: ${v.year || '-'}`, 40, currentY + 40);
      doc.text(`Garaż: ${v.garage || '-'}`, 40, currentY + 60);
      
      currentY += 90;
      doc.text(`Ubezpieczenie OC do: ${v.insurancedate || v.insuranceDate || '-'}`, 40, currentY);
      doc.text(`Przegląd techniczny do: ${v.inspectiondate || v.inspectionDate || '-'}`, 40, currentY + 20);
      doc.text(`Numer polisy: ${v.policynumber || v.policyNumber || '-'}`, 40, currentY + 40);
      
      doc.moveDown(3);

      // --- TABELA REJESTRU ---
      doc.fontSize(14).fillColor('#2c3e50').text('Historia pojazdu', { underline: true });
      doc.moveDown(0.5);

      if (logs && logs.length > 0) {
        doc.fontSize(10).fillColor('#7f8c8d');
        const tableTop = doc.y;
        doc.text('Data', 50, tableTop);
        doc.text('Przebieg', 150, tableTop);
        doc.text('Czynność', 250, tableTop);
        doc.moveDown(0.5);
        doc.moveTo(40, doc.y).lineTo(550, doc.y).strokeColor('#bdc3c7').stroke();
        doc.moveDown(0.5);

        doc.fillColor('#000');
        logs.forEach(l => {
          // SPRAWDZENIE MIEJSCA: Jeśli zostało mniej niż 60 pkt do końca, dodaj stronę
          if (doc.y > 720) {
             doc.addPage();
             // Powtórz nagłówki na nowej stronie (opcjonalnie)
             doc.fontSize(10).fillColor('#7f8c8d').text('Historia cd...', 50, 40);
             doc.moveDown(1);
          }
          const logY = doc.y;
          doc.text(l.eventdate || l.eventDate || '-', 50, logY);
          doc.text(`${l.mileage || 0} km`, 150, logY);
          doc.text(l.action || '-', 250, logY, { width: 300 });
          doc.moveDown(0.5);
        });
      }


    }

    doc.end();
  } catch (err) {
    console.error("Błąd PDF:", err);
    res.status(500).send('Błąd generowania PDF');
  }
});
// Pomocnicza funkcja
function getDaysLeft(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}


