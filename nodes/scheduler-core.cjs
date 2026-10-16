'use strict';

// Zeitentscheidungen ohne Node-RED/Dateisystem: mit festen Zeitpunkten testbar.
const VERSION = 1;
const ACTIONS = ['brightness', 'on', 'off', 'scenario'];
const clone = value => JSON.parse(JSON.stringify(value));
function check(ok, message) { if (!ok) throw new Error(message); }
function identifier(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value); }
function percent(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100; }
function clock(value) { return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function minute(value) { const [h, m] = value.split(':').map(Number); return h * 60 + m; }
function localTime(now, zone) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
    const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const date = `${p.year}-${p.month}-${p.day}`;
    const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
    return { date, day, minute: Number(p.hour) * 60 + Number(p.minute) };
}
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
function inValidity(plan, local) { return (!plan.validFrom || local.date >= plan.validFrom) && (!plan.validUntil || local.date <= plan.validUntil); }
function validatePlan(input) {
    const p = clone(input);
    check(identifier(p.id), 'Zeitplan-ID: 1–64 Buchstaben, Ziffern, _ oder -.');
    check(typeof p.name === 'string' && p.name.trim().length > 0 && p.name.length <= 100, 'Zeitplanname fehlt oder ist zu lang.');
    p.name = p.name.trim();
    check(typeof p.enabled === 'boolean', 'Aktiv muss true/false sein.');
    check(Number.isInteger(p.priority) && p.priority >= 0 && p.priority <= 100, 'Priorität muss 0–100 sein.');
    check(['device', 'room', 'group', 'all'].includes(p.target?.scope), 'Ungültiger Zielbereich.');
    check(typeof p.target.kind === 'string' && p.target.kind.length > 0, 'Geräteart fehlt.');
    if (p.target.scope !== 'all') check(identifier(p.target.id), 'Ziel-ID fehlt.');
    check(ACTIONS.includes(p.action?.type), 'Aktion wird nicht unterstützt.');
    if (p.action.type === 'brightness') check(percent(p.action.value), 'Helligkeit muss 0–100 sein.');
    if (p.action.type === 'scenario') check(typeof p.action.value === 'string' && p.action.value.trim().length > 0 && p.action.value.length <= 100, 'Szenarioname fehlt.');
    check(['window', 'weekly', 'once', 'interval', 'solar'].includes(p.type), 'Unbekannte Zeitregel.');
    if (['window', 'weekly', 'solar'].includes(p.type)) check(Array.isArray(p.days) && p.days.length > 0 && p.days.every(d => Number.isInteger(d) && d >= 1 && d <= 7), 'Mindestens einen gültigen Wochentag auswählen.');
    if (['window', 'weekly'].includes(p.type)) check(clock(p.start), 'Startzeit muss HH:MM sein.');
    if (p.type === 'window') {
        check(p.action.type === 'brightness', 'Zeitfenster steuern in dieser Version nur Helligkeit.');
        check(clock(p.end) && p.start !== p.end, 'Unterschiedliche Start-/Endzeit erforderlich.');
        check(percent(p.outsideValue), 'Helligkeit außerhalb des Fensters muss 0–100 sein.');
    }
    if (p.type === 'once') check(typeof p.at === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(p.at) && Number.isFinite(Date.parse(p.at)), 'Einmaltermin benötigt ISO-Zeit mit Zeitzone.');
    if (p.type === 'interval') check(Number.isInteger(p.intervalMinutes) && p.intervalMinutes >= 1 && p.intervalMinutes <= 1440, 'Intervall muss 1–1440 Minuten sein.');
    if (p.type === 'solar') {
        check(['sunrise', 'sunset'].includes(p.solarEvent), 'Sonnenereignis ungültig.');
        check(Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180, 'Breiten-/Längengrad ungültig.');
        check(Number.isInteger(p.offsetMinutes) && Math.abs(p.offsetMinutes) <= 720, 'Sonnenversatz muss -720 bis 720 Minuten sein.');
    }
    for (const key of ['validFrom', 'validUntil']) if (p[key]) check(validDate(p[key]), 'Gültigkeitsdatum ungültig.');
    check(!p.validFrom || !p.validUntil || p.validFrom <= p.validUntil, 'Gültigkeitsende liegt vor Beginn.');
    return p;
}
function windowValue(plan, local) {
    const start = minute(plan.start), end = minute(plan.end);
    const previousDay = local.day === 1 ? 7 : local.day - 1;
    const active = start < end
        ? plan.days.includes(local.day) && local.minute >= start && local.minute < end
        : (plan.days.includes(local.day) && local.minute >= start) || (plan.days.includes(previousDay) && local.minute < end);
    return { value: active ? plan.action.value : plan.outsideValue, active };
}
function matches(target, device) {
    return (target.kind === '*' || target.kind === device.kind) && (
        target.scope === 'all' || (target.scope === 'device' && target.id === device.id) ||
        (target.scope === 'room' && target.id === device.room) || (target.scope === 'group' && device.groups.includes(target.id)));
}
function supports(device, action) {
    return device.actions.includes(action.type) && (action.type !== 'scenario' || device.scenarios.includes(action.value));
}
function initialState() {
    return { schemaVersion: VERSION, revision: 0, enabled: true, timeZone: 'Europe/Vienna', targets: [], pauses: {}, fired: {}, sequence: 0,
        plans: [{ id: 'kitchen-night', name: 'Küche · Nachtabsenkung', enabled: false, type: 'window', priority: 10,
            target: { scope: 'device', id: 'kitchen-light', kind: 'light' }, action: { type: 'brightness', value: 30 },
            start: '21:00', end: '06:00', outsideValue: 100, days: [1, 2, 3, 4, 5, 6, 7] }] };
}

