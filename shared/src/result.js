export function ok(data) {
    return { ok: true, data };
}
export function err(code, message) {
    return { ok: false, error: { code, message } };
}
