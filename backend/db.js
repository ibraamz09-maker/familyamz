const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const path = require('path');

// URL Turso hardcodée en fallback (non sensible) — token reste en env var
const TURSO_URL = 'libsql://familyamz-ibraamz09-maker.aws-eu-west-1.turso.io';
const dbUrl = process.env.TURSO_DATABASE_URL || TURSO_URL;
const hasToken = !!process.env.TURSO_AUTH_TOKEN;
console.log(`[DB] URL: ${dbUrl.startsWith('libsql://') ? 'Turso ✓' : 'SQLite local'}`);
console.log(`[DB] Token: ${hasToken ? 'OK ✓' : 'MANQUANT ✗'}`);

const db = createClient({
  url: dbUrl,
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
  // Table abonnements push
  await db.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      member_id INTEGER,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(() => {});

  try { await db.execute('ALTER TABLE receipts ADD COLUMN expense_id INTEGER'); } catch (e) {}
  try { await db.execute("ALTER TABLE events ADD COLUMN time TEXT DEFAULT ''"); } catch (e) {}
  try { await db.execute("ALTER TABLE members ADD COLUMN password_hash TEXT DEFAULT ''"); } catch (e) {}
  try { await db.execute('ALTER TABLE members ADD COLUMN lat REAL'); } catch (e) {}
  try { await db.execute('ALTER TABLE members ADD COLUMN lng REAL'); } catch (e) {}
  try { await db.execute('ALTER TABLE members ADD COLUMN location_at DATETIME'); } catch (e) {}
  try { await db.execute('ALTER TABLE members ADD COLUMN last_seen DATETIME'); } catch (e) {}
  try { await db.execute("ALTER TABLE events ADD COLUMN member_ids TEXT DEFAULT ''"); } catch (e) {}
  // Renommage Foad → Papa (migration unique)
  try {
    await db.execute(
      "UPDATE members SET name = 'Papa' WHERE name = 'Foad' AND family_id = (SELECT id FROM families WHERE identifier = 'amenzou')"
    );
  } catch (e) {}

  try { await db.execute("ALTER TABLE events ADD COLUMN urgent INTEGER DEFAULT 0"); } catch (e) {}
  try { await db.execute("ALTER TABLE events ADD COLUMN recurrence TEXT DEFAULT 'none'"); } catch (e) {}
  try { await db.execute("ALTER TABLE messages ADD COLUMN audio TEXT DEFAULT ''"); } catch (e) {}
  try { await db.execute("ALTER TABLE expenses ADD COLUMN member_ids TEXT DEFAULT ''"); } catch (e) {}
  try { await db.execute("ALTER TABLE members ADD COLUMN location_token TEXT DEFAULT ''"); } catch (e) {}
  try { await db.execute("ALTER TABLE tasks ADD COLUMN recurrence TEXT DEFAULT 'none'"); } catch (e) {}
  try { await db.execute("ALTER TABLE tasks ADD COLUMN done_date TEXT DEFAULT ''"); } catch (e) {}
  try { await db.execute("ALTER TABLE events ADD COLUMN end_time TEXT DEFAULT ''"); } catch (e) {}

  const res = await db.execute('SELECT id FROM admins WHERE username = ?', ['admin']);
  if (res.rows.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.execute('INSERT INTO admins (username, password_hash) VALUES (?, ?)', ['admin', hash]);
    console.log('Admin créé — identifiant: admin, mot de passe: admin123');
  }

  // === FAMILLE AMENZOU — créée automatiquement si absente ===
  const AMENZOU_ID = 'amenzou';
  const AMENZOU_NAME = 'Amenzou';
  const AMENZOU_PWD = 'Foad1974@';
  const AMENZOU_MEMBERS = [
    { name: 'Papa',    password: 'Foad1974',   color: '#3B82F6' },
    { name: 'Ibrahim', password: 'Ibrahim2009', color: '#22C55E' },
    { name: 'Imen',    password: 'Imen2005',    color: '#EC4899' },
    { name: 'Assia',   password: 'Assia2004',   color: '#F97316' },
    { name: 'Sabah',   password: 'Sabah2013',   color: '#8B5CF6' },
  ];

  let famRow = await db.execute('SELECT id FROM families WHERE identifier = ?', [AMENZOU_ID]);
  if (!famRow.rows[0]) {
    const h = bcrypt.hashSync(AMENZOU_PWD, 10);
    await db.execute('INSERT INTO families (identifier, password_hash, name) VALUES (?, ?, ?)', [AMENZOU_ID, h, AMENZOU_NAME]);
    famRow = await db.execute('SELECT id FROM families WHERE identifier = ?', [AMENZOU_ID]);
    console.log('Famille Amenzou créée');
  }
  if (famRow.rows[0]) {
    const fid = famRow.rows[0].id;
    for (const mp of AMENZOU_MEMBERS) {
      const ex = await db.execute('SELECT id, password_hash FROM members WHERE family_id = ? AND name = ?', [fid, mp.name]);
      const h = bcrypt.hashSync(mp.password, 10);
      if (!ex.rows[0]) {
        await db.execute('INSERT INTO members (family_id, name, color, password_hash) VALUES (?, ?, ?, ?)', [fid, mp.name, mp.color, h]);
        console.log(`Membre créé: ${mp.name}`);
      } else if (!ex.rows[0].password_hash) {
        await db.execute('UPDATE members SET password_hash = ?, color = ? WHERE id = ?', [h, mp.color, ex.rows[0].id]);
      }
    }
  }
  // === FIN FAMILLE AMENZOU ===
}

module.exports = { db, init };
