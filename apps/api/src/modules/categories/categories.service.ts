import { prisma } from '../../config/database';
import { AppError } from '../../shared/AppError';
import { CreateCategoryInput, UpdateCategoryInput } from './categories.validator';

export class CategoriesService {
  /**
   * List all categories with parent info and item/child counts.
   */
  async listCategories() {
    return prisma.category.findMany({
      include: {
        parent: { select: { id: true, code: true, name: true } },
        _count: { select: { items: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get single category by ID.
   */
  async getCategoryById(id: string) {
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
        _count: { select: { items: true, children: true } },
      },
    });

    if (!category) {
      throw new AppError('Không tìm thấy danh mục yêu cầu', 404);
    }

    return category;
  }

  /**
   * Create new category with uniqueness check, parent verification, and atomic AuditLog.
   * RBAC: ADMIN, LAB_MANAGER.
   */
  async createCategory(
    data: CreateCategoryInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const upperCode = data.code.trim().toUpperCase();

    // Check duplicate code
    const existingCode = await prisma.category.findUnique({
      where: { code: upperCode },
    });
    if (existingCode) {
      throw new AppError(`Mã danh mục '${upperCode}' đã tồn tại trong hệ thống`, 409);
    }

    // Verify parent category if specified
    if (data.parentId) {
      const parent = await prisma.category.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) {
        throw new AppError('Không tìm thấy danh mục cha (parentId) chỉ định', 404);
      }
    }

    // Atomic transaction for category creation and audit logging
    return prisma.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: {
          code: upperCode,
          name: data.name.trim(),
          description: data.description?.trim() || null,
          parentId: data.parentId || null,
        },
        include: {
          parent: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, children: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'CREATE',
          entity: 'Category',
          entityId: created.id,
          newValue: created as any,
          ipAddress: typeof ipAddress === 'string' ? ipAddress : undefined,
          userAgent: typeof userAgent === 'string' ? userAgent : undefined,
        },
      });

      return created;
    });
  }

  /**
   * Update category with code uniqueness, cycle detection, and atomic AuditLog.
   * RBAC: ADMIN, LAB_MANAGER.
   */
  async updateCategory(
    id: string,
    data: UpdateCategoryInput,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.category.findUnique({
        where: { id },
        include: {
          parent: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, children: true } },
        },
      });

      if (!existing) {
        throw new AppError('Không tìm thấy danh mục yêu cầu', 404);
      }

      const updateData: {
        code?: string;
        name?: string;
        description?: string | null;
        parentId?: string | null;
      } = {};

      // Check code uniqueness if changing
      if (data.code) {
        const upperCode = data.code.trim().toUpperCase();
        if (upperCode !== existing.code) {
          const codeConflict = await tx.category.findUnique({
            where: { code: upperCode },
          });
          if (codeConflict) {
            throw new AppError(`Mã danh mục '${upperCode}' đã tồn tại trong hệ thống`, 409);
          }
          updateData.code = upperCode;
        }
      }

      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }

      if (data.description !== undefined) {
        updateData.description = data.description ? data.description.trim() : null;
      }

      // Handle parentId changes & cycle detection
      if (data.parentId !== undefined) {
        if (data.parentId === id) {
          throw new AppError('Danh mục không thể làm cha của chính nó', 400);
        }

        if (data.parentId === null) {
          updateData.parentId = null;
        } else {
          const targetParent = await tx.category.findUnique({
            where: { id: data.parentId },
          });
          if (!targetParent) {
            throw new AppError('Không tìm thấy danh mục cha chỉ định', 404);
          }

          // Cycle check: verify targetParent is not a descendant of id
          let curr: any = targetParent;
          while (curr && curr.parentId) {
            if (curr.parentId === id) {
              throw new AppError(
                'Phát hiện vòng lặp phân cấp danh mục (không thể chọn danh mục con làm danh mục cha)',
                400
              );
            }
            curr = await tx.category.findUnique({
              where: { id: curr.parentId },
            });
          }

          updateData.parentId = data.parentId;
        }
      }

      const updated = await tx.category.update({
        where: { id },
        data: updateData,
        include: {
          parent: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, children: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE',
          entity: 'Category',
          entityId: id,
          oldValue: existing as any,
          newValue: updated as any,
          ipAddress: typeof ipAddress === 'string' ? ipAddress : undefined,
          userAgent: typeof userAgent === 'string' ? userAgent : undefined,
        },
      });

      return updated;
    });
  }

  /**
   * Guarded Hard Delete:
   * Only deletes if category exists, has 0 items, and has 0 child categories.
   * RBAC: ADMIN, LAB_MANAGER.
   */
  async deleteCategory(
    id: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.category.findUnique({
        where: { id },
        include: {
          _count: { select: { items: true, children: true } },
        },
      });

      if (!existing) {
        throw new AppError('Không tìm thấy danh mục yêu cầu', 404);
      }

      const itemCount = existing._count?.items ?? 0;
      if (itemCount > 0) {
        throw new AppError(
          `Không thể xóa danh mục '${existing.name}' vì đang có ${itemCount} linh kiện trực thuộc. Vui lòng chuyển các linh kiện sang danh mục khác trước khi xóa.`,
          409
        );
      }

      const childrenCount = existing._count?.children ?? 0;
      if (childrenCount > 0) {
        throw new AppError(
          `Không thể xóa danh mục '${existing.name}' vì đang có ${childrenCount} danh mục con trực thuộc. Vui lòng điều chỉnh hoặc xóa các danh mục con trước.`,
          409
        );
      }

      const deleted = await tx.category.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'DELETE',
          entity: 'Category',
          entityId: id,
          oldValue: existing as any,
          ipAddress: typeof ipAddress === 'string' ? ipAddress : undefined,
          userAgent: typeof userAgent === 'string' ? userAgent : undefined,
        },
      });

      return deleted;
    });
  }
}

export const categoriesService = new CategoriesService();
