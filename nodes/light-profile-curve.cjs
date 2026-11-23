// Relative PWM duty (0..1) and normalized CIE L* (0..1).
function toDuty(light) {
    return light <= 0.08 ? light * 2700 / 24389 : ((100 * light + 16) / 116) ** 3;
}
function toLight(duty) {
    return duty <= 216 / 24389 ? duty * 24389 / 2700 : (116 * Math.cbrt(duty) - 16) / 100;
}
function interpolateDuty(start, end, fraction) {
    if (fraction <= 0) return start;
    if (fraction >= 1) return end;
    return toDuty(toLight(start) + (toLight(end) - toLight(start)) * fraction);
}
module.exports = {toDuty, toLight, interpolateDuty};
