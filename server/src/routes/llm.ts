import { Router, Request, Response } from 'express'
import { requireAdminToken } from '../middleware/adminAuth.js'
import { queryJobs, LlmError } from '../services/llmService.js'
import { logger } from '../utils/logger.js'

export const llmRouter = Router()

llmRouter.use(requireAdminToken)

llmRouter.post('/query', async (req: Request, res: Response) => {
  const question = typeof req.body?.question === 'string' ? req.body.question : ''

  try {
    const answer = await queryJobs(question)
    return res.json({ data: { answer } })
  } catch (err) {
    if (err instanceof LlmError) {
      const status = err.code === 'empty_question' || err.code === 'question_too_long' ? 400 : 502
      return res.status(status).json({ error: { code: err.code, message: err.message } })
    }
    logger.error('Unexpected error in LLM query route', { err })
    return res.status(500).json({ error: { code: 'internal_error', message: 'Failed to process query' } })
  }
})
