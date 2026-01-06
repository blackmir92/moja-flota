const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* =======================
   INICJALIZACJA TABEL
======================= */

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY,
      brand TEXT,
      model TEXT,
      garage TEXT,
      note TEXT,
      vin TEXT,
      year INTEGER,
      policyNumber TEXT,
      date TEXT,
      imagePath TEXT,
      admin TEXT,
      insuranceDate TEXT,
      inspectionDate TEXT,
      reminderEmail TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mileage_logs (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
      mileage INTEGER,
      action TEXT,
      eventDate TEXT
    )
  `);
}

initDB();

/* =======================
   VEHICLES
======================= */

function getVehicles() {
  return pool.query('SELECT * FROM vehicles ORDER BY id DESC')
    .then(res => res.rows);
}

function getVehicleById(id) {
  return pool.query('SELECT * FROM vehicles WHERE id = $1', [id])
    .then(res => res.rows[0]);
}

function addVehicle(vehicle) {
  const {
    brand, model, garage, note, vin, year,
    policyNumber, date, imagePath, admin,
    insuranceDate, inspectionDate, reminderEmail
  } = vehicle;

  return pool.query(`
    INSERT INTO vehicles
    (brand, model, garage, note, vin, year, policyNumber, date, imagePath, admin, insuranceDate, inspectionDate, reminderEmail)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `, [
    brand || null,
    model || null,
    garage || null,
    note || null,
    vin || null,
    year === "" || !year ? null : parseInt(year, 10),
    policyNumber || null,
    date || null,
    imagePath || null,
    admin || null,
    insuranceDate || null,
    inspectionDate || null,
    reminderEmail || null
  ]);
}

function updateVehicle(id, vehicle) {
  const {
    brand, model, garage, note, vin, year,
    policyNumber, date, imagePath, admin,
    insuranceDate, inspectionDate, reminderEmail
  } = vehicle;

  const yearInt = year === "" ? null : parseInt(year, 10);

  return pool.query(`
    UPDATE vehicles SET
      brand=$1, model=$2, garage=$3, note=$4, vin=$5, year=$6,
      policyNumber=$7, date=$8, imagePath=$9, admin=$10,
      insuranceDate=$11, inspectionDate=$12, reminderEmail=$13
    WHERE id=$14
  `, [
    brand, model, garage, note, vin, yearInt,
    policyNumber, date, imagePath, admin,
    insuranceDate, inspectionDate, reminderEmail,
    id
  ]);
}

function deleteVehicle(id) {
  return pool.query('DELETE FROM vehicles WHERE id=$1', [id]);
}

function getGarages() {
  return pool.query('SELECT DISTINCT garage FROM vehicles')
    .then(res => res.rows.map(r => r.garage));
}

/* =======================
   MILEAGE
======================= */

function getMileageLogs(vehicleId) {
  return pool.query(
    'SELECT * FROM mileage_logs WHERE vehicle_id=$1 ORDER BY mileage DESC',
    [vehicleId]
  ).then(res => res.rows);
}

function addMileageLog(vehicleId, mileage, action, eventDate) {
  const mileageInt = mileage === "" ? null : parseInt(mileage, 10);

  return pool.query(
    'INSERT INTO mileage_logs (vehicle_id, mileage, action, eventDate) VALUES ($1, $2, $3, $4)',
    [vehicleId, mileageInt, action, eventDate] // eventDate w formacie 'YYYY-MM-DD'
  );
}
function updateVehicleReminders(id, data) {
  const { insuranceDate, inspectionDate, reminderEmail, policyNumber } = data;

  return pool.query(`
    UPDATE vehicles SET
      insuranceDate = $1,
      inspectionDate = $2,
      reminderEmail = $3,
      policyNumber = $4
    WHERE id = $5
  `, [
    insuranceDate === "" ? null : insuranceDate,
    inspectionDate === "" ? null : inspectionDate,
    reminderEmail === "" ? null : reminderEmail,
    policyNumber === "" ? null : policyNumber,
    id
  ]);
}

// app.js
const express = require('express');
const app = express();
const db = require('./db'); // Twój moduł db.js z PostgreSQL

// --- Czyści tylko tabelę mileage_logs ---
app.get('/clean', async (req, res) => {
  try {
    await db.pool.query('DELETE FROM mileage_logs'); // PostgreSQL
    res.send('Tabela czynności została wyczyszczona ✅');
  } catch (err) {
    console.error(err);
    res.status(500).send('Błąd przy czyszczeniu tabeli czynności ❌');
  }
});

// --- Czyści całą bazę pojazdów i czynności ---
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

/* =======================
   ALIASY DLA KOMPATYBILNOŚCI
======================= */

module.exports = {
  pool,  // <- teraz możesz użyć pool.query() w app.js
  getVehicles,
  getAllVehicles: getVehicles,
  getVehicleById,
  addVehicle,
  updateVehicle,
  updateVehicleDetails: updateVehicle,
  deleteVehicle,
  getGarages,
  getMileageLogs,
  addMileageLog,
  updateVehicleReminders,
};
