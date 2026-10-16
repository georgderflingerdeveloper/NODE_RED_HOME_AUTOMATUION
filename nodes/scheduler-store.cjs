'use strict';
const fs = require('node:fs');
const path = require('node:path');
class SchedulerStore {
    constructor(file) { this.file = file; }
    load() { return fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : undefined; }
    save(data) {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.${process.pid}.tmp`;
        let fd;
        try {
            fd = fs.openSync(temporary, 'w', 0o600);
            fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
            fs.renameSync(temporary, this.file);
        } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
}
module.exports = { SchedulerStore };
