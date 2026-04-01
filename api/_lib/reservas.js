const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function siteUrl(req) {
  const env = process.env.PUBLIC_SITE_URL;
  if (env && /^https?:\/\//.test(env)) return env.replace(/\/+$/, '');
  const proto = (req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

function supabaseBase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan variables de Supabase');
  return { url: url.replace(/\/+$/, ''), key };
}

function money(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n || 0));
}

function formatDate(iso) {
  if (!iso) return '-';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function statusLabel(status) {
  switch (String(status || '').toLowerCase()) {
    case 'approved': return 'Reserva confirmada';
    case 'blocked': return 'Reserva cargada desde admin';
    case 'cash_pending': return 'Pendiente de pago en efectivo';
    case 'cancelled': return 'Cancelada';
    default: return status || '-';
  }
}

function normalizeReservation(row) {
  if (!row || typeof row !== 'object') return null;
  const total = Number(row.total || 0);
  const senia = Number(row.senia || 0);
  return {
    ref: row.ref || '',
    checkin: row.checkin || '',
    checkout: row.checkout || '',
    noches: Number(row.noches || 0),
    personas: Number(row.personas || 0),
    nombre: row.nombre || '',
    email: row.email || '',
    tel: row.tel || '',
    total,
    senia,
    saldo: Number(row.saldo ?? Math.max(0, total - senia)),
    payment_id: row.payment_id ? String(row.payment_id) : '',
    status: row.status || '',
    created_at: row.created_at || '',
  };
}

async function fetchReservaByRef(ref) {
  const { url, key } = supabaseBase();
  const endpoint = `${url}/rest/v1/reservas?select=ref,checkin,checkout,noches,personas,nombre,email,tel,total,senia,saldo,payment_id,status,created_at&ref=eq.${encodeURIComponent(ref)}&limit=1`;
  const r = await fetch(endpoint, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: 'application/json',
    },
  });
  const txt = await r.text();
  let rows = [];
  try { rows = JSON.parse(txt); } catch {}
  if (!r.ok) throw new Error(txt || 'No se pudo consultar la reserva');
  return normalizeReservation(Array.isArray(rows) ? rows[0] : null);
}

async function upsertReserva(row) {
  const { url, key } = supabaseBase();
  const endpoint = `${url}/rest/v1/reservas?on_conflict=ref`;
  const clean = {
    ref: row.ref,
    checkin: row.checkin || null,
    checkout: row.checkout || null,
    noches: row.noches ?? null,
    personas: row.personas ?? null,
    nombre: row.nombre || '',
    email: row.email || '',
    tel: row.tel || '',
    total: row.total ?? null,
    senia: row.senia ?? null,
    saldo: row.saldo ?? null,
    payment_id: row.payment_id || null,
    status: row.status || null,
  };
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(clean),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(txt || 'Error guardando en Supabase');
  let rows = [];
  try { rows = JSON.parse(txt); } catch {}
  return normalizeReservation(Array.isArray(rows) ? rows[0] : clean);
}

