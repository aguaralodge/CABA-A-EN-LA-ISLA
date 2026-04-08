const path = require('path');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return out === 0;
}

function requireAdmin(req) {
  const expected = String(process.env.ADMIN_PASSWORD || '');
  const provided = String(req.headers['x-admin-password'] || '');
  if (!expected || !same(expected, provided)) {
    const err = new Error('No autorizado');
    err.statusCode = 401;
    throw err;
  }
}

function getSupabase() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !key) {
    const err = new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    err.statusCode = 500;
    throw err;
  }
  return { url, key };
}

function getBucket() {
  return String(process.env.SUPABASE_GALLERY_BUCKET || 'galeria').trim() || 'galeria';
}

function galleryPublicUrl(objectPath) {
  const { url } = getSupabase();
  return `${url}/storage/v1/object/public/${encodeURIComponent(getBucket())}/${normalizeObjectPath(objectPath)}`;
}

function normalizeObjectPath(objectPath) {
  return String(objectPath || '')
    .replace(/^\/+/, '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function readJsonBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    const err = new Error('JSON inválido');
    err.statusCode = 400;
    throw err;
  }
}

function safeText(v, max = 500) {
  return String(v ?? '').trim().slice(0, max);
}

function slugify(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'foto';
}

function extFromMime(mime, fallbackName = '') {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  const ext = path.extname(String(fallbackName || '')).replace('.', '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  return 'jpg';
}

function decodeBase64Image(dataBase64) {
  const raw = String(dataBase64 || '');
  if (!raw) {
    const err = new Error('Falta la imagen');
    err.statusCode = 400;
    throw err;
  }
  const cleaned = raw.includes(',') ? raw.split(',').pop() : raw;
  let buffer;
  try {
    buffer = Buffer.from(cleaned, 'base64');
  } catch {
    const err = new Error('Imagen inválida');
    err.statusCode = 400;
    throw err;
  }
  if (!buffer || !buffer.length) {
    const err = new Error('Imagen vacía');
    err.statusCode = 400;
    throw err;
  }
  const maxBytes = 12 * 1024 * 1024;
  if (buffer.length > maxBytes) {
    const err = new Error('La imagen pesa demasiado. Máximo 12 MB');
    err.statusCode = 400;
    throw err;
  }
  return buffer;
}

async function uploadImageFromBase64({ filename, mimeType, dataBase64, title }) {
  const { url, key } = getSupabase();
  const buffer = decodeBase64Image(dataBase64);
  const ext = extFromMime(mimeType, filename);
  const objectPath = `aguara/${Date.now()}-${slugify(title || filename || 'foto')}.${ext}`;

  const endpoint = `${url}/storage/v1/object/${encodeURIComponent(getBucket())}/${normalizeObjectPath(objectPath)}`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': String(mimeType || `image/${ext}`),
      'x-upsert': 'false',
    },
    body: buffer,
  });

  const txt = await resp.text();
  if (!resp.ok) {
    const err = new Error(txt || 'No se pudo subir la imagen a Storage');
    err.statusCode = 400;
    throw err;
  }

  return {
    objectPath,
    imageUrl: galleryPublicUrl(objectPath),
  };
}

async function deleteImageObject(objectPath) {
  if (!objectPath) return;
  const { url, key } = getSupabase();
  const endpoint = `${url}/storage/v1/object/${encodeURIComponent(getBucket())}`;
  const resp = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ prefixes: [String(objectPath)] }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(txt || 'No se pudo borrar la imagen de Storage');
  }
}

