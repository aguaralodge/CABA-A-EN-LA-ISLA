const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const PNA_BASE = 'https://contenidosweb.prefecturanaval.gob.ar/alturas/';

// Identificadores oficiales usados por el histórico de Prefectura Naval.
// Evitan búsquedas ambiguas entre estaciones con nombres o variables parecidas.
const STATIONS = [
  { id: 180, name: 'Reconquista', river: 'Río Paraná' },
  { id: 20, name: 'Puerto Iguazú', river: 'Río Iguazú' },
  { id: 10, name: 'Andresito', river: 'Río Iguazú' }
];

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'AguaraLodge/1.0 (+https://aguara-lodge.vercel.app)'
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
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
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
  return decodeHtml(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/p>|<\/div>|<\/tr>|<\/li>|<\/h\d>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function parseNumber(value) {
  if (value == null) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePnaDate(value) {
  const match = String(value || '').match(/(\d{1,2})\/([A-ZÁÉÍÓÚ]{3})\/(\d{2,4})\s*-\s*(\d{2})(\d{2})/i);
  if (!match) return null;
  const months = {
    ENE: 0, FEB: 1, MAR: 2, ABR: 3, MAY: 4, JUN: 5,
    JUL: 6, AGO: 7, SEP: 8, OCT: 9, NOV: 10, DIC: 11
  };
  const monthKey = match[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const month = months[monthKey];
  if (month == null) return null;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  // Argentina está en UTC-3. Se conserva la hora informada por Prefectura.
  const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}T${match[4]}:${match[5]}:00-03:00`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

function parseStationPage(html, station) {
  const text = htmlToText(html);

  // Formato habitual de la página histórica:
  // “Último registro: 3.19 Mts el 27/JUL/26 - 1200”
  // “Registro anterior: 3.14 Mts el 27/JUL/26 - 0000”
  const latestMatch = text.match(/(?:Último|Ultimo)\s+registro\s*:\s*(-?\d+(?:[.,]\d+)?)\s*Mts?\.?\s*el\s*(\d{1,2}\/[A-ZÁÉÍÓÚ]{3}\/\d{2,4}\s*-\s*\d{4})/i);
  const previousMatch = text.match(/Registro\s+anterior\s*:\s*(-?\d+(?:[.,]\d+)?)\s*Mts?\.?\s*el\s*(\d{1,2}\/[A-ZÁÉÍÓÚ]{3}\/\d{2,4}\s*-\s*\d{4})/i);

  // Respaldo: toma las dos primeras filas del histórico si cambia el texto superior.
  const rowMatches = [...String(html).matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
    .map(match => htmlToText(match[0]))
    .map(row => row.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}).*?(-?\d+(?:[.,]\d+)?)\s*Mts/i))
    .filter(Boolean);

  const latestValue = parseNumber(latestMatch?.[1] ?? rowMatches[0]?.[3]);
  const latestTime = parsePnaDate(latestMatch?.[2]) || (rowMatches[0] ? `${rowMatches[0][1]}T${rowMatches[0][2]}:00-03:00` : null);
  const previousValue = parseNumber(previousMatch?.[1] ?? rowMatches[1]?.[3]);
  const previousTime = parsePnaDate(previousMatch?.[2]) || (rowMatches[1] ? `${rowMatches[1][1]}T${rowMatches[1][2]}:00-03:00` : null);

  if (!Number.isFinite(latestValue) || !latestTime) {
    return {
      ...station,
      available: false,
      message: 'Prefectura no devolvió una lectura válida en este momento.'
    };
  }

  let direction = 'unknown';
  let changeCm = null;
  if (Number.isFinite(previousValue)) {
    changeCm = Math.round((latestValue - previousValue) * 100);
    direction = Math.abs(changeCm) <= 2 ? 'stable' : changeCm > 0 ? 'up' : 'down';
  }

  return {
    name: station.name,
    river: station.river,
    available: true,
    value: latestValue,
    unit: 'm',
    time: latestTime,
    previousValue,
    previousTime,
    trend: { direction, changeCm },
    stationId: station.id,
    source: 'Prefectura Naval Argentina'
  };
}

async function loadStation(station) {
  const url = `${PNA_BASE}?id=${station.id}&page=historico&tiempo=7`;
  const html = await fetchText(url);
  return parseStationPage(html, station);
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
  // Cinco minutos: Prefectura puede actualizar varias veces al día y el botón
  // “Actualizar datos” no debe quedar atrapado media hora en una lectura vieja.
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    const [weatherResult, ...riverResults] = await Promise.allSettled([
      loadWeather(),
      ...STATIONS.map(loadStation)
    ]);

    const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
    const rivers = riverResults.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      return {
        ...STATIONS[index],
        available: false,
        message: 'No se pudo consultar la lectura de Prefectura.'
      };
    });

    res.status(200).json({
      weather,
      rivers,
      generatedAt: new Date().toISOString(),
      sources: {
        weather: 'Open-Meteo',
        rivers: 'Prefectura Naval Argentina'
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'No fue posible actualizar clima y río.' });
  }
};

// Exportado únicamente para pruebas locales; Vercel ignora esta propiedad.
module.exports._test = { parseStationPage, parsePnaDate, htmlToText };