async function generateReservationPdfBuffer(reserva, opts = {}) {
  const r = normalizeReservation(reserva);
  if (!r) throw new Error('Reserva inválida');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.97, 0.98, 0.99) });
  page.drawRectangle({ x: 36, y: height - 120, width: width - 72, height: 84, color: rgb(0.09, 0.17, 0.22) });
  page.drawRectangle({ x: 36, y: 36, width: width - 72, height: height - 72, borderWidth: 1, borderColor: rgb(0.78, 0.83, 0.86) });

  const logoPath = path.join(process.cwd(), 'assets', 'logo.png');
  let logoDims = null;
  if (fs.existsSync(logoPath)) {
    const bytes = fs.readFileSync(logoPath);
    try {
      const png = await pdfDoc.embedPng(bytes);
      const scale = Math.min(120 / png.width, 60 / png.height);
      logoDims = { img: png, w: png.width * scale, h: png.height * scale };
      page.drawImage(png, { x: width - 36 - logoDims.w - 16, y: height - 96, width: logoDims.w, height: logoDims.h });
    } catch {}
  }

  page.drawText('Aguará Lodge', { x: 54, y: height - 74, size: 24, font: bold, color: rgb(1,1,1) });
  page.drawText('Comprobante de reserva', { x: 54, y: height - 100, size: 13, font, color: rgb(0.86,0.91,0.94) });

  let y = height - 170;
  page.drawText(`Código de reserva: ${r.ref}`, { x: 54, y, size: 12.5, font: bold, color: rgb(0.09,0.17,0.22) });
  y -= 28;

  const lines = [
    ['Titular', r.nombre || '-'],
    ['Teléfono', r.tel || '-'],
    ['Email', r.email || '-'],
    ['Check-in', formatDate(r.checkin)],
    ['Check-out', formatDate(r.checkout)],
    ['Noches', String(r.noches || 0)],
    ['Personas', String(r.personas || 0)],
    ['Total de la estadía', money(r.total)],
    ['Seña pagada', money(r.senia)],
    ['Saldo pendiente', money(r.saldo)],
    ['Estado', statusLabel(r.status)],
    ['Pago Mercado Pago', r.payment_id || '-'],
  ];

  for (const [label, value] of lines) {
    page.drawText(label + ':', { x: 54, y, size: 11.5, font: bold, color: rgb(0.2,0.25,0.28) });
    page.drawText(String(value), { x: 190, y, size: 11.5, font, color: rgb(0.2,0.25,0.28) });
    y -= 24;
  }

  y -= 12;
  page.drawLine({ start: { x: 54, y }, end: { x: width - 54, y }, thickness: 1, color: rgb(0.8,0.84,0.87) });
  y -= 26;
  const defaultNote = r.status === 'blocked'
    ? 'Este comprobante corresponde a una reserva cargada manualmente desde el panel admin de Aguará Lodge. Podés compartirlo con el huésped como constancia de la fecha apartada.'
    : 'Este comprobante confirma la reserva registrada en Aguará Lodge una vez acreditada la seña. Guardalo para cualquier consulta.';
  const note = opts.note || defaultNote;
  for (const chunk of wrapText(note, 70)) {
    page.drawText(chunk, { x: 54, y, size: 10.5, font, color: rgb(0.35,0.4,0.44) });
    y -= 16;
  }

  page.drawText(`Emitido: ${new Date().toLocaleString('es-AR')}`, { x: 54, y: 56, size: 9.5, font, color: rgb(0.45,0.49,0.52) });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

function wrapText(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function sendOwnerWhatsAppText({ reserva, req }) {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = process.env.OWNER_WHATSAPP_TO;
  if (!token || !phoneNumberId || !to) return { ok: false, skipped: true, reason: 'missing_env' };

  const r = normalizeReservation(reserva);
  const base = siteUrl(req);
  const pdfUrl = `${base}/api/reservation-pdf?ref=${encodeURIComponent(r.ref)}`;
  const body = [
    'Nueva reserva confirmada en Aguará Lodge',
    `Ref: ${r.ref}`,
    `Titular: ${r.nombre || '-'}`,
    `Ingreso: ${formatDate(r.checkin)}`,
    `Egreso: ${formatDate(r.checkout)}`,
    `Personas: ${r.personas || 0}`,
    `Total: ${money(r.total)}`,
    `Seña: ${money(r.senia)}`,
    `Saldo: ${money(r.saldo)}`,
    `PDF: ${pdfUrl}`,
  ].join('\n');

  const resp = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  const txt = await resp.text();
  if (!resp.ok) throw new Error(txt || 'Error enviando WhatsApp');
  return { ok: true };
}

module.exports = {
  json,
  siteUrl,
  money,
  formatDate,
  normalizeReservation,
  fetchReservaByRef,
  upsertReserva,
  generateReservationPdfBuffer,
  sendOwnerWhatsAppText,
};