function fallbackGallery() {
  const local = [
    ['assets/gal1.jpg', 'Vista general', 'Una postal del entorno de Aguará Lodge.'],
    ['assets/gal2.jpg', 'Frente de la cabaña', 'Espacio cálido y cómodo en plena isla.'],
    ['assets/gal3.jpg', 'Naturaleza', 'Monte, río y aire de descanso.'],
    ['assets/gal4.jpg', 'Atardecer', 'Luz suave sobre el paisaje isleño.'],
    ['assets/gal5.jpg', 'Muelle y costa', 'Salida ideal para pesca y paseo.'],
    ['assets/gal6.jpg', 'Descanso', 'Un rincón para bajar un cambio.'],
    ['images/cabana-1.jpg', 'Interior', 'Ambientes listos para recibir grupos y familias.'],
    ['images/cabana-2.jpg', 'Exterior', 'La cabaña y su entorno natural.'],
    ['images/cabana-3.jpg', 'Galería', 'Espacios para compartir y descansar.'],
    ['images/cabana-4.jpg', 'Paisaje', 'Verde, agua y tranquilidad.'],
    ['images/cabana-5.jpg', 'Comodidad', 'Estadía sencilla, práctica y disfrutable.'],
    ['images/cabana-6.jpg', 'Isla', 'La experiencia Aguará Lodge desde adentro.'],
  ];
  return local.map((item, idx) => ({
    id: `local-${idx + 1}`,
    titulo: item[1],
    descripcion: item[2],
    image_url: item[0],
    object_path: item[0],
    orden: idx + 1,
    activa: true,
  }));
}

async function listGallery({ includeInactive = false } = {}) {
  const { url, key } = getSupabase();
  let endpoint = `${url}/rest/v1/galeria?select=id,titulo,descripcion,image_url,object_path,orden,activa,created_at`;
  if (!includeInactive) endpoint += '&activa=eq.true';
  endpoint += '&order=orden.asc.nullslast,created_at.desc';

  const resp = await fetch(endpoint, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: 'application/json',
    },
  });

  const txt = await resp.text();
  let rows = [];
  try { rows = JSON.parse(txt); } catch {}
  if (!resp.ok) {
    const err = new Error(txt || 'No se pudo consultar la galería');
    err.statusCode = 400;
    throw err;
  }
  return Array.isArray(rows) ? rows : [];
}

async function getGalleryItemById(id) {
  const { url, key } = getSupabase();
  const endpoint = `${url}/rest/v1/galeria?select=id,titulo,descripcion,image_url,object_path,orden,activa,created_at&id=eq.${encodeURIComponent(id)}&limit=1`;
  const resp = await fetch(endpoint, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: 'application/json',
    },
  });
  const txt = await resp.text();
  let rows = [];
  try { rows = JSON.parse(txt); } catch {}
  if (!resp.ok) {
    const err = new Error(txt || 'No se pudo consultar la foto');
    err.statusCode = 400;
    throw err;
  }
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function insertGalleryItem(row) {
  const { url, key } = getSupabase();
  const endpoint = `${url}/rest/v1/galeria`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const txt = await resp.text();
  let rows = [];
  try { rows = JSON.parse(txt); } catch {}
  if (!resp.ok) {
    const err = new Error(txt || 'No se pudo guardar la foto');
    err.statusCode = 400;
    throw err;
  }
  return Array.isArray(rows) && rows[0] ? rows[0] : row;
}

async function updateGalleryItem(id, patch) {
  const { url, key } = getSupabase();
  const endpoint = `${url}/rest/v1/galeria?id=eq.${encodeURIComponent(id)}`;
  const resp = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  const txt = await resp.text();
  let rows = [];
  try { rows = JSON.parse(txt); } catch {}
  if (!resp.ok) {
    const err = new Error(txt || 'No se pudo actualizar la foto');
    err.statusCode = 400;
    throw err;
  }
  return Array.isArray(rows) && rows[0] ? rows[0] : patch;
}

async function deleteGalleryItem(id) {
  const { url, key } = getSupabase();
  const endpoint = `${url}/rest/v1/galeria?id=eq.${encodeURIComponent(id)}`;
  const resp = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: 'return=representation',
    },
  });
  const txt = await resp.text();
  let rows = [];
  try { rows = JSON.parse(txt); } catch {}
  if (!resp.ok) {
    const err = new Error(txt || 'No se pudo borrar la foto');
    err.statusCode = 400;
    throw err;
  }
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

module.exports = {
  json,
  same,
  requireAdmin,
  getSupabase,
  getBucket,
  readJsonBody,
  safeText,
  uploadImageFromBase64,
  deleteImageObject,
  listGallery,
  getGalleryItemById,
  insertGalleryItem,
  updateGalleryItem,
  deleteGalleryItem,
  fallbackGallery,
};
