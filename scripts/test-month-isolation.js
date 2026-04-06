const fs = require('fs');
const { spawn } = require('child_process');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

(async () => {
  const server = spawn(process.execPath, ['index.js'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });

  await wait(1600);

  const tmpJan = 'examples/tmp_isolation_jan.csv';
  const tmpFeb = 'examples/tmp_isolation_feb.csv';

  try {
    const companyName = `Empresa Test ${Date.now()}`;
    const createdCompany = await api('http://127.0.0.1:3000/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: companyName }),
    });
    const companyId = createdCompany.company.id;

    const janBase = fs.readFileSync('examples/ejecucion_demo.csv', 'utf8');
    const febBase = janBase.replace('-329886405', '-229886405');

    fs.writeFileSync(tmpJan, janBase, 'utf8');
    fs.writeFileSync(tmpFeb, febBase, 'utf8');

    for (const [month, filePath] of [
      ['2026-01', tmpJan],
      ['2026-02', tmpFeb],
    ]) {
      const form = new FormData();
      form.append('file', new Blob([fs.readFileSync(filePath)]), filePath.split('/').pop());
      const upload = await api('http://127.0.0.1:3000/api/execution/upload', {
        method: 'POST',
        body: form,
      });

      await api('http://127.0.0.1:3000/api/execution/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          month,
          fileId: upload.fileId,
          forceReplace: true,
          mapping: {
            account: 'Cuenta',
            accountName: 'Nombre cuenta',
            balance: 'Saldo original',
            debit: '',
            credit: '',
          },
        }),
      });
    }

    const janAnalysis = await api(`http://127.0.0.1:3000/api/analysis/2026-01?companyId=${companyId}`);
    const febAnalysis = await api(`http://127.0.0.1:3000/api/analysis/2026-02?companyId=${companyId}`);

    const janIngresos = janAnalysis.execution.contable.totals.ingresos_operacionales;
    const febIngresos = febAnalysis.execution.contable.totals.ingresos_operacionales;

    if (janIngresos === febIngresos) {
      throw new Error(`Fallo aislamiento mensual: enero=${janIngresos} febrero=${febIngresos}`);
    }

    console.log('OK: aislamiento mensual validado.');
    console.log(`Ingresos enero=${janIngresos} | febrero=${febIngresos}`);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  } finally {
    try { fs.unlinkSync(tmpJan); } catch {}
    try { fs.unlinkSync(tmpFeb); } catch {}
    server.kill('SIGKILL');
  }
})();