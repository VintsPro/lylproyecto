const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Necesario para conexiones seguras con Supabase
  }
});

pool.on('connect', () => {
  console.log('Conectado exitosamente a la base de datos de Supabase (PostgreSQL)');
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de la base de datos:', err);
});

module.exports = pool;