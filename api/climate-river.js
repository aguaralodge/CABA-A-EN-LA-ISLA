const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const INA_BASE = 'https://alerta.ina.gob.ar/a5';

const STATIONS = [
  { name: 'Reconquista', river: 'Río Paraná', matches: ['reconquista'] },
  { name: 'Puerto Iguazú', river: 'Río Iguazú', matches: ['puerto iguazu', 'iguazu'] },
  { name: 'Andresito', river: 'Río Iguazú', matches: ['andresito'] }
];

function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

function props(feature) { return feature?.properties || feature || {}; }
function seriesId(feature) {
  const p = props(feature);
  return p.id ?? p.series_id ?? p.seriesId ?? feature?.id;
}
function searchable(feature) {
  const p = props(feature);
  return normalize([p.estacion_nombre,p.estacion,p.nombre,p.name,p.sitio,p.rio,p.variable,p.var_name,p.procedimiento,p.unidades].filter(Boolean).join(' '));
}
function isHeightSeries(feature) {
  const text = searchable(feature);
  return /(altura|nivel|hidrometr)/.test(text) && !/(caudal|precipit)/.test(text);
}

async function findSeries() {
  const catalog = await fetchJson(`${INA_BASE}/obs/puntual/series?format=geojson`, 18000);
  const features = Array.isArray(catalog) ? catalog : (catalog.features || catalog.series || []);
  return STATIONS.map(station => {
    const candidates = features.filter(f => station.matches.some(m => searchable(f).includes(normalize(m))));
    const best = candidates.find(isHeightSeries) || candidates[0];
    return { ...station, feature: best, id: best ? seriesId(best) : null };
  });
}

function observationsArray(data) {
  if (Array.isArray(data)) return data;
  return data.observaciones || data.observations || data.data || data.valores || [];
}
function obsTime(o) { return o.timestart || o.time || o.fecha || o.timestamp || o.date; }
function obsValue(o) { return Number(o.valor ?? o.value ?? o.val ?? o.obs); }

async function loadStation(station) {
  if (!station.id) return { ...station, available:false, message:'Estación no localizada en el catálogo del INA.' };
  const end = new Date();
  const start = new Date(end.getTime() - 8 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    tipo:'puntual', series_id:String(station.id),
    timestart:start.toISOString(), timeend:end.toISOString()
  });
  const data = await fetchJson(`${INA_BASE}/getObservaciones?${params}`, 15000);
  const obs = observationsArray(data)
    .map(o => ({ time:obsTime(o), value:obsValue(o) }))
    .filter(o => o.time && Number.isFinite(o.value))
    .sort((a,b) => new Date(a.time) - new Date(b.time));
  if (!obs.length) return { ...station, available:false, message:'La estación no informó lecturas recientes.' };
  const latest = obs.at(-1);
  const previous = [...obs].reverse().find(o => new Date(latest.time)-new Date(o.time) >= 12*60*60*1000) || obs.at(-2);
  let direction = 'unknown', changeCm = null;
  if (previous) {
    changeCm = Math.round((latest.value - previous.value) * 100);
    direction = Math.abs(changeCm) <= 2 ? 'stable' : changeCm > 0 ? 'up' : 'down';
  }
  const p = props(station.feature);
  return {
    name:station.name, river:station.river, available:true,
    value:latest.value, unit:p.unidades || p.unidad || 'm', time:latest.time,
    trend:{direction,changeCm}, seriesId:station.id
  };
}

async function loadWeather() {
  const params = new URLSearchParams({
    latitude:'-29.15', longitude:'-59.65', timezone:'America/Argentina/Cordoba', forecast_days:'7',
    current:'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m',
    daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset'
  });
  return fetchJson(`${WEATHER_URL}?${params}`, 12000);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control','s-maxage=1800, stale-while-revalidate=3600');
  try {
    const [weatherResult, seriesResult] = await Promise.allSettled([loadWeather(), findSeries()]);
    const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
    let rivers = STATIONS.map(s => ({...s,available:false,message:'Servicio hidrológico temporalmente no disponible.'}));
    if (seriesResult.status === 'fulfilled') {
      rivers = await Promise.all(seriesResult.value.map(async s => {
        try { return await loadStation(s); }
        catch (e) { return {...s,available:false,message:'No se pudo recuperar la lectura reciente.'}; }
      }));
    }
    res.status(200).json({ weather, rivers, generatedAt:new Date().toISOString(), sources:{weather:'Open-Meteo',rivers:'Instituto Nacional del Agua'} });
  } catch (error) {
    res.status(500).json({ error:'No fue posible actualizar clima y río.' });
  }
};
