const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const INA_PUB_DATA = 'https://alerta.ina.gob.ar/pub/datos/datos';

// Códigos oficiales del catálogo SIyAH-INA.
// Las tres estaciones se consultan por código oficial de estación +
// variable 2 (altura hidrométrica), evitando series mensuales o cruces.
const STATIONS = [
  {
    id: 'reconquista',
    name: 'Reconquista',
    river: 'Río Paraná',
    query: { siteCode: '24', varId: '2' }
  },
  {
    id: 'puerto-iguazu',
    name: 'Puerto Iguazú',
    river: 'Río Iguazú',
    query: { siteCode: '9', varId: '2' }
  },
  {
    id: 'andresito',
    name: 'Andresito',
    river: 'Río Iguazú',
    query: { siteCode: '8', varId: '2' }
  }
];

async function fetchJson(url, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'AguaraLodge/1.0 (+https://aguaralodge.vercel.app)'
      }
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 180)}`);
    try {
      return JSON.parse(body);
    } catch (_) {
      throw new Error(`Respuesta no JSON: ${body.slice(0, 180)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function makeInaUrl(station) {
  const end = new Date();
  const start = new Date(end.getTime() - 10 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeStart: formatDate(start),
    timeEnd: formatDate(end),
    format: 'json',
    ...station.query
  });

  // Esta API histórica del INA utiliza '&' inmediatamente después del recurso.
  return `${INA_PUB_DATA}&${params.toString()}`;
}

function parseNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(clean)) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  let parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  // Formatos habituales dd/mm/yyyy hh:mm y yyyy-mm-dd hh:mm.
  let match = text.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    parsed = new Date(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}T${(match[4] || '00').padStart(2, '0')}:${match[5] || '00'}:${match[6] || '00'}-03:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  match = text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    parsed = new Date(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}T${(match[4] || '00').padStart(2, '0')}:${match[5] || '00'}:${match[6] || '00'}-03:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

const TIME_KEYS = /^(time|timestamp|date|fecha|timestart|time_start|datetime|valor_fecha|observed_at)$/i;
const VALUE_KEYS = /^(value|valor|val|altura|nivel|obs|observation)$/i;

function collectObservationCandidates(node, out = [], depth = 0) {
  if (depth > 12 || node == null) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectObservationCandidates(item, out, depth + 1);
    return out;
  }
  if (typeof node !== 'object') return out;

  const entries = Object.entries(node);
  let time = null;
  let value = null;

  for (const [key, raw] of entries) {
    if (!time && TIME_KEYS.test(key)) time = parseDate(raw);
    if (value == null && VALUE_KEYS.test(key)) value = parseNumeric(raw);
  }

  // Algunos recursos devuelven pares [fecha, valor] o nombres menos estándar.
  if (!time) {
    for (const [, raw] of entries) {
      const candidate = parseDate(raw);
      if (candidate) { time = candidate; break; }
    }
  }
  if (value == null) {
    for (const [key, raw] of entries) {
      if (/id|code|codigo|lat|lon|lng|unidad|var/i.test(key)) continue;
      const candidate = parseNumeric(raw);
      if (candidate != null && candidate >= -5 && candidate <= 50) {
        value = candidate;
        break;
      }
    }
  }

  if (time && value != null && value >= -5 && value <= 50) {
    out.push({ value, time: time.toISOString() });
  }

  for (const [, raw] of entries) {
    if (raw && typeof raw === 'object') collectObservationCandidates(raw, out, depth + 1);
  }
  return out;
}

function dedupeAndSort(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.time}|${row.value}`;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => new Date(b.time) - new Date(a.time));
}

function buildStationResult(station, rows) {
  const clean = dedupeAndSort(rows);
  if (!clean.length) return null;
  const latest = clean[0];
  const previous = clean.find(row => row.time !== latest.time) || clean[1] || null;

  let direction = 'unknown';
  let changeCm = null;
  if (previous) {
    changeCm = Math.round((latest.value - previous.value) * 100);
    direction = Math.abs(changeCm) <= 2 ? 'stable' : changeCm > 0 ? 'up' : 'down';
  }

  return {
    id: station.id,
    name: station.name,
    river: station.river,
    available: true,
    value: latest.value,
    unit: 'm',
    time: latest.time,
    previousValue: previous?.value ?? null,
    previousTime: previous?.time ?? null,
    trend: { direction, changeCm },
    source: 'Instituto Nacional del Agua (SIyAH)'
  };
}

async function loadInaStation(station) {
  const url = makeInaUrl(station);
  const payload = await fetchJson(url);
  const rows = collectObservationCandidates(payload);
  const result = buildStationResult(station, rows);
  if (!result) throw new Error('La API respondió sin observaciones hidrométricas utilizables.');
  return { result, url, rowCount: rows.length };
}

async function loadWeather() {
  const params = new URLSearchParams({
    latitude: '-29.15',
    longitude: '-59.65',
    timezone: 'America/Argentina/Cordoba',
    forecast_days: '7',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
  });
  return fetchJson(`${WEATHER_URL}?${params}`);
}

module.exports = async function handler(req, res) {
  const force = String(req.query?.refresh || '') === '1';
  const debugEnabled = String(req.query?.debug || '') === '1';
  res.setHeader('Cache-Control', force ? 'no-store' : 's-maxage=300, stale-while-revalidate=600');

  const [weatherSettled, ...riverSettled] = await Promise.allSettled([
    loadWeather(),
    ...STATIONS.map(loadInaStation)
  ]);

  const weather = weatherSettled.status === 'fulfilled' ? weatherSettled.value : null;
  const debug = { weather: null, rivers: {} };
  if (weatherSettled.status === 'rejected') debug.weather = weatherSettled.reason?.message || String(weatherSettled.reason);

  const rivers = STATIONS.map((station, index) => {
    const settled = riverSettled[index];
    if (settled.status === 'fulfilled') {
      debug.rivers[station.id] = {
        ok: true,
        url: settled.value.url,
        observationsDetected: settled.value.rowCount
      };
      return settled.value.result;
    }

    debug.rivers[station.id] = {
      ok: false,
      url: makeInaUrl(station),
      error: settled.reason?.message || String(settled.reason)
    };
    return {
      id: station.id,
      name: station.name,
      river: station.river,
      available: false,
      message: 'El INA no informó una lectura reciente para esta estación.'
    };
  });

  const payload = {
    weather,
    rivers,
    generatedAt: new Date().toISOString(),
    sources: { weather: 'Open-Meteo', rivers: 'Instituto Nacional del Agua (SIyAH)' }
  };
  if (debugEnabled) payload.debug = debug;

  res.status(200).json(payload);
};

module.exports._test = {
  collectObservationCandidates,
  buildStationResult,
  makeInaUrl,
  parseDate,
  parseNumeric
};
