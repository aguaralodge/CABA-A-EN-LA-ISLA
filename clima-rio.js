(() => {
  const $ = (id) => document.getElementById(id);
  const menuBtn = $('menuBtn');
  const navLinks = $('navLinks');
  menuBtn?.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  if ($('yy')) $('yy').textContent = new Date().getFullYear();

  const weatherCodes = {
    0:['Despejado','☀️'],1:['Mayormente despejado','🌤️'],2:['Parcialmente nublado','⛅'],3:['Nublado','☁️'],
    45:['Niebla','🌫️'],48:['Niebla con escarcha','🌫️'],51:['Llovizna leve','🌦️'],53:['Llovizna','🌦️'],55:['Llovizna intensa','🌧️'],
    61:['Lluvia leve','🌧️'],63:['Lluvia','🌧️'],65:['Lluvia intensa','🌧️'],80:['Chaparrones leves','🌦️'],81:['Chaparrones','🌧️'],82:['Chaparrones fuertes','⛈️'],
    95:['Tormenta','⛈️'],96:['Tormenta con granizo','⛈️'],99:['Tormenta fuerte con granizo','⛈️']
  };
  const codeInfo = (code) => weatherCodes[Number(code)] || ['Condiciones variables','🌤️'];
  const round = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : '--';
  const localDate = (value) => {
    if (!value) return 'Sin horario informado';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'});
  };

  function renderWeather(weather){
    const current = weather.current || {};
    const daily = weather.daily || {};
    const info = codeInfo(current.weather_code);
    $('weatherIcon').textContent = info[1];
    $('weatherTemp').textContent = `${round(current.temperature_2m)}°`;
    $('weatherDescription').textContent = info[0];
    $('weatherFeels').textContent = `${round(current.apparent_temperature)}°`;
    $('weatherHumidity').textContent = `${round(current.relative_humidity_2m)}%`;
    $('weatherWind').textContent = `${round(current.wind_speed_10m)} km/h`;
    $('weatherGust').textContent = `${round(current.wind_gusts_10m)} km/h`;
    $('weatherRain').textContent = `${round(daily.precipitation_probability_max?.[0])}%`;
    $('weatherSunset').textContent = daily.sunset?.[0]?.slice(11,16) || '--:--';
    $('weatherUpdated').textContent = `Actualizado ${localDate(current.time)}`;
    const days = daily.time || [];
    $('forecastDays').innerHTML = days.slice(0,7).map((date,i) => {
      const dayName = new Date(`${date}T12:00:00`).toLocaleDateString('es-AR',{weekday:'short'}).replace('.','');
      const dayInfo = codeInfo(daily.weather_code?.[i]);
      return `<div class="forecast-day"><div class="forecast-day__name">${dayName}</div><span class="forecast-day__icon" aria-hidden="true">${dayInfo[1]}</span><div class="forecast-day__temps"><strong>${round(daily.temperature_2m_max?.[i])}°</strong> / ${round(daily.temperature_2m_min?.[i])}°</div><span class="forecast-day__rain">💧 ${round(daily.precipitation_probability_max?.[i])}%</span></div>`;
    }).join('');
  }

  function trendLabel(trend){
    if (!trend || trend.direction === 'unknown') return ['→','Sin tendencia disponible'];
    if (trend.direction === 'up') return ['↑',`Sube ${Math.abs(trend.changeCm)} cm`];
    if (trend.direction === 'down') return ['↓',`Baja ${Math.abs(trend.changeCm)} cm`];
    return ['→','Estable'];
  }
  function renderRivers(rivers){
    $('riverCards').innerHTML = rivers.map(r => {
      if (!r.available) return `<article class="river-card river-card--error"><span class="river-card__river">${r.river || 'Lectura oficial'}</span><h3>${r.name}</h3><p>No fue posible obtener una lectura automática en este momento.</p><p class="data-updated">${r.message || 'Intentá nuevamente más tarde.'}</p></article>`;
      const t = trendLabel(r.trend);
      return `<article class="river-card"><span class="river-card__river">${r.river}</span><h3>${r.name}</h3><div class="river-level"><strong>${Number(r.value).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><span>${r.unit || 'm'}</span></div><div class="river-trend"><span aria-hidden="true">${t[0]}</span>${t[1]}</div><p class="data-updated">Lectura: ${localDate(r.time)}</p></article>`;
    }).join('');
  }

  async function loadClimateRiver(){
    const button = $('refreshClimateRiver');
    if (button){ button.disabled = true; button.textContent = 'Actualizando…'; }
    try {
      const response = await fetch('/api/climate-river', {cache:'no-store'});
      if (!response.ok) throw new Error('Servicio temporalmente no disponible');
      const data = await response.json();
      if (data.weather) renderWeather(data.weather);
      renderRivers(data.rivers || []);
    } catch (error) {
      $('weatherDescription').textContent = 'No pudimos cargar el pronóstico';
      $('weatherUpdated').textContent = 'Revisá tu conexión o intentá nuevamente.';
      $('forecastDays').innerHTML = '<div class="forecast-skeleton">Pronóstico temporalmente no disponible.</div>';
      renderRivers([{name:'Reconquista',river:'Río Paraná',available:false},{name:'Puerto Iguazú',river:'Río Iguazú',available:false},{name:'Andresito',river:'Río Iguazú',available:false}]);
    } finally {
      if (button){ button.disabled = false; button.textContent = 'Actualizar datos'; }
    }
  }

  const LAT = -29.1443;
  const LON = -59.6438;
  let selectedDate = new Date();
  selectedDate.setHours(12,0,0,0);
  const time = (d) => d instanceof Date && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '--:--';
  const addMinutes = (d,m) => new Date(d.getTime()+m*60000);
  const range = (center, minutes) => center instanceof Date && !Number.isNaN(center.getTime()) ? `${time(addMinutes(center,-minutes))} a ${time(addMinutes(center,minutes))}` : 'No disponible';
  function moonPhaseName(phase){
    if (phase < .03 || phase > .97) return ['Luna nueva','🌑'];
    if (phase < .22) return ['Creciente','🌒'];
    if (phase < .28) return ['Cuarto creciente','🌓'];
    if (phase < .47) return ['Gibosa creciente','🌔'];
    if (phase < .53) return ['Luna llena','🌕'];
    if (phase < .72) return ['Gibosa menguante','🌖'];
    if (phase < .78) return ['Cuarto menguante','🌗'];
    return ['Menguante','🌘'];
  }
  function renderSolunar(){
    if (!window.SunCalc){ $('solunarPanel').innerHTML='<div class="forecast-skeleton">No fue posible cargar el cálculo solunar.</div>'; return; }
    const date = new Date(selectedDate);
    const moonTimes = SunCalc.getMoonTimes(date,LAT,LON,true);
    const illum = SunCalc.getMoonIllumination(date);
    const sunTimes = SunCalc.getTimes(date,LAT,LON);
    const phase = moonPhaseName(illum.phase);
    const rise = moonTimes.rise;
    const set = moonTimes.set;
    let transit = null;
    if (rise instanceof Date && set instanceof Date) {
      let a=rise.getTime(), b=set.getTime();
      if (b<a) b += 24*3600000;
      transit = new Date((a+b)/2);
    }
    const underfoot = transit ? new Date(transit.getTime()+12*3600000) : null;
    const scoreBase = Math.round((1-Math.abs(.5-illum.phase)*2)*2 + (illum.fraction>.8 ? 1 : 0));
    const score = Math.max(1,Math.min(5,scoreBase+2));
    const labels=['Bajo','Regular','Bueno','Muy bueno','Excelente'];
    $('solunarDate').textContent = date.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
    $('solunarPanel').innerHTML = `
      <article class="solunar-summary"><div class="solunar-moon"><span>${phase[1]}</span><div><strong>${phase[0]}</strong><small>${Math.round(illum.fraction*100)}% iluminada</small></div></div><div class="solunar-score"><span>Índice orientativo</span><strong>${'★'.repeat(score)}${'☆'.repeat(5-score)}</strong><small>${labels[score-1]}</small></div></article>
      <div class="solunar-grid">
        <article><span>Actividad mayor 1</span><strong>${range(transit,60)}</strong><small>Tránsito lunar aproximado</small></article>
        <article><span>Actividad mayor 2</span><strong>${range(underfoot,60)}</strong><small>Luna bajo los pies</small></article>
        <article><span>Actividad menor 1</span><strong>${range(rise,30)}</strong><small>Alrededor de la salida lunar</small></article>
        <article><span>Actividad menor 2</span><strong>${range(set,30)}</strong><small>Alrededor de la puesta lunar</small></article>
      </div>
      <div class="solunar-sunmoon"><span>☀️ Sol: ${time(sunTimes.sunrise)} / ${time(sunTimes.sunset)}</span><span>🌙 Luna: ${time(rise)} / ${time(set)}</span></div>`;
  }

  $('refreshClimateRiver')?.addEventListener('click', loadClimateRiver);
  $('solunarPrev')?.addEventListener('click',()=>{selectedDate.setDate(selectedDate.getDate()-1);renderSolunar();});
  $('solunarNext')?.addEventListener('click',()=>{selectedDate.setDate(selectedDate.getDate()+1);renderSolunar();});
  loadClimateRiver();
  renderSolunar();
})();
