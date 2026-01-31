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

// === KONFIGURACJA SESJI ===
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
      const insDays = getDaysLeft(v.insuranceDate);
      const inspDays = getDaysLeft(v.inspectionDate);
      if (insDays !== null && insDays <= 30) alerts.push(`${v.brand} ${v.model} – koniec ubezpieczenia za ${insDays} dni`);
      if (inspDays !== null && inspDays <= 30) alerts.push(`${v.brand} ${v.model} – koniec przeglądu za ${inspDays} dni`);
    });

    res.render("index", { vehicles, garages, alerts, selectedVehicle: null });
  } catch (err) {
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
      plate: currentVehicle.plate
    };

    const vehicleToSave = { ...vehicleWithFixedKeys, ...updates };
    await db.updateVehicleDetails(id, vehicleToSave);
    res.json({ success: true });
  } catch (err) {
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
    const sheet = workbook.addWorksheet('Pojazdy');
    sheet.columns = [
      { header: 'Marka', key: 'brand', width: 15 },
      { header: 'Model', key: 'model', width: 15 },
      { header: 'Garaż', key: 'garage', width: 15 },
      { header: 'Przebieg', key: 'mileage', width: 12 },
      { header: 'Czynność', key: 'action', width: 25 },
      { header: 'Data', key: 'eventDate', width: 15 }
    ];

    for (const v of vehicles) {
      const logs = await db.getMileageLogs(v.id);
      if (logs.length > 0) {
        logs.forEach(l => sheet.addRow({ brand: v.brand, model: v.model, garage: v.garage, mileage: l.mileage, action: l.action, eventDate: l.eventDate }));
      } else {
        sheet.addRow({ brand: v.brand, model: v.model, garage: v.garage, action: 'Brak zdarzeń' });
      }
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="raport.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { res.status(500).send('Błąd Excel'); }
});

// Pomocnicza funkcja
function getDaysLeft(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}


