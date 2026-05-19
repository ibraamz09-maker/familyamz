const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'familyamz.db')}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function init() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      member_id INTEGER,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      done INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      member_id INTEGER,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      mimetype TEXT NOT NULL,
      data TEXT NOT NULL,
      amount REAL,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      member_id INTEGER,
      expense_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Tables listes
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      done INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      member_id INTEGER,
      member_name TEXT NOT NULL,
      member_color TEXT DEFAULT '#9CA3AF',
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrations colonnes
  try { await db.execute('ALTER TABLE receipts ADD COLUMN expense_id INTEGER'); } catch (e) {}
  try { await db.execute("ALTER TABLE events ADD COLUMN time TEXT DEFAULT ''"); } catch (e) {}
  try { await db.execute("ALTER TABLE members ADD COLUMN password_hash TEXT DEFAULT ''"); } catch (e) {}
  try { await db.execute('ALTER TABLE members ADD COLUMN lat REAL'); } catch (e) {}
  try { await db.execute('ALTER TABLE members ADD COLUMN lng REAL'); } catch (e) {}
  try { await db.execute('ALTER TABLE members ADD COLUMN location_at DATETIME'); } catch (e) {}

  const res = await db.execute('SELECT id FROM admins WHERE username = ?', ['admin']);
  if (res.rows.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.execute('INSERT INTO admins (username, password_hash) VALUES (?, ?)', ['admin', hash]);
    console.log('Admin créé — identifiant: admin, mot de passe: admin123');
  }

  // Mise à jour des mots de passe des membres Amenzou
  const MEMBER_PASSWORDS = [
    { name: 'Foad',   password: 'Foad1974',   color: '#3B82F6' },
    { name: 'Ibrahim', password: 'Ibrahim2009', color: '#22C55E' },
    { name: 'Imen',   password: 'Imen2005',   color: '#EC4899' },
    { name: 'Assia',  password: 'Assia2004',  color: '#F97316' },
    { name: 'Sabah',  password: 'Sabah2013',  color: '#8B5CF6' },
  ];

  const fam = await db.execute("SELECT id FROM families WHERE identifier = 'amenzou'");
  if (fam.rows[0]) {
    const familyId = fam.rows[0].id;
    for (const mp of MEMBER_PASSWORDS) {
      const existing = await db.execute('SELECT id, password_hash FROM members WHERE family_id = ? AND name = ?', [familyId, mp.name]);
      const hash = bcrypt.hashSync(mp.password, 10);
      if (!existing.rows[0]) {
        await db.execute('INSERT INTO members (family_id, name, color, password_hash) VALUES (?, ?, ?, ?)', [familyId, mp.name, mp.color, hash]);
        console.log(`Membre créé: ${mp.name}`);
      } else if (!existing.rows[0].password_hash) {
        await db.execute('UPDATE members SET password_hash = ?, color = ? WHERE id = ?', [hash, mp.color, existing.rows[0].id]);
        console.log(`Mot de passe mis à jour: ${mp.name}`);
      }
    }
  }
}

module.exports = { db, init };
