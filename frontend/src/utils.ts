/**
 * Formats a stored phone string for display.
 *
 * 11-digit numbers starting with 7/8 (Russia / Kazakhstan):
 *   77715986273 → +7 (771) 598-6273
 *
 * Unresolved LID (fallback, rare after server-side resolution):
 *   lid_31233555869719 → WA ID: 3123…
 */
export function formatPhone(raw: string): string {
    if (raw.startsWith('lid_')) {
        const id = raw.slice(4);
        return 'WA ID: ' + (id.length > 10 ? id.slice(0, 10) + '…' : id);
    }
    const d = raw.replace(/\D/g, '');
    if (d.length === 11 && (d[0] === '7' || d[0] === '8')) {
        return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
    }
    if (d.length >= 10) {
        return '+' + d;
    }
    return raw;
}
