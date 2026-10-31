import { createPool } from '../apps/api/src/database.js';
import { runMigrations } from '../apps/api/src/migrations.js';
import { bootstrapInstitution } from '../apps/api/src/bootstrap.js';

function readOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--name', '--kind', '--email'].includes(key) || options[key]
      || typeof args[index + 1] !== 'string' || args[index + 1].startsWith('--')) {
      throw new Error('Usage: npm run admin:bootstrap -- --name "Nama BPR" --kind BPR --email admin@example.test');
    }
    options[key] = args[index + 1];
  }
  if (!options['--name'] || !options['--kind'] || !options['--email']) {
    throw new Error('Institution name, kind and email are required');
  }
  return options;
}

function readPassword(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error('Interactive terminal required for password input');
  }
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const wasRaw = input.isRaw;
    const buffer = [];
    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();

    function finish(error) {
      input.off('data', onData);
      input.setRawMode(wasRaw);
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(Buffer.from(buffer).toString('utf8'));
    }

    function onData(chunk) {
      for (const byte of chunk) {
        if (byte === 3) return finish(new Error('Cancelled'));
        if (byte === 13 || byte === 10) return finish();
        if (byte === 127 || byte === 8) buffer.pop();
        else if (byte >= 32 && buffer.length < 1024) buffer.push(byte);
      }
    }
    input.on('data', onData);
  });
}

let pool;
try {
  const options = readOptions(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured');
  const password = await readPassword('Password admin (not displayed): ');
  const confirmation = await readPassword('Repeat password: ');
  if (password !== confirmation) throw new Error('Passwords do not match');

  pool = createPool();
  await runMigrations(pool);
  const result = await bootstrapInstitution(pool, {
    institutionName: options['--name'],
    institutionKind: options['--kind'],
    email: options['--email'],
    password,
  });
  console.log('Initial administrator created:', result.email);
} catch (error) {
  console.error('Initial setup failed:', error.message);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
