import db from './db.js';
import crypto from 'crypto';

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');

const adminExists = db.prepare('SELECT value FROM settings WHERE key=?').get('admin_password_hash');
if (!adminExists) {
  db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('admin_password_hash', hash('rental03'));
  console.log('Admin password inicial: rental03  (cambiala con POST /api/admin/password)');
}

const count = db.prepare('SELECT COUNT(*) c FROM equipment').get().c;
if (count === 0) {
  const ins = db.prepare(`INSERT INTO equipment (name,category,description,brand,daily_price,stock,deposit,photo_url)
    VALUES (?,?,?,?,?,?,?,?)`);
  const demo = [
    ['Sony A7 IV', 'Cámaras', 'Cámara mirrorless full-frame 33MP, video 4K60', 'Sony', 45000, 2, 300000, ''],
    ['Canon EOS R5 C', 'Cámaras', 'Cinema camera híbrida 8K RAW', 'Canon', 65000, 1, 450000, ''],
    ['Sony FE 24-70mm f/2.8 GM II', 'Lentes', 'Zoom estándar profesional G Master', 'Sony', 18000, 3, 120000, ''],
    ['Canon RF 85mm f/1.2 L', 'Lentes', 'Prime retrato luminoso', 'Canon', 20000, 2, 130000, ''],
    ['DJI RS 4 Pro', 'Estabilización', 'Gimbal profesional 4.5kg payload', 'DJI', 22000, 2, 150000, ''],
    ['Aputure 600d Pro', 'Iluminación', 'LED COB 600W con balastro V-Mount', 'Aputure', 25000, 3, 180000, ''],
    ['Amaran 300c', 'Iluminación', 'LED RGBWW full color 300W', 'Amaran', 18000, 4, 100000, ''],
    ['Sennheiser MKH 416', 'Audio', 'Micrófono shotgun broadcast', 'Sennheiser', 12000, 2, 80000, ''],
    ['DJI Mic 2 (2TX)', 'Audio', 'Sistema inalámbrico dual con grabación 32bit', 'DJI', 10000, 3, 60000, ''],
    ['Monitor Atomos Ninja V', 'Monitoreo', 'Monitor/grabador 5" HDR 4K ProRes', 'Atomos', 15000, 2, 90000, ''],
    ['Trípode Sachtler Flowtech 75', 'Soporte', 'Trípode fibra de carbono con cabezal fluido', 'Sachtler', 9000, 4, 55000, ''],
    ['Kit Rodo Cine 4x5.6', 'Filtros', 'Portafiltros + ND 0.6/0.9/1.2 + polarizador', 'Tiffen', 11000, 2, 70000, '']
  ];
  const t = db.transaction((rows) => rows.forEach(r => ins.run(...r)));
  t(demo);
  console.log('Datos de ejemplo cargados: 12 equipos.');
}
