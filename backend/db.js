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

  // Migrations
  try { await db.execute('ALTER TABLE receipts ADD COLUMN expense_id INTEGER'); } catch (e) {}
  try { await db.execute("ALTER TABLE events ADD COLUMN time TEXT DEFAULT ''"); } catch (e) {}

  const res = await db.execute('SELECT id FROM admins WHERE username = ?', ['admin']);
  if (res.rows.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.execute('INSERT INTO admins (username, password_hash) VALUES (?, ?)', ['admin', hash]);
    console.log('Admin créé — identifiant: admin, mot de passe: admin123');
  }
}

module.exports = { db, init };
