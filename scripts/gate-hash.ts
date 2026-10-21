import { fingerprint } from '../src/lib/gate.ts';

const password = process.argv[2];
if (!password) {
  console.error('Uso: npm run gate-hash -- "password"');
  process.exit(1);
}
console.log(fingerprint(password));
