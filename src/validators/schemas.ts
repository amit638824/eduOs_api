import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must include at least one number.')
  .regex(/[^A-Za-z0-9]/, 'Password must include at least one special character.');

export const registerSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.toLowerCase()),
  password: passwordSchema,
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  phone: z.string().max(20).optional(),
  organizationId: z.string().uuid().optional(),
  role: z.enum(['student', 'teacher', 'org_admin']).default('student'),
});

export const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(255).trim(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  logoUrl: z.string().url().optional(),
  theme: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
  /** Org admin login email — required so credentials can be mailed */
  contactEmail: z.string().email(),
  adminFirstName: z.string().min(1).max(100).trim().optional(),
  adminLastName: z.string().min(1).max(100).trim().optional(),
  /** Optional; auto-generated if omitted */
  adminPassword: passwordSchema.optional(),
  /** When true, org is immediately active; default pending for approval */
  isActive: z.boolean().optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(255).trim().optional(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens')
    .optional(),
  logoUrl: z.string().url().optional(),
  theme: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
  contactEmail: z.string().email().optional(),
  isActive: z.boolean().optional(),
});

export const createBranchSchema = z.object({
  name: z.string().min(2).max(255).trim(),
  code: z.string().min(1).max(50).trim().optional(),
  address: z.string().max(1000).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

const questionTypeEnum = z.enum([
  'mcq', 'msq', 'true_false', 'fill_blank', 'integer', 'numerical',
  'assertion_reason', 'match_following', 'matrix_match', 'paragraph',
  'case_study', 'subjective',
]);

export const createSubjectSchema = z.object({
  name: z.string().min(2).max(255).trim(),
  code: z.string().max(50).trim().optional(),
  language: z.string().max(10).optional(),
  departmentId: z.string().uuid(),
});

export const createChapterSchema = z.object({
  name: z.string().min(2).max(255).trim(),
  sortOrder: z.number().int().optional(),
});

export const createTopicSchema = z.object({
  name: z.string().min(2).max(255).trim(),
  difficulty: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
});

export const createTopicForSubjectSchema = z.object({
  name: z.string().min(2).max(255).trim(),
  difficulty: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  chapterName: z.string().min(2).max(255).trim().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(2).max(255).trim(),
  parentId: z.string().uuid().optional(),
});

export const questionOptionSchema = z.object({
  content: z.record(z.unknown()),
  isCorrect: z.boolean(),
  sortOrder: z.number().int().optional(),
});

export const createQuestionSchema = z.object({
  type: questionTypeEnum,
  content: z.record(z.unknown()),
  explanation: z.string().max(5000).optional(),
  marks: z.number().positive().optional(),
  negativeMarks: z.number().min(0).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  language: z.string().max(10).optional(),
  categoryId: z.string().uuid().optional(),
  topicId: z.string().uuid(),
  options: z.array(questionOptionSchema).optional(),
});

export const updateQuestionSchema = createQuestionSchema;

export const listSubjectsQuerySchema = paginationSchema.extend({
  departmentId: z.string().uuid().optional(),
});

export const createTestSchema = z.object({
  title: z.string().min(3).max(500).trim(),
  description: z.string().max(5000).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  passingMarks: z.number().min(0).optional(),
  instructions: z.string().max(10000).optional(),
  config: z.record(z.unknown()).optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
});

export const addTestSectionSchema = z.object({
  name: z.string().min(2).max(255).trim(),
  sortOrder: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
});

export const addTestQuestionSchema = z.object({
  questionId: z.string().uuid(),
  sectionId: z.string().uuid().optional(),
  sortOrder: z.number().int().optional(),
  marksOverride: z.number().positive().optional(),
});

export const assignTestSchema = z.object({
  studentId: z.string().uuid(),
  scheduledAt: z.string().datetime().optional(),
});

export const saveAnswerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.record(z.unknown()),
});

export const submitAttemptSchema = z.object({
  autoSubmit: z.boolean().optional(),
});

export const proctoringEventSchema = z.object({
  event: z.string().min(1).max(64),
  detail: z.record(z.unknown()).optional(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  phone: z.string().max(20).optional(),
  avatarUrl: z.string().url().optional(),
});

export const listQuestionsQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  type: questionTypeEnum.optional(),
});

export const listTestsQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
});

export const listAttemptsQuerySchema = paginationSchema.extend({
  testId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address.')
    .transform((v) => v.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Your reset link is missing or invalid.'),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Please enter your current password.'),
  newPassword: passwordSchema,
});

export const otpRequestSchema = z.object({
  purpose: z.string().min(1).max(50),
});

export const otpVerifySchema = z.object({
  purpose: z.string().min(1).max(50),
  code: z.string().min(4).max(10),
});

export const mfaVerifyLoginSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(4).max(10),
});

export const createDepartmentSchema = z.object({
  name: z.string().min(2).max(255).trim(),
  code: z.string().max(50).trim().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createAcademicSessionSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isCurrent: z.boolean().optional(),
});

export const updateAcademicSessionSchema = createAcademicSessionSchema.partial();

export const createAdminUserSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.toLowerCase()),
  password: passwordSchema,
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().min(1).max(100).trim(),
  phone: z.string().max(20).optional(),
  role: z.enum(['student', 'teacher', 'org_admin']),
  branchId: z.string().uuid().optional(),
});

export const assignRoleSchema = z.object({
  role: z.enum(['student', 'teacher', 'org_admin']),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'suspended']),
});

export const updateAdminUserSchema = z.object({
  firstName: z.string().min(1).max(100).trim().optional(),
  lastName: z.string().min(1).max(100).trim().optional(),
  phone: z.string().max(20).optional(),
  branchId: z.string().uuid().nullable().optional(),
  role: z.enum(['student', 'teacher', 'org_admin']).optional(),
});

export const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  channel: z.enum(['email', 'sms', 'push', 'in_app']),
  title: z.string().min(1).max(255),
  body: z.string().min(1).max(5000),
  data: z.record(z.unknown()).optional(),
});

export const createPaymentSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updatePaymentStatusSchema = z.object({
  status: z.enum(['pending', 'completed', 'failed', 'refunded']),
  gatewayRef: z.string().max(255).optional(),
});

export const createRazorpayOrderSchema = z.object({
  amount: z.number().positive().max(1000000),
});

export const verifyRazorpayPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const upsertSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
});

export const updateTestSchema = createTestSchema.partial().extend({
  // 'live' is intentionally excluded — use the dedicated publish endpoint
  status: z.enum(['draft', 'scheduled', 'completed', 'archived']).optional(),
});

export const listUsersQuerySchema = paginationSchema.extend({
  role: z.string().optional(),
  search: z.string().optional(),
});
