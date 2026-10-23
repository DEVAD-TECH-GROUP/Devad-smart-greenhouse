import { SOIL_LABEL, LIGHT_LABEL, TANK_LABEL } from '../lib/format.js';

function Reading({ label, value, unit, note, tone = '' }) {
  return (
    <div className="px-5 py-4 first:pl-0 sm:border-l sm:border-chalk-dim/15 sm:first:border-l-0">
      <p className="text-sm text-chalk-dim">{label}</p>
      <p className="mt-1 font-display text-4xl font-semibold leading-none tracking-tight">
        {value}
        {unit && <span className="ml-1 text-lg font-normal text-chalk-dim">{unit}</span>}
      </p>
      <p className={`mt-2 text-sm ${tone || 'text-chalk-dim'}`}>{note}</p>
    </div>
  );
}

export default function Readings({ telemetry: t }) {
  const dash = '–';
  const tankTone = t?.tank === 'empty' ? 'text-bloom' : t?.tank === 'full' ? 'text-leaf' : 'text-mist';
  return (
    <div className="grid grid-cols-2 gap-y-2 sm:grid-cols-5">
      <Reading
        label="Air temperature"
        value={t ? t.temp.toFixed(1) : dash}
        unit="°C"
        note={t?.fault ? 'Sensor not responding' : t?.highTemp ? 'Too warm, cooling' : 'In range'}
        tone={t?.fault ? 'text-bloom' : t?.highTemp ? 'text-sun' : ''}
      />
      <Reading label="Humidity" value={t ? Math.round(t.hum) : dash} unit="%" note="Relative humidity" />
      <Reading
        label="Soil moisture"
        value={t ? t.soil : dash}
        unit="%"
        note={t ? SOIL_LABEL[t.soilState] : 'No data'}
        tone={t?.soilState === 0 ? 'text-sun' : ''}
      />
      <Reading
        label="Light"
        value={t ? LIGHT_LABEL[t.lightState] : dash}
        note={t ? `Sensor reading ${t.ldr}` : 'No data'}
      />
      <Reading label="Water tank" value={t ? TANK_LABEL[t.tank] : dash} note={t?.tank === 'empty' ? 'Drip paused' : 'Level sensors'} tone={t ? tankTone : ''} />
    </div>
  );
}
