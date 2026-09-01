import { getMergedJobs, formatJobPmLabel } from './boardService.js'
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

const STATUS_LABELS: Record<BoardJob['status'], string> = {
  none: 'not started',
  parts_on_order: 'parts on order',
  design: 'design',
  build: 'build',
  in_progress: 'in progress',
  ready_to_ship: 'ready to ship',
  shipped: 'shipped',
}

/** Whole days from today to an ISO (YYYY-MM-DD) date. Negative = overdue. */
function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${dateStr}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/** Takes date math away from the model — it just reads the annotation. */
function formatShipDate(dateStr: string): string {
  const days = daysUntil(dateStr)
  if (Number.isNaN(days)) return dateStr
  if (days < 0) return `${dateStr} (${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} OVERDUE)`
  if (days === 0) return `${dateStr} (today)`
  return `${dateStr} (in ${days} day${days === 1 ? '' : 's'})`
}

function formatJobForContext(job: BoardJob): string {
  const parts = [
    `Job ${job.jobNumber}`,
    job.description ? `"${job.description}"` : null,
    `customer: ${job.customer}`,
    `type: ${job.isSpare ? 'spare part' : 'project'}`,
    `PM: ${formatJobPmLabel(job.pm)}`,
    job.materialsManager ? `MM: ${formatJobPmLabel(job.materialsManager)}` : null,
    `status: ${STATUS_LABELS[job.status] ?? job.status}`,
    job.isNew ? 'NEW (just imported)' : null,
    job.hasNewNote ? 'has a new note from the ops schedule' : null,
    job.blocked
      ? `BLOCKED${job.blockedReason ? ` (${job.blockedReason})` : ''}${
          job.blockedAt ? ` since ${job.blockedAt.slice(0, 10)}` : ''
        }`
      : null,
    job.effectiveShipDate
      ? `ship date: ${formatShipDate(job.effectiveShipDate)}${
          job.shipDateOverridden && job.originalShipDate
            ? ` [changed from ${job.originalShipDate}${
                job.shipDateOverrideNote ? `: ${job.shipDateOverrideNote}` : ''
              }]`
            : ''
        }`
      : null,
    job.shipToPm ? `ship to PM: ${job.shipToPm}` : null,
    job.pabsComplete ? `PABS complete: ${job.pabsComplete}` : null,
    !job.isSpare ? `binder printed: ${job.binderPrinted ? 'yes' : 'no'}` : null,
  ].filter(Boolean)

  const notes = job.notes
    .slice(-5)
    .map((n) => `  - [${n.createdAt ? `${n.createdAt.slice(0, 10)} ` : ''}${n.authorName}] ${n.text}`)
    .join('\n')

  return notes ? `${parts.join(', ')}\nnotes:\n${notes}` : parts.join(', ')
}

/**
 * Computed over the FULL relevant list (before the 150-job slice) so counts
 * stay right even when the list itself is truncated — an LLM counting rows
 * in a long list is a known failure mode; arithmetic done here is not.
 */
function buildSummary(relevant: BoardJob[]): string {
  const byStatus = new Map<BoardJob['status'], number>()
  for (const j of relevant) byStatus.set(j.status, (byStatus.get(j.status) ?? 0) + 1)
  const statusLine = [...byStatus.entries()]
    .map(([status, count]) => `${STATUS_LABELS[status] ?? status} ${count}`)
    .join(', ')

  const spareCount = relevant.filter((j) => j.isSpare).length
  const blockedCount = relevant.filter((j) => j.blocked).length
  const overdueCount = relevant.filter(
    (j) => j.effectiveShipDate && daysUntil(j.effectiveShipDate) < 0,
  ).length

  return [
    'SUMMARY (computed, authoritative — use these numbers for any "how many" question; do not recount the job list below):',
    `${relevant.length} active jobs total (${relevant.length - spareCount} projects, ${spareCount} spare parts).`,
    `By status: ${statusLine || 'none'}.`,
    `Blocked: ${blockedCount}. Jobs with an overdue ship date: ${overdueCount}.`,
  ].join('\n')
}

function buildContext(jobs: BoardJob[]): string {
  // Shipped jobs are excluded to bound context size — active/blocked jobs are
  // far more relevant than archived ones for the kinds of questions this
  // feature answers. Sorted soonest-ship-first so the 150-job cap (below)
  // drops the LEAST urgent jobs first, not an arbitrary spreadsheet-order tail.
  const relevant = jobs
    .filter((j) => j.status !== 'shipped' || j.blocked)
    .sort((a, b) => {
      if (!a.effectiveShipDate) return 1
      if (!b.effectiveShipDate) return -1
      return a.effectiveShipDate.localeCompare(b.effectiveShipDate)
    })

  const summary = buildSummary(relevant)
  const shown = relevant.slice(0, 150)
  const omitted = relevant.length - shown.length

  const jobLines = shown.map(formatJobForContext).join('\n\n')
  const truncationNote =
    omitted > 0
      ? `\n\n(+${omitted} more job${omitted === 1 ? '' : 's'} omitted below for space — the SUMMARY above still covers all of them.)`
      : ''

  return `${summary}\n\n--- JOBS (soonest ship date first) ---\n${jobLines || '(none)'}${truncationNote}`
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
    'Ship date annotations like "(in 3 days)" or "(2 days OVERDUE)" are pre-computed relative to today — trust them over your own date arithmetic.',
    '"ship date" means ship-to-customer. "ship to PM" is a separate, earlier internal milestone date — do not confuse the two.',
    'Shipped (archived) jobs are excluded from this data entirely. If a job is not listed, it may have shipped, or may not exist — say so rather than guessing.',
    'Use only the job data below. If the data does not answer the question, say so plainly.',
    'Be concise.',
    '',
    '--- JOB DATA ---',
    context,
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
