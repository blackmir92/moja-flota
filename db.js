const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

initDB();

/* =======================
   VEHICLES
======================= */
async function addVehicle(vehicle) {
  const {
    brand, model, garage, note, vin, year,
    policyNumber, date, imagePath, admin,
    insuranceDate, inspectionDate, reminderEmail
  } = vehicle;

  const yearInt = year === "" ? null : parseInt(year, 10);

  const res = await pool.query(`
    INSERT INTO vehicles
    (brand, model, garage, note, vin, year, policyNumber, date, imagePath, admin, insuranceDate, inspectionDate, reminderEmail)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *
  `, [
    brand, model, garage, note, vin, yearInt,
    policyNumber, date, imagePath, admin,
    insuranceDate, inspectionDate, reminderEmail
  ]);
  return res.rows[0];
}

async function getVehicles() {
  const res = await pool.query('SELECT * FROM vehicles ORDER BY id DESC');
  return res.rows;
}

async function getVehicleById(id) {
  const res = await pool.query('SELECT * FROM vehicles WHERE id=$1', [id]);
  return res.rows[0];
}

/* =======================
   MILEAGE LOGS
======================= */
async function addMileageLog(vehicleId, mileage, action) {
  const mileageInt = mileage === "" ? null : parseInt(mileage, 10);
  const res = await pool.query(
    'INSERT INTO mileage_logs (vehicle_id, mileage, action) VALUES ($1,$2,$3) RETURNING *',
    [vehicleId, mileageInt, action]
  );
  const row = res.rows[0];
  return {
    date: row.created_at ? row.created_at.toISOString().split('T')[0] : '',
    mileage: row.mileage,
    action: row.action
  };
}

async function getMileageLogs(vehicleId) {
  const res = await pool.query(
    'SELECT * FROM mileage_logs WHERE vehicle_id=$1 ORDER BY created_at DESC',
    [vehicleId]
  );
  return res.rows.map(r => ({
    date: r.created_at ? r.created_at.toISOString().split('T')[0] : '',
    mileage: r.mileage,
    action: r.action
  }));
}

module.exports = {
  initDB,
  addVehicle,
  getVehicles,
  getVehicleById,
  addMileageLog,
  getMileageLogs
};
