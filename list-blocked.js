const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const PNA_BASE = 'https://contenidosweb.prefecturanaval.gob.ar/alturas/';
const INA_DAILY = 'https://alerta.ina.gob.ar/a5/diario/reporte_diario';
const UNL_RIVERS = 'https://wfich1.unl.edu.ar/cim/rios/parana/alturas';
const JINA_PREFIX = 'https://r.jina.ai/http://';

const STATIONS = [
  { id: 180, name: 'Reconquista', aliases: ['Reconquista'], river: 'Río Paraná' },
  { id: 20, name: 'Puerto Iguazú', aliases: ['Puerto Iguazú', 'Iguazú'], river: 'Río Iguazú' },
  { id: 10, name: 'Andresito', aliases: ['Andresito'], river: 'Río Iguazú' }
];

async function fetchText(url, timeoutMs = 15000, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; AguaraLodge/1.0)',
        ...headers
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í').replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í').replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&deg;/gi, '°').replace(/&amp;/gi, '&')
    .replace(/&#0*39;/g, "'").replace(/&quot;/gi, '"');
}

function htmlToText(html = '') {
  return decodeHtml(String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/tr>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function parseNumber(value) {
  if (value == null) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function localIso(date, time) {
  if (!date || !time) return null;
  const iso = `${date}T${time}:00-03:00`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

function buildStation(station, rows, source) {
  if (!rows.length) return null;
  const latest = rows[0];
  const previous = rows[1] || null;
  let direction = 'unknown';
  let changeCm = null;
  if (previous && Number.isFinite(previous.value)) {
    changeCm = Math.round((latest.value - previous.value) * 100);
    direction = Math.abs(changeCm) <= 2 ? 'stable' : changeCm > 0 ? 'up' : 'down';
  }
  return {
    name: station.name,
    river: station.river,
    available: true,
    value: latest.value,
    unit: 'm',
    time: latest.time || new Date().toISOString(),
    previousValue: previous?.value ?? null,
    previousTime: previous?.time ?? null,
    trend: { direction, changeCm },
    stationId: station.id,
    source
  };
}

function parsePnaHistorical(content, station) {
  const text = htmlToText(content);
  const rows = [];

  // HTML o texto renderizado: 2026-07-24 00:00 2.94 Mts
  for (const match of text.matchAll(/(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(-?\d+(?:[.,]\d+)?)\s*Mts?/gi)) {
    const value = parseNumber(match[3]);
    if (Number.isFinite(value)) rows.push({ value, time: localIso(match[1], match[2]) });
  }

  // Markdown de lectores/proxies: | 1 | 2026-07-24 00:00 | 2.94 Mts |
  if (!rows.length) {
    for (const match of String(content).matchAll(/\|?\s*\d+\s*\|\s*(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*\|\s*(-?\d+(?:[.,]\d+)?)\s*Mts?/gi)) {
      const value = parseNumber(match[3]);
      if (Number.isFinite(value)) rows.push({ value, time: localIso(match[1], match[2]) });
    }
  }

  return buildStation(station, rows, 'Prefectura Naval Argentina');
}

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseNamedTable(content, station, source) {
  const text = htmlToText(content);
  const aliases = station.aliases.map(normalize);
  const lines = text.split('\n').map(v => v.trim()).filter(Boolean);

  // Prioriza coincidencias al comienzo de la fila. Así "Iguazú" no toma
  // accidentalmente la fila de Andresito, que también contiene ese río.
  for (const alias of aliases) {
    for (const line of lines) {
      const clean = normalize(line);
      const startsAsStation = clean === alias || clean.startsWith(alias + ' ') || clean.startsWith(alias + '|');
      if (!startsAsStation) continue;

      const tail = line.slice(Math.min(line.length, alias.length));
      const numbers = [...tail.matchAll(/-?\d+(?:[.,]\d+)?/g)].map(m => parseNumber(m[0])).filter(Number.isFinite);
      const plausible = numbers.find(n => n >= -2 && n <= 40);
      if (Number.isFinite(plausible)) {
        return buildStation(station, [{ value: plausible, time: new Date().toISOString() }], source);
      }
    }
  }
  return null;
}

async function loadPnaStation(station) {
  const query = `?id=${station.id}&page=historico&tiempo=7`;
  const directUrl = `${PNA_BASE}${query}`;

  // 1) Fuente directa.
  try {
    const content = await fetchText(directUrl, 12000);
    const parsed = parsePnaHistorical(content, station);
    if (parsed) return parsed;
  } catch (_) {}

  // 2) Lector intermedio. Es útil cuando Prefectura bloquea IPs de servicios cloud.
  try {
    const target = `contenidosweb.prefecturanaval.gob.ar/alturas/${query}`;
    const content = await fetchText(`${JINA_PREFIX}${target}`, 18000);
    const parsed = parsePnaHistorical(content, station);
    if (parsed) {
      parsed.source = 'Prefectura Naval Argentina (lectura de respaldo)';
      return parsed;
    }
  } catch (_) {}

  return null;
}

async function loadSharedFallbacks() {
  const results = await Promise.allSettled([
    fetchText(UNL_RIVERS, 12000),
    fetchText(INA_DAILY, 12000)
  ]);
  return {
    unl: results[0].status === 'fulfilled' ? results[0].value : null,
    ina: results[1].status === 'fulfilled' ? results[1].value : null
  };
}

async function loadWeather() {
  const params = new URLSearchParams({
    latitude: '-29.15', longitude: '-59.65', timezone: 'America/Argentina/Cordoba', forecast_days: '7',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
  });
  return fetchJson(`${WEATHER_URL}?${params}`);
}

module.exports = async function handler(req, res) {
  const force = String(req.query?.refresh || '') === '1';
  res.setHeader('Cache-Control', force ? 'no-store' : 's-maxage=300, stale-while-revalidate=600');

  try {
    const [weatherResult, directResults, fallbacks] = await Promise.all([
      loadWeather().catch(() => null),
      Promise.all(STATIONS.map(station => loadPnaStation(station).catch(() => null))),
      loadSharedFallbacks()
    ]);

    const rivers = STATIONS.map((station, index) => {
      if (directResults[index]) return directResults[index];

      if (fallbacks.unl) {
        const fromUnl = parseNamedTable(fallbacks.unl, station, 'Universidad Nacional del Litoral / datos hidrométricos');
        if (fromUnl) return fromUnl;
      }

      // El reporte diario del INA publica niveles de Reconquista y Puerto Iguazú.
      // Andresito suele figurar como caudal, por eso no se lo transforma falsamente en metros.
      if (fallbacks.ina && station.name !== 'Andresito') {
        const fromIna = parseNamedTable(fallbacks.ina, station, 'Instituto Nacional del Agua');
        if (fromIna) return fromIna;
      }

      return {
        ...station,
        available: false,
        message: 'Las fuentes hidrométricas no respondieron en este momento.'
      };
    });

    res.status(200).json({
      weather: weatherResult,
      rivers,
      generatedAt: new Date().toISOString(),
      sources: { weather: 'Open-Meteo', rivers: 'Prefectura Naval / INA / UNL' }
    });
  } catch (error) {
    res.status(500).json({ error: 'No fue posible actualizar clima y río.' });
  }
};

module.exports._test = { parsePnaHistorical, parseNamedTable, htmlToText };
