import { Request, Response, NextFunction } from 'express';
import { vQuery, vParams } from '../middleware/validate.js';
import { resolveOrganizationId } from '../utils/orgAccess.js';
import * as subjectService from '../services/subject.service.js';
import * as questionService from '../services/question.service.js';
import * as testService from '../services/test.service.js';
import * as attemptService from '../services/attempt.service.js';
import * as analyticsService from '../services/analytics.service.js';

async function orgContext(req: Request) {
  const isSuperAdmin = req.user!.roles.includes('super_admin');
  const orgId = await resolveOrganizationId(req.user!.organizationId, isSuperAdmin);
  return { orgId, userId: req.user!.id, isSuperAdmin };
}

export async function listSubjects(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { page, limit } = vQuery(req) as unknown as { page: number; limit: number };
    const result = await subjectService.listSubjects(orgId, page, limit);
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function createSubject(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const subject = await subjectService.createSubject(orgId, req.body);
    res.status(201).json({ success: true, data: subject });
  } catch (e) {
    next(e);
  }
}

export async function listChapters(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { subjectId } = vParams(req) as { subjectId: string };
    const chapters = await subjectService.listChapters(subjectId, orgId);
    res.json({ success: true, data: chapters });
  } catch (e) {
    next(e);
  }
}

export async function createChapter(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { subjectId } = vParams(req) as { subjectId: string };
    const chapter = await subjectService.createChapter(subjectId, orgId, req.body);
    res.status(201).json({ success: true, data: chapter });
  } catch (e) {
    next(e);
  }
}

export async function listTopics(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { chapterId } = vParams(req) as { chapterId: string };
    const topics = await subjectService.listTopics(chapterId, orgId);
    res.json({ success: true, data: topics });
  } catch (e) {
    next(e);
  }
}

export async function createTopic(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { chapterId } = vParams(req) as { chapterId: string };
    const topic = await subjectService.createTopic(chapterId, orgId, req.body);
    res.status(201).json({ success: true, data: topic });
  } catch (e) {
    next(e);
  }
}

export async function listQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { page, limit, status, type } = vQuery(req) as unknown as {
      page: number;
      limit: number;
      status?: string;
      type?: string;
    };
    const result = await questionService.listQuestions(orgId, page, limit, { status, type });
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function getQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { id } = vParams(req) as { id: string };
    const question = await questionService.getQuestionById(id, orgId);
    res.json({ success: true, data: question });
  } catch (e) {
    next(e);
  }
}

export async function createQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = await orgContext(req);
    const question = await questionService.createQuestion(orgId, userId, req.body);
    res.status(201).json({ success: true, data: question });
  } catch (e) {
    next(e);
  }
}

export async function approveQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = await orgContext(req);
    const { id } = vParams(req) as { id: string };
    const question = await questionService.approveQuestion(id, orgId, userId);
    res.json({ success: true, data: question });
  } catch (e) {
    next(e);
  }
}

export async function listCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const categories = await questionService.listCategories(orgId);
    res.json({ success: true, data: categories });
  } catch (e) {
    next(e);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const category = await questionService.createCategory(orgId, req.body);
    res.status(201).json({ success: true, data: category });
  } catch (e) {
    next(e);
  }
}

export async function listTests(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { page, limit, status } = vQuery(req) as unknown as { page: number; limit: number; status?: string };
    const result = await testService.listTests(orgId, page, limit, status);
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function getTest(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { id } = vParams(req) as { id: string };
    const test = await testService.getTestById(id, orgId);
    res.json({ success: true, data: test });
  } catch (e) {
    next(e);
  }
}

export async function createTest(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId, userId } = await orgContext(req);
    const test = await testService.createTest(orgId, userId, req.body);
    res.status(201).json({ success: true, data: test });
  } catch (e) {
    next(e);
  }
}

