# FamilyAmz

Application web familiale — Calendrier, Tâches, Dépenses.

## Prérequis

- Node.js 18+
- macOS / Linux (le script de démarrage utilise bash)

## Démarrage rapide

```bash
cd familyamz
./start.sh
```

Ouvrez ensuite **http://localhost:5173** dans votre navigateur.

## Comptes par défaut

| Rôle | Identifiant | Mot de passe |
|------|-------------|--------------|
| Admin | `admin` | `admin123` |

L'administrateur peut créer des comptes famille depuis l'interface.

## Architecture

```
familyamz/
├── backend/          Express + SQLite (port 3001)
│   ├── db.js         Initialisation base de données
│   ├── server.js     Serveur Express
│   ├── middleware/   JWT auth
│   └── routes/       auth, admin, members, calendar, tasks, expenses
├── frontend/         React + TypeScript + Vite (port 5173)
│   └── src/
│       ├── pages/    Calendar, Tasks, Expenses, Members, Login, Admin
│       ├── components/ Header, BottomNav, Modal
│       └── contexts/ AuthContext (JWT)
└── start.sh          Script de démarrage unique
```

## Données

La base de données SQLite est créée automatiquement dans `backend/familyamz.db`.
Toutes les données sont persistées entre les sessions.

## Production

```bash
cd frontend && npm run build
cd ../backend && node server.js
```

Le backend sert le frontend compilé sur le port 3001.
