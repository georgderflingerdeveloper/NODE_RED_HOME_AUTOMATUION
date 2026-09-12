'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function safeInstanceName(instanceName) {
    const safe = String(instanceName ?? '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!safe) throw new RangeError('instanceName darf nicht leer sein');
    return safe;
}

class LightControllerScenarioStore {
    constructor(options = {}) {
        const userDirectory = options.userDirectory
            || process.env.NODE_RED_USER_DIR
            || path.join(os.homedir(), '.node-red');
        this.directory = path.resolve(options.directory || path.join(
            userDirectory,
            'data',
            'light-controller-scenarios',
        ));
    }

    fileFor(instanceName) {
        return path.join(this.directory, `${safeInstanceName(instanceName)}.json`);
    }

    load(instanceName) {
        const file = this.fileFor(instanceName);
        if (!fs.existsSync(file)) return null;
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new TypeError(`Ungültige LightController-Konfiguration: ${file}`);
        }
        return JSON.parse(JSON.stringify(parsed));
    }

    save(instanceName, configuration) {
        if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
            throw new TypeError('configuration muss ein Objekt sein');
        }
        fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
        const file = this.fileFor(instanceName);
        const temporary = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(temporary, `${JSON.stringify(configuration, null, 2)}\n`, { mode: 0o600 });
        fs.renameSync(temporary, file);
        fs.chmodSync(file, 0o600);
        return file;
    }
}

module.exports = {
    LightControllerScenarioStore,
    safeInstanceName,
};