export async function updateTest(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { id } = vParams(req) as { id: string };
    const test = await testService.updateTest(id, orgId, req.body);
    res.json({ success: true, data: test });
  } catch (e) {
    next(e);
  }
}

export async function addTestSection(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { id } = vParams(req) as { id: string };
    const section = await testService.addTestSection(id, orgId, req.body);
    res.status(201).json({ success: true, data: section });
  } catch (e) {
    next(e);
  }
}

export async function addQuestionToTest(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { id } = vParams(req) as { id: string };
    const row = await testService.addQuestionToTest(id, orgId, req.body);
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
}

export async function publishTest(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { id } = vParams(req) as { id: string };
    const test = await testService.publishTest(id, orgId);
    res.json({ success: true, data: test });
  } catch (e) {
    next(e);
  }
}

export async function assignTest(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { id } = vParams(req) as { id: string };
    const { studentId, scheduledAt } = req.body as { studentId: string; scheduledAt?: string };
    const assignment = await testService.assignTestToStudent(id, orgId, studentId, scheduledAt);
    res.status(201).json({ success: true, data: assignment });
  } catch (e) {
    next(e);
  }
}

export async function listMyTests(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const studentId = await attemptService.getStudentIdByUserId(req.user!.id);
    const tests = await testService.listStudentAssignedTests(studentId, orgId);
    res.json({ success: true, data: tests });
  } catch (e) {
    next(e);
  }
}

export async function startAttempt(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { testId } = vParams(req) as { testId: string };
    const studentId = await attemptService.getStudentIdByUserId(req.user!.id);
    const attempt = await attemptService.startAttempt(testId, studentId, orgId);
    res.status(201).json({ success: true, data: attempt });
  } catch (e) {
    next(e);
  }
}

export async function getAttempt(req: Request, res: Response, next: NextFunction) {
  try {
    const studentId = await attemptService.getStudentIdByUserId(req.user!.id);
    const { id } = vParams(req) as { id: string };
    const attempt = await attemptService.getAttemptForStudent(id, studentId);
    res.json({ success: true, data: attempt });
  } catch (e) {
    next(e);
  }
}

export async function saveAnswer(req: Request, res: Response, next: NextFunction) {
  try {
    const studentId = await attemptService.getStudentIdByUserId(req.user!.id);
    const { id } = vParams(req) as { id: string };
    const { questionId, answer } = req.body as { questionId: string; answer: Record<string, unknown> };
    const saved = await attemptService.saveAnswer(id, studentId, questionId, answer);
    res.json({ success: true, data: saved });
  } catch (e) {
    next(e);
  }
}

export async function submitAttempt(req: Request, res: Response, next: NextFunction) {
  try {
    const studentId = await attemptService.getStudentIdByUserId(req.user!.id);
    const { id } = vParams(req) as { id: string };
    const result = await attemptService.submitAttempt(id, studentId);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function getResult(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { attemptId } = vParams(req) as { attemptId: string };
    const result = await attemptService.getResultByAttemptId(attemptId, orgId);
    res.json({ success: true, data: result });
  } catch (e) {
    next(e);
  }
}

export async function listAttempts(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { page, limit, testId, studentId } = vQuery(req) as unknown as {
      page: number;
      limit: number;
      testId?: string;
      studentId?: string;
    };
    const result = await attemptService.listAttempts(orgId, page, limit, { testId, studentId });
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
}

export async function listMyResults(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const studentId = await attemptService.getStudentIdByUserId(req.user!.id);
    const results = await attemptService.listStudentResults(studentId, orgId);
    res.json({ success: true, data: results });
  } catch (e) {
    next(e);
  }
}

export async function getAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const stats = await analyticsService.getOrganizationStats(orgId);
    res.json({ success: true, data: stats });
  } catch (e) {
    next(e);
  }
}

export async function getTestAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const { orgId } = await orgContext(req);
    const { testId } = vParams(req) as { testId: string };
    const data = await analyticsService.getTestAnalytics(testId, orgId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}
