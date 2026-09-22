import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import './seed.js';
import { contractPdf, returnPdf } from './pdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '5mb' }));

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
const tokens = new Map(); // token -> { exp }
const newToken = () => {
  const t = crypto.randomBytes(24).toString('hex');
  tokens.set(t, { exp: Date.now() + 12 * 3600 * 1000 });
  return t;
};
const requireAdmin = (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const s = tokens.get(t);
  if (!s || s.exp < Date.now()) return res.status(401).json({ error: 'No autorizado' });
  next();
};

const days = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000) + 1);
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

// ---------- Auth ----------
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  const stored = db.prepare('SELECT value FROM settings WHERE key=?').get('admin_password_hash');
  if (stored && hash(String(password || '')) === stored.value) return res.json({ token: newToken() });
  res.status(401).json({ error: 'Contraseña incorrecta' });
});
app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 4) return res.status(400).json({ error: 'Mínimo 4 caracteres' });
  db.prepare('UPDATE settings SET value=? WHERE key=?').run(hash(String(password)), 'admin_password_hash');
  res.json({ ok: true });
});

// ---------- Equipment (público) ----------
app.get('/api/equipment', (req, res) => {
  const rows = db.prepare('SELECT * FROM equipment WHERE active=1 ORDER BY category, name').all();
  res.json(rows);
});

app.get('/api/availability', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start y end requeridos' });
  const eq = db.prepare('SELECT id, name, stock FROM equipment WHERE active=1').all();
  const out = db.prepare(`
    SELECT ri.equipment_id eid, SUM(ri.quantity) q FROM reservation_items ri
    JOIN reservations r ON r.id=ri.reservation_id
    WHERE r.status IN ('pending','confirmed','out') AND NOT (r.end_date < ? OR r.start_date > ?)
    GROUP BY ri.equipment_id`).all(start, end);
  const map = Object.fromEntries(out.map(o => [o.eid, o.q]));
  res.json(eq.map(e => ({ id: e.id, name: e.name, stock: e.stock, reserved: map[e.id] || 0, available: e.stock - (map[e.id] || 0) })));
});

// ---------- Reservations (cliente público) ----------
app.post('/api/reservations', (req, res) => {
  const { client, items, start_date, end_date, notes } = req.body || {};
  if (!client?.name || !client?.phone) return res.status(400).json({ error: 'Nombre y celular del cliente requeridos' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Sin equipos' });
  if (!start_date || !end_date || end_date < start_date) return res.status(400).json({ error: 'Fechas inválidas' });

  // verificar disponibilidad
  for (const it of items) {
    const eq = db.prepare('SELECT stock FROM equipment WHERE id=? AND active=1').get(it.equipment_id);
    if (!eq) return res.status(400).json({ error: 'Equipo no encontrado: ' + it.equipment_id });
    const q = db.prepare(`SELECT COALESCE(SUM(ri.quantity),0) q FROM reservation_items ri
      JOIN reservations r ON r.id=ri.reservation_id
      WHERE r.status IN ('pending','confirmed','out') AND NOT (r.end_date < ? OR r.start_date > ?) AND ri.equipment_id=?`)
      .get(start_date, end_date, it.equipment_id).q;
    if (q + it.quantity > eq.stock) return res.status(409).json({ error: `Sin stock suficiente para el equipo #${it.equipment_id} en esas fechas` });
  }

  const result = db.transaction(() => {
    let c = db.prepare('SELECT id FROM clients WHERE phone=?').get(String(client.phone).trim());
    if (!c) {
      c = { id: db.prepare('INSERT INTO clients (name,phone,email,document,address) VALUES (?,?,?,?,?)')
        .run(client.name, String(client.phone).trim(), client.email || '', client.document || '', client.address || '').lastInsertRowid };
    }
    const d = days(start_date, end_date);
    let total = 0, dep = 0;
    const prices = items.map(it => {
      const eq = db.prepare('SELECT daily_price, deposit FROM equipment WHERE id=?').get(it.equipment_id);
      total += eq.daily_price * it.quantity * d;
      dep += eq.deposit * it.quantity;
      return eq.daily_price;
    });
    const rid = db.prepare(`INSERT INTO reservations (client_id,status,start_date,end_date,notes,total_price,deposit_amount)
      VALUES (?,?,?,?,?,?,?)`).run(c.id, 'pending', start_date, end_date, notes || '', total, dep).lastInsertRowid;
    const ins = db.prepare('INSERT INTO reservation_items (reservation_id,equipment_id,quantity,daily_price) VALUES (?,?,?,?)');
    items.forEach((it, i) => ins.run(rid, it.equipment_id, it.quantity, prices[i]));
    return rid;
  })();
  res.status(201).json({ id: result });
});

// ---------- Admin: datos generales ----------
app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const today = todayStr();
  const row = (sql, ...p) => db.prepare(sql).all(...p);
  res.json({
    equipment: row('SELECT * FROM equipment WHERE active=1 ORDER BY category,name'),
    reservations: row(`SELECT r.*, c.name client_name, c.phone client_phone FROM reservations r JOIN clients c ON c.id=r.client_id ORDER BY r.start_date DESC LIMIT 200`),
    items: row(`SELECT ri.*, e.name equipment_name FROM reservation_items ri JOIN equipment e ON e.id=ri.equipment_id`),
    payments: row(`SELECT p.* FROM payments p ORDER BY p.created_at DESC LIMIT 500`),
    inspections: row('SELECT * FROM inspections ORDER BY created_at DESC LIMIT 300'),
    clients: row('SELECT * FROM clients ORDER BY name'),
    today
  });
});

