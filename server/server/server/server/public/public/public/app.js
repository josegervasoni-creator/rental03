/* RENTAL 03 — SPA (vainilla JS) */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = n => '$ ' + Number(n || 0).toLocaleString('es-AR');
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const api = async (url, opts = {}) => {
  opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const t = localStorage.getItem('r03_token');
  if (t) opts.headers.Authorization = 'Bearer ' + t;
  const r = await fetch(url, opts);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Error ' + r.status); }
  return r.json();
};
const toast = (msg, err) => {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
};
const STATUS = { pending: 'Pendiente', confirmed: 'Confirmada', out: 'En alquiler', returned: 'Devuelta', cancelled: 'Cancelada' };
const WA_PHONE = () => localStorage.getItem('r03_wa') || '';
const waLink = (phone, text) => {
  const base = WA_PHONE() || String(phone || '').replace(/\D/g, '');
  return `https://wa.me/${base}?text=${encodeURIComponent(text)}`;
};

const state = { view: 'catalog', equipment: [], cart: [], admin: null, logistics: null, filters: { cat: '', q: '' } };

async function init() {
  render();
  await loadEquipment();
}
async function loadEquipment() {
  state.equipment = await api('/api/equipment');
  render();
}

function render() {
  const app = $('#app');
  app.innerHTML = `
    <header><div class="header-inner">
      <a class="logo" href="#" onclick="go('catalog');return false">RENTAL <span>03</span></a>
      <nav>
        <a href="#" class="${state.view === 'catalog' ? 'active' : ''}" onclick="go('catalog');return false">Catálogo</a>
        <a href="#" class="${state.view === 'admin' ? 'active' : ''}" onclick="go('admin');return false">Administración</a>
      </nav>
    </div></header>
    <main id="main"></main>
    <div class="cart-bar ${state.cart.length ? 'show' : ''}" id="cartbar"></div>
    <div class="modal-bg" id="modal"></div>`;
  if (state.view === 'catalog') renderCatalog();
  else renderAdmin();
  renderCartBar();
}
window.go = (v) => { state.view = v; render(); };

