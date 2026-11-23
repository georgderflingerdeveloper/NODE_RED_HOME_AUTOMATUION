const HOUR = 3600000;
const START = Date.parse('2026-12-04T00:00:00+01:00');
const URL_LOYAL = 'https://www.energieag.at/energie-ag/strom/okostrom-loyal-6b25bcdb';
const FIXED = 'Energie AG';
const MARKET = 'aWATTar';
const iso = ms => new Date(ms).toISOString();

function parseOffer(html) {
    if (!/<title>Ökostrom Loyal - Energie AG<\/title>/i.test(html)) throw Error('Produktseite nicht erkannt');
    const text = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;|\s+/g, ' ').replace(/ +/g, ' ');
    const prices = [...text.matchAll(/Arbeitspreis (\d+,\d+) ct\/kWh BRUTTO Grundpreis (\d+,\d+) €\/Monat BRUTTO/g)];
    if (prices.length !== 1) throw Error('Bruttopreise nicht eindeutig lesbar');
    return {work: Number(prices[0][1].replace(',', '.')), base: Number(prices[0][2].replace(',', '.'))};
}

function openPlan(db) {
    db.exec(`CREATE TABLE IF NOT EXISTS loyal_plan (
        id INTEGER PRIMARY KEY, effective INTEGER NOT NULL, mode TEXT NOT NULL,
        work REAL NOT NULL, base REAL NOT NULL)`);
    db.prepare('INSERT OR IGNORE INTO loyal_plan VALUES (1, ?, ?, ?, ?)').run(START, 'loyal', 14.90, 4.62);
    const all = () => db.prepare('SELECT * FROM loyal_plan ORDER BY effective,id').all();
    function confirm(input, now) {
        const rows = all();
        if (input.revision !== rows.at(-1).id) throw Error('Auswahl inzwischen geändert. Bitte erneut prüfen.');
        if (input.confirmed !== true || !['loyal','market'].includes(input.mode) ||
            ![input.work,input.base].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1000)) {
            throw Error('Bitte Tarif und beide Bruttopreise prüfen und bestätigen.');
        }
        const effective = Math.max(START, (Math.floor(now / HOUR) + 1) * HOUR);
        db.prepare('INSERT INTO loyal_plan(effective,mode,work,base) VALUES (?,?,?,?)')
            .run(effective, input.mode, input.work, input.base);
    }
    return {all, confirm};
}

function project(rows, market, now) {
    const hour = Math.floor(now / HOUR) * HOUR;
    const settings = time => rows.findLast(r => r.effective <= time);
    const slots = [];
    for (let t = hour; t < hour + 48 * HOUR; t += HOUR) {
        const plan = settings(t);
        if (plan?.mode === 'loyal') {
            slots.push({provider: FIXED, validFrom: iso(t), validUntil: iso(t + HOUR),
                priceCtPerKWh: plan.work, marketPriceEurPerMWh: null});
        }
    }
    for (const slot of market?.slots || []) {
        const start = Date.parse(slot.validFrom);
        if (Date.parse(slot.validUntil) > now && settings(start)?.mode !== 'loyal') slots.push({...slot, provider: MARKET});
    }
    slots.sort((a,b) => a.validFrom.localeCompare(b.validFrom));
    const current = slots.find(s => Date.parse(s.validFrom) <= now && now < Date.parse(s.validUntil));
    const provider = settings(now)?.mode === 'loyal' ? FIXED : MARKET;
    return {...current, provider, online: Boolean(current), slots, fetchedAt: iso(now),
        priceEurPerKWh: current ? current.priceCtPerKWh / 100 : null,
        tariffType: provider === FIXED ? 'Ökostrom Loyal · Arbeitspreis brutto' : 'Börsenpreis ohne Gebühren'};
}

module.exports = {openPlan, project, parseOffer, URL_LOYAL, HOUR, START};
