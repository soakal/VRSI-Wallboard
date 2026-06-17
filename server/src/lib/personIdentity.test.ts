import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePersonKey, canonicalPersonName, samePerson } from './personIdentity.js'

// These tests run with PERSON_ALIASES unset (no env aliases loaded).
// They cover the no-alias fallback: canonicalPersonName returns the normalized
// key; samePerson requires non-empty and matching normalized keys.

// ── normalizePersonKey ─────────────────────────────────────────────────────
test('normalizePersonKey: null/undefined → empty string', () => {
  assert.equal(normalizePersonKey(null), '')
  assert.equal(normalizePersonKey(undefined), '')
})

test('normalizePersonKey: trims and lowercases', () => {
  assert.equal(normalizePersonKey('  Alice  '), 'alice')
  assert.equal(normalizePersonKey('Bob.Smith'), 'bob.smith')
})

// ── canonicalPersonName ────────────────────────────────────────────────────
test('canonicalPersonName: empty input → empty string', () => {
  assert.equal(canonicalPersonName(null), '')
  assert.equal(canonicalPersonName(''), '')
  assert.equal(canonicalPersonName('  '), '')
})

test('canonicalPersonName: no alias → returns normalized key', () => {
  assert.equal(canonicalPersonName('Alice'), 'alice')
  assert.equal(canonicalPersonName('alice@example.com'), 'alice@example.com')
})

// ── samePerson ─────────────────────────────────────────────────────────────
test('samePerson: equal names (case-insensitive)', () => {
  assert.equal(samePerson('Alice', 'alice'), true)
  assert.equal(samePerson('alice@example.com', 'Alice@Example.COM'), true)
})

test('samePerson: different names', () => {
  assert.equal(samePerson('alice@example.com', 'bob@example.com'), false)
})

test('samePerson: empty strings → false (guards against collating two blanks)', () => {
  assert.equal(samePerson('', ''), false)
  assert.equal(samePerson(null, null), false)
  assert.equal(samePerson(undefined, undefined), false)
})

test('samePerson: one empty, one non-empty → false', () => {
  assert.equal(samePerson('', 'alice'), false)
  assert.equal(samePerson('alice', ''), false)
})
