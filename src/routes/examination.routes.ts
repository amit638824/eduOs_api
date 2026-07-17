import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { authenticate, requirePermission, forbidSuperAdmin } from '../middleware/auth.js';
import {
  paginationSchema,
  uuidParamSchema,
  createSubjectSchema,
  createChapterSchema,
  createTopicSchema,
  createTopicForSubjectSchema,
  createCategorySchema,
  createQuestionSchema,
  updateQuestionSchema,
  createTestSchema,
  updateTestSchema,
  addTestSectionSchema,
  addTestQuestionSchema,
  assignTestSchema,
  saveAnswerSchema,
  submitAttemptSchema,
  proctoringEventSchema,
  listQuestionsQuerySchema,
  listSubjectsQuerySchema,
  listTestsQuerySchema,
  listAttemptsQuerySchema,
} from '../validators/schemas.js';
import * as examController from '../controllers/examination.controller.js';

const subjectIdParam = z.object({ subjectId: z.string().uuid() });
const chapterIdParam = z.object({ chapterId: z.string().uuid() });
const testIdParam = z.object({ testId: z.string().uuid() });
const attemptIdParam = z.object({ attemptId: z.string().uuid() });

const router = Router();
router.use(authenticate);

// Subjects
router.get('/subjects', validate(listSubjectsQuerySchema, 'query'), requirePermission('question', 'read'), examController.listSubjects);
router.post('/subjects', validate(createSubjectSchema), requirePermission('question', 'create'), examController.createSubject);
router.get('/subjects/:subjectId/chapters', validate(subjectIdParam, 'params'), requirePermission('question', 'read'), examController.listChapters);
router.post('/subjects/:subjectId/chapters', validate(subjectIdParam, 'params'), validate(createChapterSchema), requirePermission('question', 'create'), examController.createChapter);
router.get('/subjects/:subjectId/topics', validate(subjectIdParam, 'params'), requirePermission('question', 'read'), examController.listTopicsForSubject);
router.post('/subjects/:subjectId/topics', validate(subjectIdParam, 'params'), validate(createTopicForSubjectSchema), requirePermission('question', 'create'), examController.createTopicForSubject);
router.get('/chapters/:chapterId/topics', validate(chapterIdParam, 'params'), requirePermission('question', 'read'), examController.listTopics);
router.post('/chapters/:chapterId/topics', validate(chapterIdParam, 'params'), validate(createTopicSchema), requirePermission('question', 'create'), examController.createTopic);

// Question bank
router.get('/question-categories', requirePermission('question', 'read'), examController.listCategories);
router.post('/question-categories', validate(createCategorySchema), requirePermission('question', 'create'), examController.createCategory);
router.get('/questions', validate(listQuestionsQuerySchema, 'query'), requirePermission('question', 'read'), examController.listQuestions);
router.get('/questions/:id', validate(uuidParamSchema, 'params'), requirePermission('question', 'read'), examController.getQuestion);
router.post('/questions', validate(createQuestionSchema), requirePermission('question', 'create'), examController.createQuestion);
router.patch('/questions/:id', validate(uuidParamSchema, 'params'), validate(updateQuestionSchema), requirePermission('question', 'update'), examController.updateQuestion);
router.delete('/questions/:id', validate(uuidParamSchema, 'params'), requirePermission('question', 'delete'), examController.deleteQuestion);
router.post('/questions/:id/approve', validate(uuidParamSchema, 'params'), requirePermission('question', 'approve'), examController.approveQuestion);

// Tests
router.get('/tests', validate(listTestsQuerySchema, 'query'), requirePermission('test', 'read'), examController.listTests);
router.get('/students', validate(paginationSchema, 'query'), requirePermission('test', 'assign'), examController.listAssignableStudents);
router.get('/tests/my', requirePermission('test', 'read'), examController.listMyTests);
router.get('/tests/:id', validate(uuidParamSchema, 'params'), requirePermission('test', 'read'), examController.getTest);
router.post('/tests', validate(createTestSchema), requirePermission('test', 'create'), examController.createTest);
router.patch('/tests/:id', validate(uuidParamSchema, 'params'), validate(updateTestSchema), requirePermission('test', 'update'), examController.updateTest);
router.delete('/tests/:id', validate(uuidParamSchema, 'params'), requirePermission('test', 'delete'), examController.deleteTest);
router.post('/tests/:id/sections', validate(uuidParamSchema, 'params'), validate(addTestSectionSchema), requirePermission('test', 'update'), examController.addTestSection);
router.post('/tests/:id/questions', validate(uuidParamSchema, 'params'), validate(addTestQuestionSchema), requirePermission('test', 'update'), examController.addQuestionToTest);
router.delete(
  '/tests/:id/questions/:questionId',
  validate(z.object({ id: z.string().uuid(), questionId: z.string().uuid() }), 'params'),
  requirePermission('test', 'update'),
  examController.removeQuestionFromTest,
);
router.post('/tests/:id/publish', validate(uuidParamSchema, 'params'), requirePermission('test', 'publish'), examController.publishTest);
router.post('/tests/:id/assign', validate(uuidParamSchema, 'params'), validate(assignTestSchema), requirePermission('test', 'assign'), examController.assignTest);
router.delete(
  '/tests/:id/assign/:studentId',
  validate(z.object({ id: z.string().uuid(), studentId: z.string().uuid() }), 'params'),
  requirePermission('test', 'assign'),
  examController.unassignStudentFromTest,
);

// Attempts
router.post(
  '/tests/:testId/start',
  validate(testIdParam, 'params'),
  forbidSuperAdmin('Super Admin cannot start exam attempts'),
  requirePermission('attempt', 'manage'),
  examController.startAttempt,
);
router.get('/attempts', validate(listAttemptsQuerySchema, 'query'), requirePermission('attempt', 'read'), examController.listAttempts);
router.get(
  '/attempts/:id',
  validate(uuidParamSchema, 'params'),
  forbidSuperAdmin('Super Admin cannot open live attempts'),
  requirePermission('attempt', 'manage'),
  examController.getAttempt,
);
router.post(
  '/attempts/:id/answers',
  validate(uuidParamSchema, 'params'),
  validate(saveAnswerSchema),
  forbidSuperAdmin('Super Admin cannot modify attempts'),
  requirePermission('attempt', 'manage'),
  examController.saveAnswer,
);
router.post(
  '/attempts/:id/proctoring',
  validate(uuidParamSchema, 'params'),
  validate(proctoringEventSchema),
  forbidSuperAdmin('Super Admin cannot modify attempts'),
  requirePermission('attempt', 'manage'),
  examController.logProctoring,
);
router.post(
  '/attempts/:id/submit',
  validate(uuidParamSchema, 'params'),
  validate(submitAttemptSchema),
  forbidSuperAdmin('Super Admin cannot submit attempts'),
  requirePermission('attempt', 'manage'),
  examController.submitAttempt,
);

// Results
router.get('/stats/my', requirePermission('result', 'read'), examController.getMyStats);
router.get('/results/my', requirePermission('result', 'read'), examController.listMyResults);
router.get('/results/:attemptId', validate(attemptIdParam, 'params'), requirePermission('result', 'read'), examController.getResult);

// Analytics
router.get('/analytics/overview', requirePermission('analytics', 'read'), examController.getAnalytics);
router.get('/analytics/tests/:testId', validate(testIdParam, 'params'), requirePermission('analytics', 'read'), examController.getTestAnalytics);

export default router;