class Scheduler {
    constructor(state = initialState()) {
        check(state.schemaVersion === VERSION, 'Unbekannte Scheduler-Datenversion; Datei wird nicht überschrieben.');
        this.state = clone(state);
        this.state.plans = this.state.plans.map(validatePlan);
        check(new Set(this.state.plans.map(p => p.id)).size === this.state.plans.length, 'Doppelte Zeitplan-ID.');
        localTime(Date.now(), this.state.timeZone); // Zeitzone sofort prüfen.
        this.live = { seen: {}, applied: {}, pending: {}, feedback: {}, cronStatus: [], errors: [], lastTick: null };
    }
    online(id, now) { return this.live.seen[id] !== undefined && now - this.live.seen[id] < 180000; }
    paused(id, now) { return Number(this.state.pauses[id] || 0) > now; }
    eligible(plan, now) { return this.state.enabled && plan.enabled && inValidity(plan, localTime(now, this.state.timeZone)); }
    windows(device, now) {
        const local = localTime(now, this.state.timeZone);
        return this.state.plans.filter(p => p.type === 'window' && this.eligible(p, now) && matches(p.target, device) && supports(device, p.action))
            .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
            .map(p => ({ plan: p, ...windowValue(p, local) }));
    }
    command(plan, device, action, now) {
        const requestId = `scheduler-${++this.state.sequence}`;
        const message = { topic: 'scheduler/command', payload: { schemaVersion: VERSION, requestId, scheduleId: plan.id, targetId: device.id, roomId: device.room, action: clone(action), issuedAt: new Date(now).toISOString() } };
        this.live.pending[requestId] = { targetId: device.id, at: now };
        this.live.feedback[device.id] = { at: now, ok: null, text: `Gesendet: ${action.type} ${action.value ?? ''}`, requestId };
        return message;
    }
    reconcile(now) {
        const commands = [];
        for (const device of this.state.targets) {
            if (!this.online(device.id, now) || this.paused(device.id, now)) continue;
            const winner = this.windows(device, now)[0];
            if (!winner) { delete this.live.applied[device.id]; continue; }
            const signature = `${winner.plan.id}:${winner.value}:${winner.active}`;
            if (this.live.applied[device.id] === signature) continue;
            this.live.applied[device.id] = signature;
            commands.push(this.command(winner.plan, device, { type: 'brightness', value: winner.value }, now));
        }
        for (const [id, request] of Object.entries(this.live.pending)) {
            if (now - request.at > 15000) {
                this.live.feedback[request.targetId] = { at: now, ok: false, text: 'Keine Controller-Bestätigung innerhalb 15 s.', requestId: id };
                delete this.live.pending[id]; // Keine blinde Wiederholung von Schaltbefehlen.
            }
        }
        return commands;
    }
    register(target, now) {
        check(identifier(target?.id) && identifier(target.room) && identifier(target.kind), 'Ungültige Zielregistrierung.');
        check(typeof target.name === 'string' && target.name.length <= 100, 'Zielname ungültig.');
        check(Array.isArray(target.actions) && target.actions.every(a => ACTIONS.includes(a)), 'Unbekannte Zielaktionen.');
        check(Array.isArray(target.groups) && target.groups.every(identifier), 'Zielgruppen ungültig.');
        check(Array.isArray(target.scenarios) && target.scenarios.every(s => typeof s === 'string'), 'Szenarioliste ungültig.');
        const descriptor = clone(target);
        const index = this.state.targets.findIndex(t => t.id === target.id);
        if (index < 0) this.state.targets.push(descriptor); else this.state.targets[index] = descriptor;
        if (!this.online(target.id, now)) delete this.live.applied[target.id];
        this.live.seen[target.id] = now;
    }
    fire(name, timestamp, now) {
        if (name === 'scheduler-watchdog') return [];
        const plan = this.state.plans.find(p => `schedule-${p.id}` === name);
        if (!plan || !this.eligible(plan, now) || plan.type === 'window') return [];
        // Veraltete Nachrichten werden nicht nachgeholt; Uhrzeit und Tag gelten am Ereignis.
        if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 120000) return [];
        const local = localTime(timestamp, this.state.timeZone);
        if (['weekly', 'solar'].includes(plan.type) && !plan.days.includes(local.day)) return [];
        const key = plan.type === 'interval' ? String(timestamp) : plan.type === 'once' ? 'once' : local.date;
        if (this.state.fired[plan.id] === key) return [];
        this.state.fired[plan.id] = key; // Vor Versand persistent: kein Wiederholen nach Neustart.
        const commands = [];
        for (const device of this.state.targets) {
            if (!matches(plan.target, device) || !supports(device, plan.action) || !this.online(device.id, now) || this.paused(device.id, now)) continue;
            const window = this.windows(device, now)[0];
            if (plan.action.type === 'brightness' && window && (window.plan.priority > plan.priority || (window.plan.priority === plan.priority && window.plan.id < plan.id))) continue;
            commands.push(this.command(plan, device, plan.action, now));
        }
        return commands;
    }
    cronCommands(now) {
        const options = [];
        for (const p of this.state.plans.filter(p => p.enabled)) {
            const base = { name: `schedule-${p.id}`, topic: 'scheduler/fire', payloadType: 'default', expressionType: 'cron' };
            if (p.type === 'window') {
                for (const [suffix, time, days] of [['start', p.start, p.days], ['end', p.end, minute(p.start) > minute(p.end) ? p.days.map(d => d % 7 + 1) : p.days]]) {
                    const [h, m] = time.split(':').map(Number);
                    if (this.state.enabled) options.push({ ...base, name: `${base.name}-${suffix}`, expression: `0 ${m} ${h} * * ${days.map(d => d % 7).join(',')}` });
                }
                continue;
            }
            if (p.type === 'weekly') { const [h, m] = p.start.split(':').map(Number); base.expression = `0 ${m} ${h} * * ${p.days.map(d => d % 7).join(',')}`; }
            if (p.type === 'once') { if (Date.parse(p.at) <= now || this.state.fired[p.id] === 'once') continue; base.expressionType = 'dates'; base.expression = p.at; }
            if (p.type === 'interval') { const step = p.intervalMinutes * 60000; base.expressionType = 'dates'; base.expression = new Date((Math.floor(now / step) + 1) * step).toISOString(); }
            if (p.type === 'solar') Object.assign(base, { expressionType: 'solar', solarType: 'selected', solarEvents: p.solarEvent, location: `${p.latitude} ${p.longitude}`, offset: p.offsetMinutes });
            if (this.state.enabled) options.push(base);
        }
        // Static watchdog survives remove-all-dynamic and supplies restart reconciliation.
        return [{ topic: 'remove-all-dynamic' }, ...(options.length ? [{ payload: { command: 'add', ...options[0] } }, ...options.slice(1).map(option => ({ payload: { command: 'add', ...option } }))] : []), { topic: 'list-all' }];
    }
    handle(message, now = Date.now()) {
        const p = message.payload || {};
        let commands = [], rebuild = false, notice = '';
        if (message.topic === 'scheduler/register') this.register(p, now);
        else if (message.topic === 'scheduler/ack') {
            const pending = this.live.pending[p.requestId];
            if (pending && pending.targetId === p.targetId) {
                this.live.feedback[p.targetId] = { at: now, ok: p.ok === true, text: String(p.text || '').slice(0, 240), requestId: p.requestId };
                delete this.live.pending[p.requestId];
            }
        } else if (message.topic === 'scheduler/cron-error') {
            notice = `Zeitgeberfehler: ${message.error?.message || p.message || 'unbekannt'}`;
            this.live.errors = [notice];
        } else if (message.cronplus?.triggerTimestamp || p?.triggerTimestamp) {
            const info = message.cronplus || p;
            const stamp = Number(info.triggerTimestamp);
            if ((info.config?.name || info.name) === "scheduler-watchdog" && Number.isFinite(stamp) && Math.abs(now - stamp) <= 45000) this.live.lastTick = now;
            commands = this.fire(info.config?.name || info.name, Number.isFinite(stamp) ? stamp : Date.parse(info.triggerTimestamp), now);
            const plan = this.state.plans.find(item => `schedule-${item.id}` === (info.config?.name || info.name));
            if (plan?.type === 'interval') rebuild = true;
        } else if (message.topic === 'scheduler/manage') {
            if (p.command !== 'List' && p.command !== 'PauseTarget' && p.command !== 'ResumeTarget') check(p.revision === this.state.revision, 'Zeitpläne wurden inzwischen geändert. Liste laden und erneut bearbeiten.');
            switch (p.command) {
                case 'List': break;
                case 'Save': {
                    const plan = validatePlan(p.plan);
                    const index = this.state.plans.findIndex(item => item.id === plan.id);
                    check(!this.state.plans.some(item => item.id !== plan.id && item.name === plan.name), 'Zeitplanname bereits vorhanden.');
                    if (index < 0) this.state.plans.push(plan); else this.state.plans[index] = plan;
                    delete this.state.fired[plan.id];
                    this.live.applied = {}; rebuild = true; this.state.revision++; notice = 'Zeitplan gespeichert.'; break;
                }
                case 'Delete':
                    this.state.plans = this.state.plans.filter(item => item.id !== p.id);
                    delete this.state.fired[p.id]; this.live.applied = {}; rebuild = true; this.state.revision++; notice = 'Zeitplan gelöscht. Ausgänge bleiben bis zur nächsten Vorgabe unverändert.'; break;
                case 'Enable':
                    check(typeof p.enabled === 'boolean', 'Automatik aktiv: true/false erwartet.');
                    this.state.enabled = p.enabled; this.live.applied = {}; rebuild = true; this.state.revision++; break;
                case 'PauseTarget':
                    check(this.state.targets.some(t => t.id === p.id), 'Unbekanntes Ziel.');
                    this.state.pauses[p.id] = now + 3600000; delete this.live.applied[p.id]; notice = 'Ziel für 60 Minuten pausiert.'; break;
                case 'ResumeTarget':
                    delete this.state.pauses[p.id]; delete this.live.applied[p.id]; notice = 'Automatik für Ziel fortgesetzt.'; break;
                default: throw new Error('Unbekannter Verwaltungsbefehl.');
            }
        } else if (message.topic === 'scheduler/start') rebuild = true;
        else if (p.command?.command === 'list-all' && Array.isArray(p.result)) {
            this.live.cronStatus = clone(p.result);
            // Nur eine vollständige Zeitgeber-Liste plus frischer Tick bestätigt die Erholung.
            const names = new Set(p.result.map(entry => entry.config?.name));
            const expected = this.cronCommands(now).filter(entry => entry.payload?.command === 'add').map(entry => entry.payload.name);
            if (this.live.lastTick !== null && now - this.live.lastTick <= 45000 && names.has('scheduler-watchdog') && expected.every(name => names.has(name))) this.live.errors = [];
        }
        commands.push(...this.reconcile(now));
        const triggered = message.cronplus?.triggerTimestamp || p.triggerTimestamp;
        const status = this.status(now, notice);
        if (message.topic === 'scheduler/manage') status.ack = { command:p.command, id:p.plan?.id || p.id, token:p.token, revision:this.state.revision };
        return { commands, cron: rebuild ? this.cronCommands(now) : (triggered || p.command === 'List') ? [{topic:'list-all'}] : [], status };
    }
    handleBatch(messages, now = Date.now()) {
        const results = messages.map(message => this.handle(message, now));
        const selected = new Map();
        for (const command of results.flatMap(r => r.commands)) {
            const request = command.payload;
            const key = request.targetId + ':' + (request.action.type === 'brightness' ? 'brightness' : 'selection');
            const previous = selected.get(key);
            const plan = this.state.plans.find(p => p.id === request.scheduleId);
            const oldPlan = previous && this.state.plans.find(p => p.id === previous.payload.scheduleId);
            if (!previous || plan.priority > oldPlan.priority || (plan.priority === oldPlan.priority && plan.id < oldPlan.id)) selected.set(key, command);
        }
        const commands = [...selected.values()];
        for (const result of results) for (const message of result.commands) {
            if (!commands.includes(message)) delete this.live.pending[message.payload.requestId];
        }
        for (const message of commands) this.live.feedback[message.payload.targetId] = { at:now,ok:null,text:`Gesendet: ${message.payload.action.type} ${message.payload.action.value ?? ''}`,requestId:message.payload.requestId };
        return { commands, cron:results.flatMap(r => r.cron), status:this.status(now) };
    }
    // Priorität: Fehler > Warnung > Läuft > Idle. Zustand wird niemals als Live-Fakt gespeichert.
    health(now) {
        const result = (state, label, color, reasons) => ({ state, label, color, reasons });
        if (this.live.errors.length) return result('error', 'Fehler', 'red', clone(this.live.errors));
        if (!this.state.enabled) return result('idle', 'Idle', 'grey', ['Automatik pausiert.']);
        const plans = this.state.plans.filter(plan => this.eligible(plan, now)
            && !(plan.type === 'once' && (this.state.fired[plan.id] === 'once' || Date.parse(plan.at) <= now)));
        if (!plans.length) return result('idle', 'Idle', 'grey', ['Kein aktuell gültiger aktiver Zeitplan.']);
        const warnings = [], errors = [];
        if (this.live.lastTick === null || now - this.live.lastTick > 45000) warnings.push('Keine aktuelle Zeitgeber-Rückmeldung (45 s).');
        const relevant = new Map();
        for (const plan of plans) {
            const targets = this.state.targets.filter(target => matches(plan.target, target) && supports(target, plan.action));
            if (!targets.length) warnings.push(`${plan.name}: kein passender registrierter Empfänger.`);
            for (const target of targets) relevant.set(target.id, target);
        }
        for (const target of relevant.values()) {
            if (!this.online(target.id, now)) warnings.push(`${target.name}: keine aktuelle Registrierung.`);
            if (this.paused(target.id, now)) warnings.push(`${target.name}: vorübergehend pausiert.`);
            const feedback = this.live.feedback[target.id];
            if (feedback?.ok === false) errors.push(`${target.name}: ${feedback.text || 'Befehl fehlgeschlagen.'}`);
        }
        if (errors.length) return result('error', 'Fehler', 'red', errors);
        if (warnings.length) return result('warning', 'Warnung', 'yellow', warnings);
        return result('running', 'Läuft', 'green', ['Zeitsteuerung bereit; Empfänger erreichbar.']);
    }
    status(now, notice = '') {
        return { revision: this.state.revision, enabled: this.state.enabled, timeZone: this.state.timeZone,
            plans: this.state.plans.map(p => ({...clone(p), matchedTargets:this.state.targets.filter(t => matches(p.target,t) && supports(t,p.action)).length, next: this.live.cronStatus.filter(s => s.config?.name === `schedule-${p.id}` || (p.type === 'window' && [`schedule-${p.id}-start`, `schedule-${p.id}-end`].includes(s.config?.name))).map(s => s.status?.nextDate).filter(Boolean).filter(date => inValidity(p,localTime(Date.parse(date),this.state.timeZone))).sort()[0] || null})), targets: this.state.targets.map(t => ({ ...clone(t), online: this.online(t.id, now), pausedUntil: this.state.pauses[t.id] || 0, feedback: this.live.feedback[t.id] || null,
                effective: this.windows(t, now)[0] ? { plan: this.windows(t, now)[0].plan.name, value: this.windows(t, now)[0].value } : null })),
            now, notice, health: this.health(now), errors: clone(this.live.errors), cronStatus: clone(this.live.cronStatus) };
    }
}
module.exports = { Scheduler, initialState, validatePlan, localTime, windowValue, matches, supports };
