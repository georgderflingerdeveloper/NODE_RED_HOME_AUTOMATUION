// name: Decode ASCII 'SunS'
// nodeId: ce5d4697c4a4a6b5
// flow: Read SunSpec ID
// Decode 2x 16-bit registers into ASCII (big endian)
let regs = msg.payload;
if (!Array.isArray(regs) || regs.length < 2) return null;
let result = String.fromCharCode(
    (regs[0] >> 8) & 0xFF,
    regs[0] & 0xFF,
    (regs[1] >> 8) & 0xFF,
    regs[1] & 0xFF
);
msg.payload = result;
return msg;