import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '@prisma/client';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { categoriesService } from '../src/modules/categories/categories.service';
import { categoriesRouter } from '../src/modules/categories/categories.router';
import { errorHandler } from '../src/middleware/errorHandler';
import { prisma } from '../src/config/database';
import { AppError } from '../src/shared/AppError';

// Mock prisma client methods
vi.mock('../src/config/database', () => {
  const mockTx = {
    category: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    prisma: {
      category: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => cb(mockTx)),
      _mockTx: mockTx,
    },
  };
});

vi.mock('../src/middleware/auth', async () => {
  const { AppError } = await vi.importActual<any>('../src/shared/AppError');
  return {
    authenticate: (req: any, _res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new AppError('Yêu cầu xác thực (Bearer Token không hợp lệ)', 401));
      }
      next();
    },
    authenticateCatalogInStaging: (_req: any, _res: any, next: any) => next(),
  };
});

describe('CategoriesService Unit Test Suite (P0 Categories CRUD)', () => {
  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockCategoryId = '22222222-2222-2222-2222-222222222222';
  const mockParentId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    const mockTx = (prisma as any)._mockTx;
    vi.clearAllMocks();
    mockTx.category.findUnique.mockReset();
    mockTx.category.findMany.mockReset();
    mockTx.category.create.mockReset();
    mockTx.category.update.mockReset();
    mockTx.category.delete.mockReset();
    mockTx.auditLog.create.mockReset();
    vi.mocked(prisma.category.findMany).mockReset();
    vi.mocked(prisma.category.findUnique).mockReset();
    vi.mocked(prisma.category.create).mockReset();
    vi.mocked(prisma.category.update).mockReset();
    vi.mocked(prisma.category.delete).mockReset();
    vi.mocked(prisma.auditLog.create).mockReset();
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => cb(mockTx));
  });

  describe('1. listCategories & getCategoryById', () => {
    it('TC-CAT-01: listCategories queries categories with counts and parents', async () => {
      const mockList = [
        { id: '1', code: 'CAT-1', name: 'Cat 1', _count: { items: 2, children: 0 } },
        { id: '2', code: 'CAT-2', name: 'Cat 2', _count: { items: 0, children: 1 } },
      ];
      vi.mocked(prisma.category.findMany).mockResolvedValueOnce(mockList as any);

      const res = await categoriesService.listCategories();
      expect(res).toEqual(mockList);
      expect(prisma.category.findMany).toHaveBeenCalledWith({
        include: {
          parent: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, children: true } },
        },
        orderBy: { name: 'asc' },
      });
    });

    it('TC-CAT-02: getCategoryById returns detail when found', async () => {
      const mockCat = { id: mockCategoryId, code: 'MCU', name: 'Microcontrollers' };
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce(mockCat as any);

      const res = await categoriesService.getCategoryById(mockCategoryId);
      expect(res).toEqual(mockCat);
    });

    it('TC-CAT-03: getCategoryById throws 404 when category not found', async () => {
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce(null);

      await expect(categoriesService.getCategoryById('non-existent')).rejects.toThrow(AppError);
      await expect(categoriesService.getCategoryById('non-existent')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Không tìm thấy danh mục yêu cầu',
      });
    });
  });

  describe('2. createCategory', () => {
    it('TC-CAT-04: creates category with uppercase code and creates AuditLog atomically', async () => {
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce(null); // No code duplicate

      const mockTx = (prisma as any)._mockTx;
      const createdRecord = {
        id: mockCategoryId,
        code: 'CAT-ARM',
        name: 'ARM Boards',
        description: 'ARM test boards',
        parentId: null,
      };
      mockTx.category.create.mockResolvedValueOnce(createdRecord);
      mockTx.auditLog.create.mockResolvedValueOnce({ id: 'audit-1' });

      const res = await categoriesService.createCategory(
        { code: 'cat-arm', name: 'ARM Boards', description: 'ARM test boards' },
        mockUserId,
        '127.0.0.1',
        'Vitest'
      );

      expect(res).toEqual(createdRecord);
      expect(mockTx.category.create).toHaveBeenCalledWith({
        data: {
          code: 'CAT-ARM',
          name: 'ARM Boards',
          description: 'ARM test boards',
          parentId: null,
        },
        include: {
          parent: { select: { id: true, code: true, name: true } },
          _count: { select: { items: true, children: true } },
        },
      });
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          action: 'CREATE',
          entity: 'Category',
          entityId: mockCategoryId,
          newValue: createdRecord,
          ipAddress: '127.0.0.1',
          userAgent: 'Vitest',
        },
      });
    });

    it('TC-CAT-05: rejects duplicate code with 409 Conflict', async () => {
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce({ id: 'existing', code: 'CAT-ARM' } as any);

      await expect(
        categoriesService.createCategory({ code: 'CAT-ARM', name: 'Duplicate' }, mockUserId)
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "Mã danh mục 'CAT-ARM' đã tồn tại trong hệ thống",
      });
    });

    it('TC-CAT-06: rejects non-existent parentId with 404 Not Found', async () => {
      vi.mocked(prisma.category.findUnique)
        .mockResolvedValueOnce(null) // code check ok
        .mockResolvedValueOnce(null); // parent check not found

      await expect(
        categoriesService.createCategory(
          { code: 'CAT-NEW', name: 'New Cat', parentId: mockParentId },
          mockUserId
        )
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Không tìm thấy danh mục cha (parentId) chỉ định',
      });
    });
  });

  describe('3. updateCategory', () => {
    it('TC-CAT-07: updates category fields and records AuditLog', async () => {
      const mockTx = (prisma as any)._mockTx;
      const existing = {
        id: mockCategoryId,
        code: 'CAT-OLD',
        name: 'Old Name',
        description: 'Old desc',
        parentId: null,
      };
      const updated = {
        id: mockCategoryId,
        code: 'CAT-NEW',
        name: 'New Name',
        description: 'New desc',
        parentId: null,
      };

      mockTx.category.findUnique
        .mockResolvedValueOnce(existing) // find existing
        .mockResolvedValueOnce(null); // code check unique
      mockTx.category.update.mockResolvedValueOnce(updated);
      mockTx.auditLog.create.mockResolvedValueOnce({ id: 'audit-2' });

      const res = await categoriesService.updateCategory(
        mockCategoryId,
        { code: 'CAT-NEW', name: 'New Name', description: 'New desc' },
        mockUserId,
        '127.0.0.1',
        'Vitest'
      );

      expect(res).toEqual(updated);
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          action: 'UPDATE',
          entity: 'Category',
          entityId: mockCategoryId,
          oldValue: existing,
          newValue: updated,
          ipAddress: '127.0.0.1',
          userAgent: 'Vitest',
        },
      });
    });

    it('TC-CAT-08: prevents self-parenting (parentId === id) with 400 Bad Request', async () => {
      const mockTx = (prisma as any)._mockTx;
      mockTx.category.findUnique.mockResolvedValueOnce({ id: mockCategoryId, code: 'CAT-1' });

      await expect(
        categoriesService.updateCategory(mockCategoryId, { parentId: mockCategoryId }, mockUserId)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Danh mục không thể làm cha của chính nó',
      });
    });

    it('TC-CAT-09: detects and blocks hierarchy cycle (A -> B -> A) with 400 Bad Request', async () => {
      const mockTx = (prisma as any)._mockTx;
      const existingA = { id: 'cat-A', code: 'CAT-A', parentId: null };
      const childB = { id: 'cat-B', code: 'CAT-B', parentId: 'cat-A' };

      mockTx.category.findUnique
        .mockResolvedValueOnce(existingA) // find existing A
        .mockResolvedValueOnce(childB) // targetParent is B
        .mockResolvedValueOnce(existingA); // B's parent is A -> cycle detected!

      await expect(
        categoriesService.updateCategory('cat-A', { parentId: 'cat-B' }, mockUserId)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: 'Phát hiện vòng lặp phân cấp danh mục (không thể chọn danh mục con làm danh mục cha)',
      });
    });

    it('TC-CAT-10: rejects update to duplicate code with 409 Conflict', async () => {
      const mockTx = (prisma as any)._mockTx;
      mockTx.category.findUnique
        .mockResolvedValueOnce({ id: mockCategoryId, code: 'CAT-A' }) // existing
        .mockResolvedValueOnce({ id: 'other-id', code: 'CAT-B' }); // conflict

      await expect(
        categoriesService.updateCategory(mockCategoryId, { code: 'CAT-B' }, mockUserId)
      ).rejects.toMatchObject({
        statusCode: 409,
        message: "Mã danh mục 'CAT-B' đã tồn tại trong hệ thống",
      });
    });
  });

  describe('4. Guarded Hard Delete (deleteCategory)', () => {
    it('TC-CAT-11: deletes category successfully when items=0 and children=0', async () => {
      const mockTx = (prisma as any)._mockTx;
      const existing = {
        id: mockCategoryId,
        code: 'CAT-EMPTY',
        name: 'Empty Category',
        _count: { items: 0, children: 0 },
      };
      mockTx.category.findUnique.mockResolvedValueOnce(existing);
      mockTx.category.delete.mockResolvedValueOnce(existing);
      mockTx.auditLog.create.mockResolvedValueOnce({ id: 'audit-3' });

      const res = await categoriesService.deleteCategory(
        mockCategoryId,
        mockUserId,
        '127.0.0.1',
        'Vitest'
      );

      expect(res).toEqual(existing);
      expect(mockTx.category.delete).toHaveBeenCalledWith({ where: { id: mockCategoryId } });
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: mockUserId,
          action: 'DELETE',
          entity: 'Category',
          entityId: mockCategoryId,
          oldValue: existing,
          ipAddress: '127.0.0.1',
          userAgent: 'Vitest',
        },
      });
    });

    it('TC-CAT-12: blocks delete with 409 Conflict when category has active items', async () => {
      const mockTx = (prisma as any)._mockTx;
      const existingWithItems = {
        id: mockCategoryId,
        code: 'CAT-MCU',
        name: 'Vi điều khiển',
        _count: { items: 5, children: 0 },
      };
      mockTx.category.findUnique.mockResolvedValueOnce(existingWithItems);

      await expect(
        categoriesService.deleteCategory(mockCategoryId, mockUserId)
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('5 linh kiện trực thuộc'),
      });
      expect(mockTx.category.delete).not.toHaveBeenCalled();
    });

    it('TC-CAT-13: blocks delete with 409 Conflict when category has child categories', async () => {
      const mockTx = (prisma as any)._mockTx;
      const existingWithChildren = {
        id: mockCategoryId,
        code: 'CAT-ROOT',
        name: 'Danh mục gốc',
        _count: { items: 0, children: 2 },
      };
      mockTx.category.findUnique.mockResolvedValueOnce(existingWithChildren);

      await expect(
        categoriesService.deleteCategory(mockCategoryId, mockUserId)
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('2 danh mục con trực thuộc'),
      });
      expect(mockTx.category.delete).not.toHaveBeenCalled();
    });

    it('TC-CAT-14: throws 404 when attempting to delete non-existent category', async () => {
      const mockTx = (prisma as any)._mockTx;
      mockTx.category.findUnique.mockResolvedValueOnce(null);

      await expect(
        categoriesService.deleteCategory('non-existent', mockUserId)
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'Không tìm thấy danh mục yêu cầu',
      });
      expect(mockTx.category.delete).not.toHaveBeenCalled();
    });
  });

  describe('5. RBAC & Router HTTP Integration Suite', () => {
    function createTestApp(userRole?: UserRole | null) {
      const app = express();
      app.use(express.json());
      if (userRole !== null) {
        app.use((req: any, _res: any, next: any) => {
          if (userRole) {
            req.headers.authorization = 'Bearer mock-valid-token';
            req.user = {
              id: mockUserId,
              email: 'test@example.com',
              role: userRole,
              fullName: 'Test User',
            };
          }
          next();
        });
      }
      app.use('/api/v1/categories', categoriesRouter);
      app.use(errorHandler);
      return app;
    }

    it('TC-CAT-RBAC-01: GET /api/v1/categories is open to unauthenticated users', async () => {
      vi.mocked(prisma.category.findMany).mockResolvedValueOnce([
        { id: '1', code: 'CAT-1', name: 'Cat 1' },
      ] as any);

      const app = createTestApp(null);
      const res = await request(app).get('/api/v1/categories');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-CAT-RBAC-02: POST /api/v1/categories returns 401 when unauthenticated', async () => {
      const app = createTestApp(null);
      const res = await request(app)
        .post('/api/v1/categories')
        .send({ code: 'CAT-NEW', name: 'New Cat' });
      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Bearer Token');
    });

    it('TC-CAT-RBAC-03: POST /api/v1/categories returns 403 Forbidden for STUDENT', async () => {
      const app = createTestApp(UserRole.STUDENT);
      const res = await request(app)
        .post('/api/v1/categories')
        .send({ code: 'CAT-NEW', name: 'New Cat' });
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Bạn không có quyền');
    });

    it('TC-CAT-RBAC-04: POST /api/v1/categories returns 403 Forbidden for TECHNICIAN', async () => {
      const app = createTestApp(UserRole.TECHNICIAN);
      const res = await request(app)
        .post('/api/v1/categories')
        .send({ code: 'CAT-NEW', name: 'New Cat' });
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Bạn không có quyền');
    });

    it('TC-CAT-RBAC-05: POST /api/v1/categories allows ADMIN and creates category', async () => {
      const mockTx = (prisma as any)._mockTx;
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce(null);
      mockTx.category.create.mockResolvedValueOnce({
        id: mockCategoryId,
        code: 'CAT-ADMIN',
        name: 'Admin Cat',
      });
      mockTx.auditLog.create.mockResolvedValueOnce({ id: 'audit-1' });

      const app = createTestApp(UserRole.ADMIN);
      const res = await request(app)
        .post('/api/v1/categories')
        .send({ code: 'CAT-ADMIN', name: 'Admin Cat' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('CAT-ADMIN');
    });

    it('TC-CAT-RBAC-06: POST /api/v1/categories allows LAB_MANAGER and creates category', async () => {
      const mockTx = (prisma as any)._mockTx;
      vi.mocked(prisma.category.findUnique).mockResolvedValueOnce(null);
      mockTx.category.create.mockResolvedValueOnce({
        id: mockCategoryId,
        code: 'CAT-LAB',
        name: 'Lab Manager Cat',
      });
      mockTx.auditLog.create.mockResolvedValueOnce({ id: 'audit-2' });

      const app = createTestApp(UserRole.LAB_MANAGER);
      const res = await request(app)
        .post('/api/v1/categories')
        .send({ code: 'CAT-LAB', name: 'Lab Manager Cat' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('CAT-LAB');
    });

    it('TC-CAT-RBAC-07: PATCH /api/v1/categories/:id returns 403 Forbidden for TECHNICIAN', async () => {
      const app = createTestApp(UserRole.TECHNICIAN);
      const res = await request(app)
        .patch(`/api/v1/categories/${mockCategoryId}`)
        .send({ name: 'Updated Name' });
      expect(res.status).toBe(403);
    });

    it('TC-CAT-RBAC-08: PATCH /api/v1/categories/:id allows ADMIN to update', async () => {
      const mockTx = (prisma as any)._mockTx;
      mockTx.category.findUnique.mockResolvedValueOnce({
        id: mockCategoryId,
        code: 'CAT-OLD',
        name: 'Old Name',
      });
      mockTx.category.update.mockResolvedValueOnce({
        id: mockCategoryId,
        code: 'CAT-OLD',
        name: 'Updated Name',
      });
      mockTx.auditLog.create.mockResolvedValueOnce({ id: 'audit-3' });

      const app = createTestApp(UserRole.ADMIN);
      const res = await request(app)
        .patch(`/api/v1/categories/${mockCategoryId}`)
        .send({ name: 'Updated Name' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Name');
    });

    it('TC-CAT-RBAC-09: DELETE /api/v1/categories/:id returns 403 Forbidden for TECHNICIAN', async () => {
      const app = createTestApp(UserRole.TECHNICIAN);
      const res = await request(app).delete(`/api/v1/categories/${mockCategoryId}`);
      expect(res.status).toBe(403);
    });

    it('TC-CAT-RBAC-10: DELETE /api/v1/categories/:id allows LAB_MANAGER when category is clean', async () => {
      const mockTx = (prisma as any)._mockTx;
      mockTx.category.findUnique.mockResolvedValueOnce({
        id: mockCategoryId,
        code: 'CAT-EMPTY',
        name: 'Empty Category',
        _count: { items: 0, children: 0 },
      });
      mockTx.category.delete.mockResolvedValueOnce({ id: mockCategoryId });
      mockTx.auditLog.create.mockResolvedValueOnce({ id: 'audit-4' });

      const app = createTestApp(UserRole.LAB_MANAGER);
      const res = await request(app).delete(`/api/v1/categories/${mockCategoryId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deleted).toBe(true);
    });
  });
});