// Logística: qué se retira, qué está afuera, devoluciones
app.get('/api/admin/logistics', requireAdmin, (req, res) => {
  const t = todayStr(), tomorrow = addDays(t, 1), after = addDays(t, 2);
  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const detail = `SELECT r.*, c.name client_name, c.phone client_phone,
    (SELECT json_group_array(json_object('name',e.name,'qty',ri.quantity)) FROM reservation_items ri JOIN equipment e ON e.id=ri.equipment_id WHERE ri.reservation_id=r.id) items_json
    FROM reservations r JOIN clients c ON c.id=r.client_id`;
  res.json({
    today: t, tomorrow, after_tomorrow: after,
    pickups: {
      today: q(`${detail} WHERE r.start_date = ? AND r.status IN ('pending','confirmed')`, t),
      tomorrow: q(`${detail} WHERE r.start_date = ? AND r.status IN ('pending','confirmed')`, tomorrow),
      after_tomorrow: q(`${detail} WHERE r.start_date = ? AND r.status IN ('pending','confirmed')`, after)
    },
    out_now: q(`${detail} WHERE r.status='out' ORDER BY r.end_date`),
    returns: {
      today: q(`${detail} WHERE r.end_date = ? AND r.status='out'`, t),
      tomorrow: q(`${detail} WHERE r.end_date = ? AND r.status='out'`, tomorrow),
      after_tomorrow: q(`${detail} WHERE r.end_date = ? AND r.status='out'`, after)
    },
    overdue: q(`${detail} WHERE r.end_date < ? AND r.status='out' ORDER BY r.end_date`, t)
  });
});

// ---------- Admin: equipos ----------
app.post('/api/admin/equipment', requireAdmin, (req, res) => {
  const { name, category, description, brand, daily_price, stock, deposit, photo_url } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const id = db.prepare(`INSERT INTO equipment (name,category,description,brand,daily_price,stock,deposit,photo_url)
    VALUES (?,?,?,?,?,?,?,?)`).run(name, category || 'General', description || '', brand || '',
    Number(daily_price) || 0, Number(stock) || 1, Number(deposit) || 0, photo_url || '').lastInsertRowid;
  res.status(201).json({ id });
});
app.put('/api/admin/equipment/:id', requireAdmin, (req, res) => {
  const { name, category, description, brand, daily_price, stock, deposit, photo_url } = req.body || {};
  db.prepare(`UPDATE equipment SET name=?,category=?,description=?,brand=?,daily_price=?,stock=?,deposit=?,photo_url=? WHERE id=?`)
    .run(name, category, description, brand, Number(daily_price) || 0, Number(stock) || 1, Number(deposit) || 0, photo_url || '', req.params.id);
  res.json({ ok: true });
});
app.delete('/api/admin/equipment/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE equipment SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Admin: reservas ----------
app.put('/api/admin/reservations/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['pending', 'confirmed', 'out', 'returned', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  db.prepare('UPDATE reservations SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ ok: true });
});
app.post('/api/admin/reservations/:id/payments', requireAdmin, (req, res) => {
  const { type, amount, method, notes } = req.body || {};
  if (!amount) return res.status(400).json({ error: 'Monto requerido' });
  const id = db.prepare('INSERT INTO payments (reservation_id,type,amount,method,notes) VALUES (?,?,?,?,?)')
    .run(req.params.id, type || 'payment', Number(amount), method || 'efectivo', notes || '').lastInsertRowid;
  res.status(201).json({ id });
});
app.post('/api/admin/reservations/:id/inspection', requireAdmin, (req, res) => {
  const { kind, condition_notes, damage_amount, inspector } = req.body || {};
  if (!['checkout', 'checkin'].includes(kind)) return res.status(400).json({ error: 'kind inválido' });
  const id = db.prepare('INSERT INTO inspections (reservation_id,kind,condition_notes,damage_amount,inspector) VALUES (?,?,?,?,?)')
    .run(req.params.id, kind, condition_notes || '', Number(damage_amount) || 0, inspector || '').lastInsertRowid;
  res.status(201).json({ id });
});
app.put('/api/admin/reservations/:id/deposit', requireAdmin, (req, res) => {
  db.prepare('UPDATE reservations SET deposit_returned=? WHERE id=?').run(req.body?.returned ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

// ---------- Admin: clientes ----------
app.put('/api/admin/clients/:id', requireAdmin, (req, res) => {
  const { name, phone, email, document, address, notes } = req.body || {};
  db.prepare('UPDATE clients SET name=?,phone=?,email=?,document=?,address=?,notes=? WHERE id=?')
    .run(name, phone, email || '', document || '', address || '', notes || '', req.params.id);
  res.json({ ok: true });
});

// ---------- PDFs ----------
app.get('/api/admin/reservations/:id/contract.pdf', requireAdmin, (req, res) => contractPdf(req, res, db));
app.get('/api/admin/reservations/:id/return.pdf', requireAdmin, (req, res) => returnPdf(req, res, db));

// ---------- Static ----------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RENTAL 03 corriendo en http://localhost:${PORT}`));
