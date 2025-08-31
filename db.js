const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./vehicles.db');


db.serialize(() => {
  // tabela pojazdów
  db.run(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT,
      model TEXT,
      garage TEXT,
      vin TEXT,
      year TEXT,
      policyNumber TEXT,
      date TEXT,
      imagePath TEXT,
      admin TEXT,
      insuranceDate TEXT,
      inspectionDate TEXT,
      reminderEmail TEXT,
      event TEXT,
      mileage TEXT,
      eventDate TEXT
    );
  `);

  // tabela przebiegów z czynnością i datą
  db.run(`
    CREATE TABLE IF NOT EXISTS mileage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL,
      mileage INTEGER NOT NULL,
      event TEXT,
      eventDate TEXT,
      dateAdded TEXT NOT NULL DEFAULT (date('now')),
      FOREIGN KEY(vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );
  `);
});

db.all(`PRAGMA table_info(vehicles)`, (err, columns) => {
  if (err) {
    console.error('Błąd przy sprawdzaniu kolumn:', err);
  } else if (Array.isArray(columns)) {
    const hasAdmin = columns.some(col => col.name === 'admin');
    if (!hasAdmin) {
      db.run(`ALTER TABLE vehicles ADD COLUMN admin TEXT`);
    }
  }
});

// ======= Funkcje =======

function addVehicle(brand, model, garage) {
  return new Promise((resolve, reject) => {
    const date = new Date().toISOString().slice(0, 10);
    db.run(
      `INSERT INTO vehicles (brand, model, garage, date) VALUES (?, ?, ?, ?)`,
      [brand, model, garage, date],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function getAllVehicles() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM vehicles ORDER BY id DESC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getVehicleById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM vehicles WHERE id = ?', [id], (err, row) => {
      if (err) {
        console.error('DB error:', err);
        reject(err);
      } else {
      
        resolve(row);
      }
    });
  });
}


function updateVehicleDetails(id, updates) {
  return new Promise((resolve, reject) => {
    const allowedFields = ['brand', 'model', 'vin', 'year', 'policyNumber', 'garage', 'date', 'imagePath', 'insuranceDate', 'inspectionDate', 'reminderEmail', 'event', 'mileage', 'eventDate' ];

    const fields = [];
    const values = [];
    for (const key of allowedFields) {
      if (updates.hasOwnProperty(key)) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }

    if (fields.length === 0) {
      resolve();
      return;
    }

    const sql = `UPDATE vehicles SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);

    db.run(sql, values, function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

function deleteVehicle(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM vehicles WHERE id = ?', [id], function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

function updateVehicleImage(id, imagePath) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE vehicles SET imagePath = ? WHERE id = ?',
      [imagePath, id],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}
function getUniqueGarages() {
  return new Promise((resolve, reject) => {
    db.all('SELECT DISTINCT garage FROM vehicles WHERE garage IS NOT NULL AND garage != ""', (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(row => row.garage));
    });
  });
}
function getVehiclesWithReminders() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM vehicles WHERE reminderEmail IS NOT NULL AND reminderEmail != ''`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// Dodawanie wpisu przebiegu z czynnością i datą
function addMileageLog(vehicleId, mileage, event, eventDate) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO mileage_logs (vehicle_id, mileage, event, eventDate) VALUES (?, ?, ?, ?)`,
      [vehicleId, mileage, event, eventDate],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Pobieranie przebiegów dla pojazdu (z event i eventDate)
function getMileageLogs(vehicleId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM mileage_logs WHERE vehicle_id = ? ORDER BY eventDate DESC`,
      [vehicleId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}


function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}


// ======= Eksport funkcji =======
module.exports = {
  addVehicle,
  getAllVehicles,
  getVehicleById,
  updateVehicleDetails,
  deleteVehicle,
  updateVehicleImage,
  getUniqueGarages,
  getVehiclesWithReminders,
  addMileageLog, 
  getMileageLogs, 
  all
};