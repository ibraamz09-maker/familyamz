const express = require('express');
const cors = require('cors');
const path = require('path');
const { init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/members', require('./routes/members'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/receipts', require('./routes/receipts'));
app.use('/api/lists', require('./routes/lists'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/push', require('./routes/push'));

// Diagnostic connexion base de données
app.get('/api/health', async (req, res) => {
  try {
    const { db } = require('./db');
    await db.execute('SELECT 1');
    const url = process.env.TURSO_DATABASE_URL || '';
    res.json({
      ok: true,
      db: url.startsWith('libsql://') ? 'turso' : 'sqlite-local',
      token: !!process.env.TURSO_AUTH_TOKEN,
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

init().then(() => {
  app.listen(PORT, () => {
    console.log(`FamilyAmz backend sur http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Erreur initialisation base de données:', err);
  process.exit(1);
});
