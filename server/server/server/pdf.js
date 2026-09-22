// Generador de PDFs sin dependencias externas (PDF mínimo, texto plano formateado)
function pdfDoc(title, lines) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // ASCII-safe para fuente estándar
  let y = 780;
  let content = `BT /F1 16 Tf 50 ${y} Td (${esc(title)}) Tj ET\n`;
  y -= 30;
  for (const line of lines) {
    if (y < 60) break;
    const size = line.h ? 12 : 10;
    content += `BT /F1 ${size} Tf 50 ${y} Td (${esc(line.h ? line.h.toUpperCase() : line.t ?? '')}) Tj ET\n`;
    y -= line.h ? 22 : 15;
  }
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[5] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i <= 5; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

function loadReservation(db, id) {
  const r = db.prepare(`SELECT r.*, c.name client_name, c.phone client_phone, c.document, c.address
    FROM reservations r JOIN clients c ON c.id=r.client_id WHERE r.id=?`).get(id);
  if (!r) return null;
  r.items = db.prepare(`SELECT ri.*, e.name equipment_name FROM reservation_items ri JOIN equipment e ON e.id=ri.equipment_id WHERE ri.reservation_id=?`).all(id);
  r.payments = db.prepare('SELECT * FROM payments WHERE reservation_id=? ORDER BY created_at').all(id);
  r.inspections = db.prepare('SELECT * FROM inspections WHERE reservation_id=? ORDER BY created_at').all(id);
  return r;
}

const money = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR');

export function contractPdf(req, res, db) {
  const r = loadReservation(db, req.params.id);
  if (!r) return res.status(404).json({ error: 'Reserva no encontrada' });
  const lines = [
    { t: `Contrato N ${r.id} - Fecha de emision: ${new Date().toLocaleDateString('es-AR')}` }, { t: '' },
    { h: 'Cliente' },
    { t: `Nombre: ${r.client_name}` }, { t: `Celular: ${r.client_phone}` },
    { t: `Documento: ${r.document || '-'}` }, { t: `Direccion: ${r.address || '-'}` }, { t: '' },
    { h: 'Periodo del alquiler' },
    { t: `Retiro: ${r.start_date}    Devolucion: ${r.end_date}` }, { t: '' },
    { h: 'Equipos' },
    ...r.items.map(i => ({ t: `- ${i.equipment_name}  x${i.quantity}  (${money(i.daily_price)}/dia)` })),
    { t: '' },
    { h: 'Valores' },
    { t: `Total alquiler: ${money(r.total_price)}` },
    { t: `Garantia / deposito: ${money(r.deposit_amount)}` }, { t: '' },
    { h: 'Condiciones del alquiler' },
    { t: '1. El cliente se compromete a devolver el equipamiento en las mismas condiciones.' },
    { t: '2. Equipamiento sin seguro: ante robo, rotura o extravio el cliente abona el valor total.' },
    { t: '3. La devolucion fuera de termino genera cargos por dia adicional.' },
    { t: '4. La garantia se devuelve al verificar el estado del equipo al check-in.' }, { t: '' },
    { t: '' }, { t: '' },
    { t: 'Firma RENTAL 03: ______________________    Firma y aclaracion del cliente: ______________________' }
  ];
  sendPdf(res, `contrato-${r.id}.pdf`, pdfDoc('CONTRATO DE ALQUILER - RENTAL 03', lines));
}

export function returnPdf(req, res, db) {
  const r = loadReservation(db, req.params.id);
  if (!r) return res.status(404).json({ error: 'Reserva no encontrada' });
  const checkin = r.inspections.filter(i => i.kind === 'checkin').pop();
  const lines = [
    { t: `Comprobante de devolucion - Reserva N ${r.id}` },
    { t: `Fecha: ${new Date().toLocaleDateString('es-AR')}` }, { t: '' },
    { h: 'Cliente' },
    { t: `${r.client_name} - ${r.client_phone}` }, { t: '' },
    { h: 'Equipos devueltos' },
    ...r.items.map(i => ({ t: `- ${i.equipment_name} x${i.quantity}` })),
    { t: '' },
    { h: 'Control de devolucion' },
    { t: `Estado: ${checkin?.condition_notes || 'Sin observaciones'}` },
    { t: `Cargos por danos: ${money(checkin?.damage_amount || 0)}` },
    { t: `Inspector: ${checkin?.inspector || '-'}` }, { t: '' },
    { h: 'Garantia' },
    { t: `Deposito: ${money(r.deposit_amount)} - ${r.deposit_returned ? 'DEVUELTO al cliente' : 'PENDIENTE de devolucion'}` },
    { t: '' }, { t: '' }, { t: '' },
    { t: 'Firma RENTAL 03: ______________________    Firma del cliente: ______________________' }
  ];
  sendPdf(res, `devolucion-${r.id}.pdf`, pdfDoc('COMPROBANTE DE DEVOLUCION - RENTAL 03', lines));
}

function sendPdf(res, name, buf) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${name}"`);
  res.send(buf);
}
