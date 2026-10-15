# Ghadimi Amlak

## Render / Host env
```
NODE_ENV=production
NODE_VERSION=20
JWT_SECRET=your-long-secret
ADMIN1_USERNAME=admin1
ADMIN1_PASSWORD=Admin@123456
ADMIN2_USERNAME=admin2
ADMIN2_PASSWORD=Admin@654321
```

Start: `node server.js`
Admin: `/admin/login`

## Data note
SQLite file is in `db/amlak.db`. On free Render the disk can reset on redeploy/sleep.
On a real VPS/host, data persists with the server files.
