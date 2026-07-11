import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain a special character');

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
});

export const updateOrganizationSchema = createOrganizationSchema.partial();

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
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});
