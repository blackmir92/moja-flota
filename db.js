const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
}); // <--- Poprawione domknięcie obiektu

/* =======================
   INICJALIZACJA TABEL
======================= */

async function initDB() {
  try {
    console.log("🛠️ Inicjalizacja bazy danych...");
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
        reminderEmail TEXT,
        plate TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mileage_logs (
        id SERIAL PRIMARY KEY,
        vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
        mileage INTEGER,
        action TEXT,
        eventDate DATE
      )
    `);
    console.log("✅ Tabele sprawdzone/utworzone.");
  } catch (err) {
    console.error("❌ Błąd inicjalizacji bazy danych:", err.message);
    // Nie rzucamy błędu dalej, aby serwer nie padł przy starcie
  }
}

// Uruchomienie inicjalizacji
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
    insuranceDate, inspectionDate, reminderEmail, 
    plate
  } = vehicle;

  return pool.query(`
    INSERT INTO vehicles
    (brand, model, garage, note, vin, year, policyNumber, date, imagePath, admin, insuranceDate, inspectionDate, reminderEmail, plate)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
    reminderEmail || null,
    plate || null
  ]);
}

function updateVehicle(id, vehicle) {
  const brand = vehicle.brand;
  const model = vehicle.model;
  const garage = vehicle.garage;
  const note = vehicle.note;
  const vin = vehicle.vin;
  const year = vehicle.year;
  const policyNumber = vehicle.policyNumber || vehicle.policynumber;
  const date = vehicle.date;
  const imagePath = vehicle.imagePath || vehicle.imagepath;  
  const admin = vehicle.admin;
  const insuranceDate = vehicle.insuranceDate || vehicle.insurancedate;
  const inspectionDate = vehicle.inspectionDate || vehicle.inspectiondate;
  const reminderEmail = vehicle.reminderEmail || vehicle.reminderemail;
  const plate = vehicle.plate;

  const yearInt = (year === "" || year === null || year === undefined) ? null : parseInt(year, 10);

  return pool.query(`
    UPDATE vehicles SET
      brand=$1, model=$2, garage=$3, note=$4, vin=$5, year=$6,
      policyNumber=$7, date=$8, imagePath=$9, admin=$10,
      insuranceDate=$11, inspectionDate=$12, reminderEmail=$13, plate=$14
    WHERE id=$15
  `, [
    brand || null,
    model || null,
    garage || null,
    note || null,
    vin || null,
    yearInt,
    policyNumber || null,
    date || null,
    imagePath || null,
    admin || null,
    insuranceDate || null,
    inspectionDate || null,
    reminderEmail || null,
    plate || null,
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
    `SELECT id, vehicle_id, mileage, action, 
     TO_CHAR(eventdate, 'YYYY-MM-DD') as eventdate 
     FROM mileage_logs 
     WHERE vehicle_id=$1 
     ORDER BY eventdate DESC, id DESC`,
    [vehicleId]
  ).then(res => res.rows);
}

function addMileageLog(vehicleId, mileage, event, eventDate) {
  const mileageInt = mileage === "" ? null : parseInt(mileage, 10);

  return pool.query(
    'INSERT INTO mileage_logs (vehicle_id, mileage, action, eventDate) VALUES ($1, $2, $3, $4) RETURNING id',
    [vehicleId, mileageInt, event, eventDate]
  ).then(res => res.rows[0].id);
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

async function deleteMileageLog(logId) {
    const query = 'DELETE FROM mileage_logs WHERE id = $1';
    await pool.query(query, [logId]);
}

async function updateMileageLog(logId, data) {
    const query = `
        UPDATE mileage_logs 
        SET mileage = $1, action = $2, eventdate = $3 
        WHERE id = $4
    `;
    await pool.query(query, [data.mileage, data.action, data.eventDate, logId]);
}
/* =======================
   ALIASY I EKSPORT
======================= */

module.exports = {
  pool,
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
  deleteMileageLog,
  updateMileageLog,
};
