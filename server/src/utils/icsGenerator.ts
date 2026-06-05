const CRLF = '\r\n'

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
}

// Fold lines longer than 75 octets per RFC 5545 §3.1. Folding must be measured
// in UTF-8 octets, not JS string length: a line of multibyte characters can be
// <=75 code units yet exceed 75 octets on the wire. We also never split a
// multi-octet character across a fold boundary. Continuation lines begin with a
// single space and carry up to 74 octets so the wrapped line stays within 75.
function fold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line

  const segments: string[] = []
  let current = ''
  let currentBytes = 0
  let limit = 75 // first line: 75 octets; continuation lines: 1 space + 74 = 75

  for (const char of line) {
    const charBytes = Buffer.byteLength(char, 'utf8')
    if (currentBytes + charBytes > limit) {
      segments.push(current)
      current = ''
      currentBytes = 0
      limit = 74 // continuation lines reserve one octet for the leading space
    }
    current += char
    currentBytes += charBytes
  }
  segments.push(current)

  return segments.join(`${CRLF} `)
}

export interface IcsEvent {
  uid: string
  dtstart: string  // YYYYMMDD
  dtend: string    // YYYYMMDD — exclusive end; +1 day for all-day events
  summary: string
  description?: string
}

// UTC timestamp in iCalendar DATE-TIME form: YYYYMMDDTHHMMSSZ
function icsDtStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export function buildIcs(events: IcsEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VRSI WallBoard//Ship Dates//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:VRSI Ship Dates',
  ]

  // DTSTAMP is REQUIRED in every VEVENT (RFC 5545 §3.6.1). Use one timestamp
  // for the whole document so the output is deterministic per generation.
  const dtstamp = icsDtStamp(new Date())

  for (const ev of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(fold(`UID:${escapeText(ev.uid)}`))
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(`DTSTART;VALUE=DATE:${ev.dtstart}`)
    lines.push(`DTEND;VALUE=DATE:${ev.dtend}`)
    lines.push(fold(`SUMMARY:${escapeText(ev.summary)}`))
    if (ev.description) lines.push(fold(`DESCRIPTION:${escapeText(ev.description)}`))
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join(CRLF) + CRLF
}
