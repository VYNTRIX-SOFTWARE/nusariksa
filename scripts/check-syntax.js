import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceDirectories = ['apps', 'scripts'];
let checkedFiles = 0;

function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      checkDirectory(filePath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const result = spawnSync(process.execPath, ['--check', filePath], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
      checkedFiles++;
    }
  }
}

for (const directory of sourceDirectories) checkDirectory(directory);
console.log(`${checkedFiles} berkas JavaScript lolos pemeriksaan sintaks.`);
