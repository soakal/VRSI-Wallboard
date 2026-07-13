import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Request, Response, NextFunction } from 'express'
import { errorHandler, type AppError } from './errorHandler.js'

function fakeReqRes(): {
  req: Request
  res: Response
  sent: { status?: number; body?: unknown }
} {
  const sent: { status?: number; body?: unknown } = {}
  const res = {
    status(code: number) {
      sent.status = code
      return this
    },
    json(body: unknown) {
      sent.body = body
      return this
    },
  } as unknown as Response
  const req = { path: '/api/board/jobs/9001/status', method: 'PATCH' } as Request
  return { req, res, sent }
}

const noopNext: NextFunction = () => undefined

test('SQLITE_BUSY maps to a retryable 503 with an actionable message', () => {
  const { req, res, sent } = fakeReqRes()
  const err = new Error('database is locked') as AppError & { code: string }
  err.code = 'SQLITE_BUSY'
  errorHandler(err, req, res, noopNext)
  assert.equal(sent.status, 503)
  const body = sent.body as { error: { code: string; message: string } }
  assert.equal(body.error.code, 'db_busy')
  assert.match(body.error.message, /locked by another program/i)
  assert.match(body.error.message, /NOT saved/i)
})

test('SQLITE_BUSY_SNAPSHOT is treated the same as SQLITE_BUSY', () => {
  const { req, res, sent } = fakeReqRes()
  const err = new Error('snapshot busy') as AppError & { code: string }
  err.code = 'SQLITE_BUSY_SNAPSHOT'
  errorHandler(err, req, res, noopNext)
  assert.equal(sent.status, 503)
  assert.equal((sent.body as { error: { code: string } }).error.code, 'db_busy')
})

test('a generic 500 still hides internal details from the client', () => {
  const { req, res, sent } = fakeReqRes()
  const err = new Error('secret internal detail') as AppError
  errorHandler(err, req, res, noopNext)
  assert.equal(sent.status, 500)
  const body = sent.body as { error: { code: string; message: string } }
  assert.equal(body.error.message, 'Internal Server Error')
})

test('a 4xx error keeps its message and status', () => {
  const { req, res, sent } = fakeReqRes()
  const err = new Error('Ship date must be YYYY-MM-DD') as AppError
  err.status = 400
  errorHandler(err, req, res, noopNext)
  assert.equal(sent.status, 400)
  const body = sent.body as { error: { message: string } }
  assert.equal(body.error.message, 'Ship date must be YYYY-MM-DD')
})
