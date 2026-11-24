const percentFormat = new Intl.NumberFormat('de-AT', {maximumFractionDigits: 1});

const pwmFormat = new Intl.NumberFormat('de-AT', {maximumFractionDigits: 2});

function formatPercent(value, formatter, minimum) {
    const percent = value * 100;
    return percent > 0 && percent < minimum ? '< ' + formatter.format(minimum) + ' %' : formatter.format(percent) + ' %';
}

function showChannel(card, duty, interactive = true) {
    const label = card.querySelector('.label');
    if (!label) return;
    let reading = card.querySelector('.gz-reading');
    if (!reading) {
        reading = document.createElement('span');
        reading.className = 'gz-reading';
        reading.append(document.createElement('strong'), document.createElement('small'));
        label.after(reading);
    }
    const known = Number.isFinite(duty);
    const light = known ? toLight(duty) : 0;
    const state = known ? (duty > 0 ? 'on' : 'off') : 'unknown';
    const level = known ? formatPercent(light, percentFormat, .1) : '—';
    const description = known ? (duty > 0 ? 'Ein' : 'Aus') + ' · ' + level : 'Unbekannt';
    const pwm = 'PWM ' + (known ? formatPercent(duty, pwmFormat, .01) : '—');
    reading.firstChild.textContent = description;
    reading.lastChild.textContent = pwm;
    card.dataset.state = state;
    card.dataset.level = level;
    card.setAttribute('aria-label', label.textContent + ' · ' + description + ' · ' + pwm);
    if (known && interactive) card.setAttribute('aria-pressed', String(duty > 0));
    else card.removeAttribute('aria-pressed');
    const color = light > 0
        ? 'rgb(' + [139 + 116 * light, 101 + 118 * light, 44 + 68 * light].map(Math.round).join(',') + ')'
        : 'var(--gh-muted,#838987)';
    card.style.setProperty('--gz-lamp-color', color);
    card.style.setProperty('--gz-lamp-fill', light > 0 ? color : 'transparent');
    card.style.setProperty('--gz-lamp-glow', light * 12 + 'px');
}

class RoomOutputs extends HTMLElement {
    connectedCallback() {
        this.controller = new AbortController();
        this.update(this.controller.signal);
    }
    disconnectedCallback() {
        this.controller.abort();
        clearTimeout(this.timer);
    }
    async update(signal) {
        const panel = this.closest('ui-card-panel');
        if (panel && this.getClientRects().length && !document.hidden) {
            let snapshot;
            try {
                const response = await fetch('/home-automation/georgszimmer/pwm', {cache:'no-store', signal});
                if (response.ok) snapshot = await response.json();
            } catch { /* Restore the readings on the next successful sample. */ }
            if (signal.aborted) return;
            const values = snapshot?.duty || Array(5).fill(null);
            const known = values.filter(Number.isFinite).length;
            const active = values.filter(v => v > 0).length;
            const headline = snapshot?.profile || (known < 5 ? 'Ausgangsdaten fehlen' : active ? 'Raumlicht' : 'Alle aus');
            this.firstElementChild.textContent = headline;
            this.firstElementChild.title = headline;
            this.lastElementChild.textContent = known === 5 ? active + ' von 5 aktiv' : known + ' von 5 bekannt';
            values.forEach((duty, i) => {
                const card = panel.querySelector('.gz-channel-' + (i + 1));
                if (card) showChannel(card, duty);
            });
        }
        if (!signal.aborted) this.timer = setTimeout(() => this.update(signal), 250);
    }
}
if (!customElements.get('gz-room-outputs')) customElements.define('gz-room-outputs', RoomOutputs);

// The kitchen profile publishes PWM frames for the configured 1–16 outputs.
class KitchenRoomOutputs extends HTMLElement {
    static get observedAttributes() { return ['values']; }

    attributeChangedCallback(_, previous, current) {
        if (!current || previous === current) return;
        const values = JSON.parse(current);
        if (this.children.length !== values.length) {
            this.replaceChildren(...values.map((_, index) => {
                const row = document.createElement('div');
                row.className = 'kr-channel';
                row.setAttribute('role', 'listitem');
                const icon = document.createElement('i');
                icon.className = 'fa fa-lightbulb-o';
                icon.setAttribute('aria-hidden', 'true');
                const label = document.createElement('span');
                label.className = 'label';
                label.textContent = 'LED ' + (index + 1);
                row.append(icon, label);
                return row;
            }));
        }
        values.forEach((duty, index) => showChannel(this.children[index], duty, false));
    }
}
if (!customElements.get('kitchen-room-outputs')) customElements.define('kitchen-room-outputs', KitchenRoomOutputs);

// The kitchen preview reads its locally calculated controller outputs.
class LightOutput extends HTMLElement {
    connectedCallback() {
        this.replaceChildren();
        this.style.cssText = 'display:block;padding:8px 0;font:inherit;color:inherit';
        const title = document.createElement('small');
        title.textContent = this.getAttribute('label') || 'Helligkeit je LED';
        this.grid = document.createElement('div');
        this.grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(76px,1fr));gap:6px;margin:6px 0';
        this.append(title, this.grid);
        this.update();
    }
    disconnectedCallback() { clearTimeout(this.timer); }
    paint(values) {
        if (this.grid.children.length !== values.length) {
            this.grid.replaceChildren(...values.map((_, i) => {
                const cell = document.createElement('div');
                cell.style.cssText = 'display:grid;text-align:center;padding:6px 2px;border:1px solid var(--gh-border,#777);border-radius:9px;font-variant-numeric:tabular-nums';
                const lamp = document.createElement('span');
                lamp.style.cssText = 'width:22px;height:22px;border-radius:50%;margin:2px auto 4px;border:1px solid #938169';
                const label = document.createElement('small');
                label.textContent = 'LED ' + (i + 1);
                cell.append(lamp, label, document.createElement('strong'), document.createElement('small'));
                return cell;
            }));
        }
        values.forEach((v, i) => {
            const [lamp, , level, duty] = this.grid.children[i].children;
            const known = Number.isFinite(v), light = known ? toLight(v) : 0;
            lamp.style.backgroundColor = known ? 'rgb(' + [44+211*light,40+151*light,35+51*light].map(Math.round).join(',') + ')' : 'transparent';
            level.textContent = known ? percentFormat.format(100 * light) + ' %' : '—';
            duty.textContent = known ? 'PWM ' + (100*v).toLocaleString('de-AT',{maximumFractionDigits:2}) + ' %' : 'PWM —';
        });
    }
    update() {
        if (this.getClientRects().length && !document.hidden) this.paint(this.readValues?.() || []);
        this.timer = setTimeout(() => this.update(), 100);
    }
}
if (!customElements.get('room-light-output')) customElements.define('room-light-output', LightOutput);
