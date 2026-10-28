import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const direktoriKode = ['apps', 'scripts'];
let jumlahBerkas = 0;

function periksaDirektori(direktori) {
  for (const entri of readdirSync(direktori, { withFileTypes: true })) {
    const berkas = join(direktori, entri.name);
    if (entri.isDirectory()) {
      periksaDirektori(berkas);
    } else if (entri.isFile() && entri.name.endsWith('.js')) {
      const hasil = spawnSync(process.execPath, ['--check', berkas], { stdio: 'inherit' });
      if (hasil.status !== 0) process.exit(hasil.status || 1);
      jumlahBerkas++;
    }
  }
}

for (const direktori of direktoriKode) periksaDirektori(direktori);
console.log(`${jumlahBerkas} berkas JavaScript lolos pemeriksaan sintaks.`);
