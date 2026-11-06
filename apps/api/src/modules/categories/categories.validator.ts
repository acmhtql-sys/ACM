import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Tên danh mục phải có ít nhất 2 ký tự').max(100, 'Tên danh mục tối đa 100 ký tự'),
  code: z
    .string()
    .trim()
    .min(2, 'Mã danh mục phải có ít nhất 2 ký tự')
    .max(30, 'Mã danh mục tối đa 30 ký tự')
    .regex(/^[A-Z0-9_-]+$/, 'Mã danh mục chỉ được chứa chữ in hoa, chữ số, dấu gạch nối và gạch dưới (VD: CAT-DEV-BOARD)'),
  description: z.string().trim().max(500, 'Mô tả tối đa 500 ký tự').optional().nullable(),
  parentId: z.string().uuid('Mã danh mục cha (parentId) phải là UUID hợp lệ').optional().nullable(),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2, 'Tên danh mục phải có ít nhất 2 ký tự').max(100, 'Tên danh mục tối đa 100 ký tự').optional(),
  code: z
    .string()
    .trim()
    .min(2, 'Mã danh mục phải có ít nhất 2 ký tự')
    .max(30, 'Mã danh mục tối đa 30 ký tự')
    .regex(/^[A-Z0-9_-]+$/, 'Mã danh mục chỉ được chứa chữ in hoa, chữ số, dấu gạch nối và gạch dưới (VD: CAT-DEV-BOARD)')
    .optional(),
  description: z.string().trim().max(500, 'Mô tả tối đa 500 ký tự').optional().nullable(),
  parentId: z.string().uuid('Mã danh mục cha (parentId) phải là UUID hợp lệ').optional().nullable(),
});

export const categoryIdParamSchema = z.object({
  id: z.string().uuid('ID danh mục phải là UUID hợp lệ'),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
