// Generate seeded users with bcrypt hashes + print plaintext creds once.
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const OUT = path.resolve('src/data');
fs.mkdirSync(OUT, { recursive: true });

const rnd = (n = 4) => Math.random().toString(36).slice(2, 2 + n).toUpperCase();
const mkPass = (p) => `${p}@${rnd()}${Math.floor(Math.random() * 90 + 10)}`;

const defs = [
  { username: 'superadmin', role: 'superadmin', name: 'Super Administrator' },
  { username: 'admin', role: 'admin', name: 'System Administrator' },
];
const userRoles = ['supervisor', 'supervisor', 'site_rep', 'site_rep', 'operations', 'operations', 'driver', 'driver', 'supervisor', 'operations'];
for (let i = 1; i <= 10; i++) {
  defs.push({ username: `user${i}`, role: userRoles[i - 1], name: `User ${i}` });
}

const creds = [];
const users = defs.map((d, i) => {
  const password = mkPass(d.username.toUpperCase());
  creds.push({ username: d.username, password, role: d.role });
  return {
    id: `U${i + 1}`,
    username: d.username,
    name: d.name,
    role: d.role,
    passwordHash: bcrypt.hashSync(password, 12),
    active: true,
    createdAt: new Date().toISOString(),
  };
});

fs.writeFileSync(path.join(OUT, 'users.json'), JSON.stringify(users, null, 2));
fs.writeFileSync(path.resolve('CREDENTIALS.txt'),
  'SFM DIESEL FUEL MANAGEMENT — LOGIN CREDENTIALS\n' +
  '='.repeat(50) + '\n' +
  creds.map((c) => `${c.role.padEnd(11)} | ${c.username.padEnd(11)} | ${c.password}`).join('\n') + '\n');

console.log('Generated', users.length, 'users');
console.table(creds);
