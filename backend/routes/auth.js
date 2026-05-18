const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Champs requis' });
    const result = await db.execute('SELECT * FROM families WHERE identifier = ?', [identifier]);
    const family = result.rows[0];
    if (!family || !bcrypt.compareSync(password, family.password_hash)) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }
    const token = jwt.sign({ familyId: family.id, name: family.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, family: { id: family.id, identifier: family.identifier, name: family.name } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Champs requis' });
    const result = await db.execute('SELECT * FROM admins WHERE username = ?', [username]);
    const admin = result.rows[0];
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
    }
    const token = jwt.sign({ adminId: admin.id, isAdmin: true }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
