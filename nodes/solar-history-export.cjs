'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const {METRICS,trendRequest,trendFilter} = require('./solar-trend.cjs');
const DATASETS = Object.freeze({
 power: { table: 'solar_power_samples', time: 'observed_at' },
 hourly: { table: 'hourly_snapshots', time: 'interval_start' },
 meter: { table: 'solaredge_meter_readings', time: 'observed_at' },
 inverter: { table: 'solaredge_inverter_readings', time: 'observed_at' },
 daily: { table: 'daily_energy_balance', time: 'day' },
 grid: { table: 'daily_energy_reconciliation', time: 'day' },
 cloud: { table: 'solaredge_cloud_energy', time: 'interval_start' },
});
function exportRequest(query = {}) {
 const dataset = String(query.dataset || 'hourly');
 if (!Object.hasOwn(DATASETS, dataset)) throw Error('Unbekannter Datensatz.');
 const boundary = (value, end) => {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Datum bitte als JJJJ-MM-TT angeben.');
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) throw Error('Ungültiges Datum.');
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
 };
 const from = boundary(query.from, false), to = boundary(query.to, true);
 if (from && to && from >= to) throw Error('Das Enddatum liegt vor dem Startdatum.');
 return {dataset, ...DATASETS[dataset], from, to};
}
function csvCell(value) {
 if (value == null) return '';
 let text = String(value);
 // Spreadsheet-Formeln aus Textfeldern neutralisieren; Zahlen bleiben Zahlen.
 if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
 return '"' + text.replace(/"/g, '""') + '"';
}
function markdownCell(value) {
 if (value == null) return 'NULL';
 return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('\\','\\\\').replaceAll('|','\\|').replace(/\r\n|\r|\n/g,'<br>');
}
function markdownRow(values) { return '| ' + values.map(markdownCell).join(' | ') + ' |\n'; }
function markdownHeader(spec,columns,from,to) {
 const lines=['# Solarhistorie', '', 'Quelle: '+spec.table, 'Zeitraum: '+(from || 'erste Aufzeichnung')+' (inklusive) bis '+(to || 'letzte Aufzeichnung enthalten')+(to ? ' (exklusive)' : ''),
  'Zeitstempel mit Z sind UTC. Tageswerte verwenden das gespeicherte Kalenderdatum.'];
 if (spec.dataset==='trend') {
  lines.push('Messgrößen: '+spec.metrics.map(key=>METRICS[key].label+' ('+spec.unit+')').join(', '),
   'Statusfilter: '+({all:'alle Datensätze',online:'online',offline:'offline oder unvollständig'}[spec.status]));
 }
 lines.push('Einheiten laut Spaltennamen: _w = Watt, _wh = Wattstunden, _kwh = Kilowattstunden.',
  'NULL = fehlender Wert. 0 ist ein gespeicherter Zahlenwert. Bei online = 0 bzw. Offline-Status fehlen verlässliche Messwerte.',
  '', '## Aufzeichnungen', '');
 return lines.join('\n')+'\n'+markdownRow(columns)+markdownRow(columns.map(()=>'---'));
}
async function streamExport(databasePath, request, response, format = 'csv') {
 let spec;
 try { spec = request.query?.dataset === 'trend' ? {...trendRequest(request.query),dataset:'trend'} : exportRequest(request.query); }
 catch (error) { response.status(400).json({error: error.message}); return; }
 let db;
 try {
  db = new DatabaseSync(databasePath, {readOnly:true});
  db.exec('PRAGMA busy_timeout=5000; BEGIN');
  const {table,time,dataset} = spec;
  const from = dataset === 'trend' ? spec.start : time === 'day' ? spec.from?.slice(0,10) : spec.from;
  const to = dataset === 'trend' ? spec.end : time === 'day' ? spec.to?.slice(0,10) : spec.to;
  const columns = dataset === 'trend' ? [time,spec.statusColumn,...spec.metrics.map(key=>METRICS[key][spec.mode])] : db.prepare(`PRAGMA table_info(${table})`).all().map(row=>row.name);
  const stmt = db.prepare(dataset === 'trend' ? `SELECT ${columns.join(',')} FROM ${table} WHERE ${trendFilter(spec)} ORDER BY ${time}` : `SELECT * FROM ${table} WHERE (? IS NULL OR ${time}>=?) AND (? IS NULL OR ${time}<?) ORDER BY ${time}`);
  const markdown = format === 'md';
  response.set('Content-Type', (markdown ? 'text/markdown' : 'text/csv')+'; charset=utf-8');
  response.set('Content-Disposition',`attachment; filename="solar-${dataset}.${format}"`);
  response.set('Cache-Control','no-store');
  response.write(markdown ? markdownHeader(spec,columns,from,to) : '\uFEFF' + columns.map(csvCell).join(';') + '\r\n');
  let count=0;
  const parameters=dataset === 'trend' ? [from,to] : [from||null,from||null,to||null,to||null];
  for (const row of stmt.iterate(...parameters)) {
   if (response.destroyed) break;
   count++;
   const values=columns.map(key=>row[key]);
   if (!response.write(markdown ? markdownRow(values) : values.map(csvCell).join(';')+'\r\n')) {
    await new Promise(resolve => {
     const finish=()=>{response.off('drain',finish);response.off('close',finish);resolve();};
     response.once('drain',finish);response.once('close',finish);
     if(response.destroyed) finish();
    });
   }
  }
  if(markdown && !response.destroyed)response.write('\nAnzahl der Aufzeichnungen: '+count+'\n');
  response.end();
 } catch (error) {
  if (response.headersSent) response.destroy(error);
  else response.status(500).json({error:'Solar-Export konnte nicht erstellt werden.'});
 } finally { if(db) db.close(); }
}
function historyStatus(databasePath) {
 const db = new DatabaseSync(databasePath,{readOnly:true});
 try {
  const samples = db.prepare('SELECT COUNT(*) AS count,MIN(observed_at) AS first,MAX(observed_at) AS last FROM solar_power_samples').get();
  const hourly = db.prepare('SELECT COUNT(*) AS count,MIN(interval_start) AS first,MAX(interval_start) AS last FROM hourly_snapshots').get();
  let backup = {state:'not-configured',message:'Automatische Sicherung noch nicht eingerichtet.'};
  const file = path.join(path.dirname(databasePath),'backup-status.json');
  if(fs.existsSync(file)) {try{backup=JSON.parse(fs.readFileSync(file,'utf8'));}catch{backup={state:'error',message:'Sicherungsstatus nicht lesbar.'};}}
  return {samples,hourly,backup};
 } finally {db.close();}
}
module.exports = {DATASETS,exportRequest,csvCell,streamExport,historyStatus};
