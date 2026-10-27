import { Request, Response, NextFunction } from 'express';
import { vQuery } from '../middleware/validate.js';
import { resolveOrganizationId } from '../utils/orgAccess.js';
import * as aiService from '../services/aiGeneration.service.js';
import type { AiGenerateRequest } from '../services/aiGeneration.service.js';

async function orgContext(req: Request) {
  const isSuperAdmin = req.user!.roles.includes('super_admin');
  const orgId = await resolveOrganizationId(req.user!.organizationId, isSuperAdmin, req);
  return { orgId, userId: req.user!.id };
}

export async function generateQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = await orgContext(req);
    const job = await aiService.startQuestionGeneration(orgId, userId, req.body as AiGenerateRequest);
    res.status(202).json({ success: true, data: job });
  } catch (e) {
    next(e);
  }
}

export async function getJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const job = await aiService.getGenerationJob(String(req.params.id), orgId);
    res.json({ success: true, data: job });
  } catch (e) {
    next(e);
  }
}

export async function listJobs(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const jobs = await aiService.listGenerationJobs(orgId);
    res.json({ success: true, data: jobs });
  } catch (e) {
    next(e);
  }
}

export async function retryJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = await orgContext(req);
    const job = await aiService.retryGenerationJob(String(req.params.id), orgId, userId);
    res.status(202).json({ success: true, data: job });
  } catch (e) {
    next(e);
  }
}

export async function usage(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const data = await aiService.getAiUsage(orgId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function blueprint(req: Request, res: Response, next: NextFunction) {
  try {
    await orgContext(req);
    const data = await aiService.buildBlueprint(req.body as AiGenerateRequest);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function syllabus(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const data = await aiService.mapSyllabus(orgId, req.body as AiGenerateRequest);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function recommendations(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const query = vQuery(req) as { topicId?: string; difficulty?: number; marks?: number };
    const data = await aiService.recommendQuestions(
      orgId,
      query.topicId,
      query.difficulty ?? 3,
      query.marks ?? 20,
    );
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function duplicates(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const data = await aiService.findDuplicateQuestions(orgId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function improve(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const data = await aiService.improveQuestion(orgId, String(req.params.id));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function distractors(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const data = await aiService.generateDistractors(
      orgId,
      String(req.params.id),
      Boolean(req.body?.save),
      req.body?.options,
    );
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function practice(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = await orgContext(req);
    const data = await aiService.practiceInsights(orgId, userId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function report(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const data = await aiService.reportInsights(orgId, String(req.params.testId));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}