/* ============ CATÁLOGO ============ */
function renderCatalog() {
  const m = $('#main');
  const cats = [...new Set(state.equipment.map(e => e.category))].sort();
  const f = state.filters;
  const list = state.equipment.filter(e =>
    (!f.cat || e.category === f.cat) &&
    (!f.q || (e.name + ' ' + (e.brand || '') + ' ' + (e.description || '')).toLowerCase().includes(f.q.toLowerCase())));
  m.innerHTML = `
    <div class="hero">
      <h1>Alquiler de equipos de <span>cine & fotografía</span></h1>
      <p>Equipamiento profesional verificado antes de cada entrega. Reservá online y coordinamos el retiro por WhatsApp.</p>
    </div>
    <div class="flex" style="margin-bottom:20px">
      <input style="max-width:280px" placeholder="Buscar equipo..." value="${f.q}" oninput="state.filters.q=this.value;renderCatalog()">
      <select style="max-width:200px" onchange="state.filters.cat=this.value;renderCatalog()">
        <option value="">Todas las categorías</option>
        ${cats.map(c => `<option ${f.cat === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <label style="margin:0">Desde <input type="date" style="width:auto" id="f_start" value="${state.range?.start || todayStr()}"></label>
      <label style="margin:0">Hasta <input type="date" style="width:auto" id="f_end" value="${state.range?.end || addDays(todayStr(), 2)}"></label>
      <button class="btn-ghost" onclick="checkAvail()">Ver disponibilidad</button>
    </div>
    <div class="eq-grid">
      ${list.map(e => {
        const av = state.avail?.find(a => a.id === e.id);
        const availTxt = av ? (av.available > 1 ? `${av.available} disp.` : av.available === 1 ? '1 disp.' : 'Sin stock') : `${e.stock} en stock`;
        const cls = av ? (av.available > 1 ? '' : av.available === 1 ? 'low' : 'none') : '';
        return `<div class="eq-card">
          <div class="eq-photo">${e.photo_url ? `<img src="${e.photo_url}" alt="">` : '🎥'}</div>
          <div class="eq-body">
            <div class="eq-cat">${e.category}${e.brand ? ' · ' + e.brand : ''}</div>
            <div class="eq-name">${e.name}</div>
            <div class="eq-desc">${e.description || ''}</div>
            <div class="eq-foot">
              <div class="eq-price">${money(e.daily_price)}<small>/día</small></div>
              <span class="avail ${cls}">${availTxt}</span>
            </div>
            <button class="btn-primary" onclick="addToCart(${e.id})">Agregar a la reserva</button>
          </div>
        </div>`;
      }).join('') || '<div class="empty">Sin resultados</div>'}
    </div>`;
}
window.checkAvail = async () => {
  const start = $('#f_start').value, end = $('#f_end').value;
  if (!start || !end || end < start) return toast('Rango de fechas inválido', true);
  state.range = { start, end };
  state.avail = await api(`/api/availability?start=${start}&end=${end}`);
  renderCatalog();
  toast('Disponibilidad actualizada');
};
window.addToCart = (id) => {
  if (!state.cart.includes(id)) state.cart.push(id);
  renderCartBar();
  toast('Equipo agregado a la reserva');
};
window.removeFromCart = (id) => { state.cart = state.cart.filter(x => x !== id); renderCartBar(); };

function renderCartBar() {
  const bar = $('#cartbar');
  if (!bar) return;
  const items = state.cart.map(id => state.equipment.find(e => e.id === id)).filter(Boolean);
  bar.className = 'cart-bar' + (items.length ? ' show' : '');
  bar.innerHTML = items.length ? `<div class="cart-inner">
    <strong>Reserva: ${items.length} equipo(s)</strong>
    <span class="muted">${items.map(i => i.name).join(' · ')}</span>
    <span class="spacer"></span>
    <button class="btn-ghost btn-sm" onclick="state.cart=[];renderCartBar()">Vaciar</button>
    <button class="btn-primary" onclick="openCheckout()">Completar reserva</button>
  </div>` : '';
}

window.openCheckout = () => {
  const items = state.cart.map(id => state.equipment.find(e => e.id === id)).filter(Boolean);
  const start = state.range?.start || todayStr(), end = state.range?.end || addDays(todayStr(), 2);
  openModal(`
    <button class="close-x" onclick="closeModal()">×</button>
    <h2>Completar reserva</h2>
    <p class="muted">${items.map(i => i.name).join(' · ')}</p>
    <div class="form-row">
      <div><label>Retiro</label><input type="date" id="r_start" value="${start}"></div>
      <div><label>Devolución</label><input type="date" id="r_end" value="${end}"></div>
    </div>
    <div class="form-row">
      <div><label>Nombre y apellido *</label><input id="r_name"></div>
      <div><label>Celular (WhatsApp) *</label><input id="r_phone" placeholder="Ej: 54911..."></div>
    </div>
    <div class="form-row">
      <div><label>Email</label><input id="r_email"></div>
      <div><label>Documento</label><input id="r_doc"></div>
    </div>
    <label>Dirección</label><input id="r_addr">
    <label>Notas</label><textarea id="r_notes" rows="2"></textarea>
    <div class="mt flex">
      <button class="btn-primary" onclick="submitReservation()">Confirmar reserva</button>
    </div>`);
};
window.submitReservation = async () => {
  try {
    const body = {
      client: { name: $('#r_name').value.trim(), phone: $('#r_phone').value.trim(), email: $('#r_email').value.trim(), document: $('#r_doc').value.trim(), address: $('#r_addr').value.trim() },
      items: state.cart.map(id => ({ equipment_id: id, quantity: 1 })),
      start_date: $('#r_start').value, end_date: $('#r_end').value, notes: $('#r_notes').value.trim()
    };
    const r = await api('/api/reservations', { method: 'POST', body: JSON.stringify(body) });
    state.cart = [];
    closeModal();
    toast('Reserva creada. Nº ' + r.id);
    openModal(`<button class="close-x" onclick="closeModal()">×</button>
      <h2>Reserva recibida</h2>
      <p>Tu número de reserva es <strong>#${r.id}</strong>.</p>
      <p class="muted mt">Te contactamos por WhatsApp para coordinar la seña y el retiro.</p>
      <div class="mt"><a class="btn btn-primary" target="_blank" href="${waLink('', `Hola, hice la reserva #${r.id} en RENTAL 03`)}">Avisar por WhatsApp</a></div>`);
  } catch (e) { toast(e.message, true); }
};

/* ============ MODAL ============ */
window.openModal = (html) => { const m = $('#modal'); m.innerHTML = `<div class="modal">${html}</div>`; m.classList.add('show'); };
window.closeModal = () => $('#modal').classList.remove('show');

/* ============ ADMIN ============ */
let adminTab = 'logistics';
async function renderAdmin() {
  const m = $('#main');
  if (!localStorage.getItem('r03_token')) {
    m.innerHTML = `<div class="card login-box">
      <h2>Acceso administración</h2>
      <label>Contraseña</label><input type="password" id="pw" onkeydown="if(event.key==='Enter')login()">
      <div class="mt"><button class="btn-primary" onclick="login()">Ingresar</button></div>
      <p class="muted mt" style="font-size:12px">Contraseña inicial: rental03</p>
    </div>`;
    return;
  }
  if (!state.admin) {
    m.innerHTML = '<div class="empty">Cargando...</div>';
    [state.admin, state.logistics] = await Promise.all([
      api('/api/admin/dashboard'), api('/api/admin/logistics')
    ]).catch(e => { if (e.message.includes('401')) { localStorage.removeItem('r03_token'); } toast(e.message, true); renderAdmin(); return [null, null]; });
    if (!state.admin) return;
  }
  const d = state.admin;
  m.innerHTML = `
    <div class="flex mt">
      <h1 style="font-size:26px">Panel de administración</h1>
      <span class="spacer" style="margin-left:auto"></span>
      <button class="btn-ghost btn-sm" onclick="logout()">Salir</button>
    </div>
    <div class="tabs mt">
      ${[['logistics', 'Logística'], ['reservations', 'Reservas'], ['equipment', 'Equipos'], ['clients', 'Clientes'], ['calendar', 'Calendario'], ['settings', 'Ajustes']]
        .map(([k, l]) => `<button class="${adminTab === k ? 'active' : ''}" onclick="setTab('${k}')">${l}</button>`).join('')}
    </div>
    <div id="tabcontent"></div>`;
  ({ logistics: renderLogistics, reservations: renderReservations, equipment: renderEquipment, clients: renderClients, calendar: renderCalendar, settings: renderSettings })[adminTab]();
}
window.setTab = (t) => { adminTab = t; state.admin && renderAdmin(); };
window.refreshAdmin = async () => { state.admin = null; await renderAdmin(); };
window.login = async () => {
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) });
    localStorage.setItem('r03_token', r.token);
    state.admin = null; renderAdmin();
  } catch (e) { toast(e.message, true); }
};
window.logout = () => { localStorage.removeItem('r03_token'); state.admin = null; renderAdmin(); };

/* ---- Logística ---- */
function logCard(r, cls, actions) {
  const items = JSON.parse(r.items_json || '[]').map(i => `${i.name} x${i.qty}`).join(' · ');
  return `<div class="log-card ${cls}">
    <div class="who">${r.client_name} <span class="muted">· ${r.client_phone}</span></div>
    <div class="what">${items}</div>
    <div class="what">#${r.id} · ${r.start_date} → ${r.end_date} · ${STATUS[r.status]}</div>
    <div class="actions">${actions(r)}</div>
  </div>`;
}
const waBtn = (r, msg) => `<a class="btn btn-ok btn-sm" target="_blank" href="${waLink(r.client_phone, msg)}">WhatsApp</a>`;

function renderLogistics() {
  const L = state.logistics, c = $('#tabcontent');
  const coord = r => waBtn(r, `Hola ${r.client_name}, te escribimos de RENTAL 03 para coordinar el retiro de tu reserva #${r.id}.`);
  const remind = r => waBtn(r, `Hola ${r.client_name}, te recordamos que la devolución de tu alquiler #${r.id} vence el ${r.end_date}.`);
  const late = r => waBtn(r, `Hola ${r.client_name}, tu alquiler #${r.id} está vencido desde el ${r.end_date}. Por favor contactanos para la devolución.`);
  c.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="num">${L.out_now.length}</div><div class="lbl">Equipos afuera ahora</div></div>
      <div class="stat"><div class="num">${L.pickups.tomorrow.length}</div><div class="lbl">Retiros mañana</div></div>
      <div class="stat"><div class="num">${L.returns.tomorrow.length}</div><div class="lbl">Devoluciones mañana</div></div>
      <div class="stat"><div class="num" style="color:var(--danger)">${L.overdue.length}</div><div class="lbl">Atrasados</div></div>
    </div>
    <div class="log-grid">
      <div class="log-col"><h3>Retiros — hoy</h3>
        ${L.pickups.today.map(r => logCard(r, 'warn', coord)).join('') || '<div class="empty">Nada para hoy</div>'}</div>
      <div class="log-col"><h3>Retiros — mañana</h3>
        ${L.pickups.tomorrow.map(r => logCard(r, 'ok', coord)).join('') || '<div class="empty">Nada para mañana</div>'}</div>
      <div class="log-col"><h3>Retiros — pasado mañana</h3>
        ${L.pickups.after_tomorrow.map(r => logCard(r, 'ok', coord)).join('') || '<div class="empty">Nada</div>'}</div>
      <div class="log-col"><h3>Devoluciones — hoy</h3>
        ${L.returns.today.map(r => logCard(r, 'warn', remind)).join('') || '<div class="empty">Nada para hoy</div>'}</div>
      <div class="log-col"><h3>Devoluciones — mañana / pasado</h3>
        ${[...L.returns.tomorrow, ...L.returns.after_tomorrow].map(r => logCard(r, 'ok', remind)).join('') || '<div class="empty">Nada</div>'}</div>
      <div class="log-col"><h3 style="color:var(--danger)">Atrasados — debe volver</h3>
        ${L.overdue.map(r => logCard(r, 'danger', late)).join('') || '<div class="empty">Sin atrasos</div>'}</div>
    </div>
    <div class="section-title">Todo lo que está afuera (${L.out_now.length})</div>
    ${L.out_now.map(r => logCard(r, new Date(r.end_date) < new Date(L.today) ? 'danger' : '', remind)).join('') || '<div class="empty">Nada afuera</div>'}`;
}

/* ---- Reservas ---- */
function renderReservations() {
  const d = state.admin, c = $('#tabcontent');
  const itemsOf = id => d.items.filter(i => i.reservation_id === id);
  const paidOf = id => d.payments.filter(p => p.reservation_id === id && p.type !== 'refund').reduce((s, p) => s + p.amount, 0);
  c.innerHTML = `<div class="card"><table>
    <tr><th>#</th><th>Cliente</th><th>Equipos</th><th>Fechas</th><th>Total</th><th>Pagado</th><th>Estado</th><th></th></tr>
    ${d.reservations.map(r => {
      const its = itemsOf(r.id).map(i => `${i.equipment_name} x${i.quantity}`).join(', ');
      return `<tr>
        <td>${r.id}</td>
        <td><strong>${r.client_name}</strong><br><span class="muted">${r.client_phone}</span></td>
        <td style="max-width:220px">${its}</td>
        <td>${r.start_date} → ${r.end_date}</td>
        <td>${money(r.total_price)}</td>
        <td>${money(paidOf(r.id))}</td>
        <td><span class="badge b-${r.status}">${STATUS[r.status]}</span></td>
        <td><button class="btn-ghost btn-sm" onclick="openReservation(${r.id})">Gestionar</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">Sin reservas aún</td></tr>'}
  </table></div>`;
}
window.openReservation = (id) => {
  const d = state.admin;
  const r = d.reservations.find(x => x.id === id);
  const its = d.items.filter(i => i.reservation_id === id);
  const pays = d.payments.filter(p => p.reservation_id === id);
  const insps = d.inspections.filter(i => i.reservation_id === id);
  openModal(`<button class="close-x" onclick="closeModal()">×</button>
    <h2>Reserva #${r.id} — ${r.client_name}</h2>
    <p class="muted">${r.client_phone} · ${r.start_date} → ${r.end_date}</p>
    <p class="mt">${its.map(i => `<span class="badge b-confirmed">${i.equipment_name} x${i.quantity}</span>`).join(' ')}</p>
    <p class="mt">Total: <strong>${money(r.total_price)}</strong> · Garantía: ${money(r.deposit_amount)} ${r.deposit_returned ? '<span class="badge b-returned">devuelta</span>' : ''}</p>
    <div class="mt flex">
      <label style="margin:0">Estado:</label>
      <select style="width:auto" onchange="setStatus(${r.id}, this.value)">
        ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      <a class="btn btn-ghost btn-sm" href="#" onclick="return pdfAuth(event,${r.id},'contract')">Contrato PDF</a>
      <a class="btn btn-ghost btn-sm" href="#" onclick="return pdfAuth(event,${r.id},'return')">Devolución PDF</a>
    </div>
    <div class="section-title" style="font-size:16px">Pagos y señas</div>
    ${pays.map(p => `<p class="muted">${p.created_at.slice(0, 16)} — ${p.type}: <strong style="color:var(--text)">${money(p.amount)}</strong> (${p.method})</p>`).join('') || '<p class="muted">Sin pagos</p>'}
    <div class="form-row mt">
      <div><label>Tipo</label><select id="pay_type"><option value="sena">Seña</option><option value="payment">Pago</option><option value="deposit">Garantía</option><option value="refund">Reintegro</option></select></div>
      <div><label>Monto</label><input type="number" id="pay_amount"></div>
    </div>
    <div class="form-row">
      <div><label>Método</label><select id="pay_method"><option>efectivo</option><option>transferencia</option><option>tarjeta</option><option>mercadopago</option></select></div>
      <div><label>Nota</label><input id="pay_note"></div>
    </div>
    <button class="btn-primary mt" onclick="addPayment(${r.id})">Aplicar pago</button>
    <div class="section-title" style="font-size:16px">Control de entrega / devolución</div>
    ${insps.map(i => `<p class="muted">${i.created_at.slice(0, 16)} — ${i.kind === 'checkout' ? 'Entrega' : 'Devolución'}: ${i.condition_notes || 'OK'} ${i.damage_amount ? '· daños ' + money(i.damage_amount) : ''}</p>`).join('') || '<p class="muted">Sin controles</p>'}
    <div class="form-row mt">
      <div><label>Tipo de control</label><select id="insp_kind"><option value="checkout">Entrega</option><option value="checkin">Devolución</option></select></div>
      <div><label>Daños ($)</label><input type="number" id="insp_damage" value="0"></div>
    </div>
    <label>Observaciones del estado del equipo</label><textarea id="insp_notes" rows="2"></textarea>
    <div class="flex mt">
      <button class="btn-info" onclick="addInspection(${r.id})">Registrar control</button>
      ${!r.deposit_returned ? `<button class="btn-ok" onclick="returnDeposit(${r.id})">Devolver garantía</button>` : ''}
      <a class="btn btn-ok" target="_blank" href="${waLink(r.client_phone, `Hola ${r.client_name}, sobre tu reserva #${r.id} de RENTAL 03: `)}">WhatsApp</a>
    </div>`);
};
window.pdfAuth = async (ev, id, kind) => {
  ev.preventDefault();
  const r = await fetch(`/api/admin/reservations/${id}/${kind}.pdf`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('r03_token') } });
  const blob = await r.blob();
  window.open(URL.createObjectURL(blob), '_blank');
  return false;
};
window.setStatus = async (id, status) => { await api(`/api/admin/reservations/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); toast('Estado actualizado'); await refreshAdmin(); closeModal(); };
window.addPayment = async (id) => {
  await api(`/api/admin/reservations/${id}/payments`, { method: 'POST', body: JSON.stringify({ type: $('#pay_type').value, amount: $('#pay_amount').value, method: $('#pay_method').value, notes: $('#pay_note').value }) });
  toast('Pago registrado'); await refreshAdmin(); closeModal();
};
window.addInspection = async (id) => {
  await api(`/api/admin/reservations/${id}/inspection`, { method: 'POST', body: JSON.stringify({ kind: $('#insp_kind').value, condition_notes: $('#insp_notes').value, damage_amount: $('#insp_damage').value }) });
  toast('Control registrado'); await refreshAdmin(); closeModal();
};
window.returnDeposit = async (id) => {
  await api(`/api/admin/reservations/${id}/deposit`, { method: 'PUT', body: JSON.stringify({ returned: true }) });
  toast('Garantía marcada como devuelta'); await refreshAdmin(); closeModal();
};

/* ---- Equipos ---- */
function renderEquipment() {
  const d = state.admin, c = $('#tabcontent');
  c.innerHTML = `
    <div class="flex" style="margin-bottom:14px">
      <button class="btn-primary" onclick="editEquipment()">+ Nuevo equipo</button>
    </div>
    <div class="card"><table>
      <tr><th>Equipo</th><th>Categoría</th><th>Precio/día</th><th>Stock</th><th>Garantía</th><th></th></tr>
      ${d.equipment.map(e => `<tr>
        <td><strong>${e.name}</strong><br><span class="muted">${e.brand || ''}</span></td>
        <td>${e.category}</td><td>${money(e.daily_price)}</td><td>${e.stock}</td><td>${money(e.deposit)}</td>
        <td><button class="btn-ghost btn-sm" onclick="editEquipment(${e.id})">Editar</button>
            <button class="btn-danger btn-sm" onclick="delEquipment(${e.id})">Baja</button></td>
      </tr>`).join('')}
    </table></div>`;
}
window.editEquipment = (id) => {
  const e = id ? state.admin.equipment.find(x => x.id === id) : {};
  openModal(`<button class="close-x" onclick="closeModal()">×</button>
    <h2>${id ? 'Editar' : 'Nuevo'} equipo</h2>
    <label>Nombre *</label><input id="eq_name" value="${e.name || ''}">
    <div class="form-row">
      <div><label>Categoría</label><input id="eq_cat" value="${e.category || ''}"></div>
      <div><label>Marca</label><input id="eq_brand" value="${e.brand || ''}"></div>
    </div>
    <label>Descripción</label><textarea id="eq_desc" rows="2">${e.description || ''}</textarea>
    <div class="form-row">
      <div><label>Precio por día</label><input type="number" id="eq_price" value="${e.daily_price || ''}"></div>
      <div><label>Stock</label><input type="number" id="eq_stock" value="${e.stock ?? 1}"></div>
    </div>
    <div class="form-row">
      <div><label>Garantía / depósito</label><input type="number" id="eq_deposit" value="${e.deposit || 0}"></div>
      <div><label>Foto (URL)</label><input id="eq_photo" value="${e.photo_url || ''}"></div>
    </div>
    <div class="mt"><button class="btn-primary" onclick="saveEquipment(${id || 0})">Guardar</button></div>`);
};
window.saveEquipment = async (id) => {
  const body = { name: $('#eq_name').value, category: $('#eq_cat').value, brand: $('#eq_brand').value, description: $('#eq_desc').value, daily_price: $('#eq_price').value, stock: $('#eq_stock').value, deposit: $('#eq_deposit').value, photo_url: $('#eq_photo').value };
  await api('/api/admin/equipment' + (id ? '/' + id : ''), { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
  toast('Equipo guardado'); closeModal(); await refreshAdmin();
};
window.delEquipment = async (id) => {
  if (!confirm('¿Dar de baja este equipo?')) return;
  await api('/api/admin/equipment/' + id, { method: 'DELETE' });
  toast('Equipo dado de baja'); await refreshAdmin();
};

/* ---- Clientes ---- */
function renderClients() {
  const d = state.admin, c = $('#tabcontent');
  c.innerHTML = `<div class="card"><table>
    <tr><th>Nombre</th><th>Celular</th><th>Email</th><th>Documento</th><th>Reservas</th><th></th></tr>
    ${d.clients.map(cl => `<tr>
      <td><strong>${cl.name}</strong></td><td>${cl.phone}</td><td>${cl.email || '-'}</td><td>${cl.document || '-'}</td>
      <td>${d.reservations.filter(r => r.client_id === cl.id).length}</td>
      <td><a class="btn btn-ok btn-sm" target="_blank" href="${waLink(cl.phone, 'Hola ' + cl.name + ', te escribimos de RENTAL 03.')}">WhatsApp</a></td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty">Sin clientes</td></tr>'}
  </table></div>`;
}

/* ---- Calendario ---- */
function renderCalendar() {
  const d = state.admin, c = $('#tabcontent');
  const start = todayStr();
  const daysArr = Array.from({ length: 31 }, (_, i) => addDays(start, i));
  c.innerHTML = `<p class="muted" style="margin-bottom:12px">Ocupación por equipo — próximos 31 días (dorado = reservado/afuera, borde celeste = hoy)</p>
  <div class="card cal"><div class="cal-grid">
    <div class="cal-head"></div>${daysArr.map(dd => `<div class="cal-head">${dd.slice(8)}<br>${['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(dd + 'T12:00:00').getDay()]}</div>`).join('')}
    ${d.equipment.map(e => {
      const res = d.reservations.filter(r => ['pending', 'confirmed', 'out'].includes(r.status) && d.items.some(i => i.reservation_id === r.id && i.equipment_id === e.id));
      return `<div class="cal-name" title="${e.name}">${e.name}</div>` + daysArr.map(dd => {
        const busy = res.some(r => r.start_date <= dd && r.end_date >= dd);
        return `<div class="cal-cell ${busy ? 'busy' : ''} ${dd === start ? 'today' : ''}"></div>`;
      }).join('');
    }).join('')}
  </div></div>`;
}

/* ---- Ajustes ---- */
function renderSettings() {
  $('#tabcontent').innerHTML = `<div class="grid-2">
    <div class="card">
      <h3>Cambiar contraseña</h3>
      <label>Nueva contraseña</label><input type="password" id="new_pw">
      <div class="mt"><button class="btn-primary" onclick="changePw()">Guardar</button></div>
    </div>
    <div class="card">
      <h3>WhatsApp del negocio</h3>
      <label>Número con código de país (solo dígitos)</label>
      <input id="wa_num" value="${WA_PHONE()}" placeholder="Ej: 5491122334455">
      <div class="mt"><button class="btn-primary" onclick="localStorage.setItem('r03_wa', $('#wa_num').value);toast('Número guardado')">Guardar</button></div>
      <p class="muted mt" style="font-size:12.5px">Los botones de WhatsApp de reservas y logística usan el celular de cada cliente; este número se usa para el aviso de reserva nueva desde el catálogo.</p>
    </div>
  </div>`;
}
window.changePw = async () => {
  try {
    await api('/api/admin/password', { method: 'POST', body: JSON.stringify({ password: $('#new_pw').value }) });
    toast('Contraseña actualizada');
  } catch (e) { toast(e.message, true); }
};

init();
