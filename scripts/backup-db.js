const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('../src/services/storage-service');

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error('No existe la base JSON en:', DB_PATH);
    process.exit(1);
  }
  const dir = path.join(path.dirname(DB_PATH), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `db-${stamp}.json`);
  fs.copyFileSync(DB_PATH, target);
  console.log('Copia guardada en:', target);
}

main();
