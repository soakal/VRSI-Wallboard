import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIcs } from './icsGenerator.js'
import type { IcsEvent } from './icsGenerator.js'

// ── buildIcs ───────────────────────────────────────────────────────────────
test('buildIcs: empty events → minimal valid VCALENDAR', () => {
  const output = buildIcs([])
  assert.match(output, /BEGIN:VCALENDAR/)
  assert.match(output, /END:VCALENDAR/)
  assert.doesNotMatch(output, /BEGIN:VEVENT/)
})

test('buildIcs: single event includes all required fields', () => {
  const ev: IcsEvent = {
    uid: 'test-uid-123',
    dtstart: '20260620',
    dtend: '20260621',
    summary: 'Ship Job 123',
  }
  const output = buildIcs([ev])
  assert.match(output, /BEGIN:VEVENT/)
  assert.match(output, /UID:test-uid-123/)
  assert.match(output, /DTSTART;VALUE=DATE:20260620/)
  assert.match(output, /DTEND;VALUE=DATE:20260621/)
  assert.match(output, /SUMMARY:Ship Job 123/)
  assert.match(output, /DTSTAMP:/)
  assert.match(output, /END:VEVENT/)
})

test('buildIcs: optional description included when provided', () => {
  const ev: IcsEvent = {
    uid: 'desc-uid',
    dtstart: '20260620',
    dtend: '20260621',
    summary: 'Ship Job',
    description: 'PM: alice',
  }
  const output = buildIcs([ev])
  assert.match(output, /DESCRIPTION:PM: alice/)
})

test('buildIcs: special characters are escaped', () => {
  const ev: IcsEvent = {
    uid: 'esc-uid',
    dtstart: '20260620',
    dtend: '20260621',
    summary: 'Job; A,B\\C',
  }
  const output = buildIcs([ev])
  // semicolons → \;  commas → \,  backslashes → \\
  assert.match(output, /SUMMARY:Job\\;/)
  assert.match(output, /A\\,B\\\\C/)
})

test('buildIcs: long summary is line-folded at 75 octets', () => {
  const longSummary = 'A'.repeat(200)
  const ev: IcsEvent = {
    uid: 'fold-uid',
    dtstart: '20260620',
    dtend: '20260621',
    summary: longSummary,
  }
  const output = buildIcs([ev])
  // RFC 5545 §3.1: fold at 75 octets — continuation lines start with a space
  const lines = output.split('\r\n')
  const summaryLines = lines.filter((l) => l.startsWith('SUMMARY') || (l.startsWith(' ') && lines[lines.indexOf(l) - 1]?.startsWith('SUMMARY')))
  assert.ok(summaryLines.length > 1, 'Long summary should be folded across multiple lines')
  for (const line of summaryLines) {
    assert.ok(
      Buffer.byteLength(line, 'utf8') <= 75,
      `Folded line exceeds 75 octets: ${line}`,
    )
  }
})

test('buildIcs: output uses CRLF line endings', () => {
  const output = buildIcs([])
  assert.ok(output.includes('\r\n'), 'Output must use CRLF (RFC 5545 §3.1)')
})

test('buildIcs: ship-date regex — YYYY-MM-DD only feeds into dtstart format', () => {
  // Guard: the same regex used in the board.ts route to validate shipDateOverride
  // must pass for valid dates and fail for malformed ones.
  const SHIP_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
  assert.ok(SHIP_DATE_RE.test('2026-06-20'), 'valid date passes')
  assert.ok(!SHIP_DATE_RE.test('06/20/2026'), 'slash-format rejected')
  assert.ok(!SHIP_DATE_RE.test('20260620'), 'compact form rejected')
  assert.ok(!SHIP_DATE_RE.test(''), 'empty string rejected')
  assert.ok(!SHIP_DATE_RE.test('2026-6-2'), 'zero-padded required')
  // The regex does not validate calendar logic (month 13 passes); the server
  // only uses it to reject non-ISO-format strings before passing to new Date().
  assert.ok(SHIP_DATE_RE.test('2026-13-01'), 'month 13 — regex passes (range checked elsewhere)')
})
