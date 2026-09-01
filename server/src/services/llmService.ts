import { getMergedJobs } from './boardService.js'
import { logger } from '../utils/logger.js'
import { logNetworkRequest } from './auditService.js'
import type { BoardJob } from '@vrsi/wallboard-shared'

// ---------------------------------------------------------------------------
// Local LLM (Ollama) natural-language job query.
//
// Entirely on-network: this is the only outbound call this feature makes,
// and it goes to OLLAMA_BASE_URL (homelab box), never to a cloud endpoint.
// Every call is recorded via logNetworkRequest so it shows up in the
// Monitoring panel's activity log and security report like any other
// network call the app makes — the evidence trail leadership asked for.
// ---------------------------------------------------------------------------

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? 'http://192.168.1.63:11434').replace(/\/+$/, '')
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:14b'
const OLLAMA_TIMEOUT_MS = 60_000
const MAX_QUESTION_LENGTH = 2000

export class LlmError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function formatJobForContext(job: BoardJob): string {
  const parts = [
    `Job ${job.jobNumber}`,
    job.description ? `"${job.description}"` : null,
    `customer: ${job.customer}`,
    `PM: ${job.pm}`,
    job.materialsManager ? `MM: ${job.materialsManager}` : null,
    `status: ${job.status}`,
    job.blocked ? `BLOCKED${job.blockedReason ? ` (${job.blockedReason})` : ''}` : null,
    job.effectiveShipDate ? `ship date: ${job.effectiveShipDate}` : null,
  ].filter(Boolean)

  const notes = job.notes
    .slice(-5)
    .map((n) => `  - [${n.authorName}] ${n.text}`)
    .join('\n')

  return notes ? `${parts.join(', ')}\nnotes:\n${notes}` : parts.join(', ')
}

function buildContext(jobs: BoardJob[]): string {
  // Cap context size so we don't overrun the model's context window as the
  // board grows — active/blocked jobs are far more relevant than archived
  // ones for the kinds of questions this feature answers.
  const relevant = jobs
    .filter((j) => j.status !== 'shipped' || j.blocked)
    .slice(0, 150)

  return relevant.map(formatJobForContext).join('\n\n')
}

interface OllamaGenerateResponse {
  response?: string
  error?: string
}

function isOllamaGenerateResponse(v: unknown): v is OllamaGenerateResponse {
  return v !== null && typeof v === 'object'
}

export async function queryJobs(question: string): Promise<string> {
  const trimmed = question.trim()
  if (!trimmed) throw new LlmError('empty_question', 'Question cannot be empty')
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    throw new LlmError('question_too_long', `Question must be under ${MAX_QUESTION_LENGTH} characters`)
  }

  const jobs = getMergedJobs()
  const context = buildContext(jobs)

  // Ship dates are absolute (YYYY-MM-DD); without today's real date the model
  // has no ground truth for "this week" / "overdue" / "next month" and falls
  // back on whatever date it internalized from training, which is wrong.
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const prompt = [
    'You are a helpful assistant answering questions about active manufacturing jobs on an internal operations wallboard.',
    `Today's date is ${today}. Use this, not any other assumption, for "this week" / "overdue" / "next month" style questions.`,
    'Use only the job data below. If the data does not answer the question, say so plainly.',
    'Be concise.',
    '',
    '--- JOB DATA ---',
    context || '(no active jobs)',
    '--- END JOB DATA ---',
    '',
    `Question: ${trimmed}`,
  ].join('\n')

  const url = `${OLLAMA_BASE_URL}/api/generate`
  const started = Date.now()

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    })
  } catch (err) {
    logNetworkRequest('POST', url, false, undefined, 'ollama unreachable')
    logger.warn('Ollama request failed', { err, url })
    throw new LlmError('llm_unreachable', 'Could not reach the local LLM server')
  }

  if (!response.ok) {
    logNetworkRequest('POST', url, false, response.status)
    throw new LlmError('llm_error', `Local LLM server returned ${response.status}`)
  }

  const raw: unknown = await response.json()
  logNetworkRequest('POST', url, true, response.status, `${Date.now() - started}ms, model=${OLLAMA_MODEL}`)

  if (!isOllamaGenerateResponse(raw) || typeof raw.response !== 'string') {
    throw new LlmError('llm_bad_response', 'Local LLM server returned an unexpected response')
  }

  return raw.response.trim()
}
