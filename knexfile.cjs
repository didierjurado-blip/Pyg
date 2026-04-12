if (!process.env.DATABASE_URL) {
  console.warn('knex: define DATABASE_URL para ejecutar migraciones contra PostgreSQL.');
}

module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://127.0.0.1:5432/postgres',
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
  pool: { min: 0, max: 5 },
};
