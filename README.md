# ACM – Components & Equipment Management System

> **Hệ thống Quản lý Linh kiện & Thiết bị (Air Components Manager)** dành cho Phòng Lab, Trung tâm AI Robotic và Cơ sở đào tạo kỹ thuật.

---

## 1. Tổng quan Kiến trúc (Architecture Overview)

Dự án được xây dựng dưới mô hình **Monorepo** với npm Workspaces:

```text
ACM_QLLK/
├── apps/
│   ├── web/                     # Frontend: React + Vite + TypeScript + Tailwind CSS
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── app/             # Router & App Root
│   │   │   ├── pages/           # Modern SaaS Dashboard Pages
│   │   │   ├── layouts/         # Sidebar, Header, DashboardLayout
│   │   │   ├── components/      # KpiCard, StatusBadge, DemoDataNotice,...
│   │   │   ├── hooks/           # useAuth hook
│   │   │   ├── services/        # Axios API client
│   │   │   └── styles/          # Tailwind CSS styles
│   │   └── package.json
│   └── api/                     # Backend: Express + TypeScript + Prisma ORM
│       ├── src/
│       │   ├── config/          # Environment, Prisma singleton, Logger
│       │   ├── modules/         # Modular Routers (health, auth, items, inventory, borrow, reports, audit)
│       │   ├── middleware/      # Error handler, JWT auth, RBAC, Validate, Audit
│       │   ├── shared/          # AppError, Response helpers
│       │   ├── app.ts           # Express Application Factory
│       │   └── server.ts        # Server HTTP Bootstrap
│       ├── prisma/
│       │   ├── schema.prisma    # PostgreSQL Schema (15 models & enums)
│       │   └── seed.ts          # Seed script (4 roles, demo users, locations, 7 core items)
│       ├── tests/               # Vitest & Supertest unit/integration tests
│       └── package.json
├── packages/
│   └── shared/                  # Common TypeScript types, Enums, Zod schemas, Invariant Stock formulas
├── docs/                        # Tài liệu kiến trúc & đặc tả nghiệp vụ
│   ├── product/                 # Product Overview & Scope
│   ├── requirements/            # Functional Requirements & Inventory Rules
│   ├── architecture/            # System Architecture & Cloud Design
│   └── development/             # Development Setup Guide
├── database/                    # Database init scripts (PostgreSQL)
├── tests/                       # Monorepo cross-package integration tests
├── infra/                       # Dockerfiles for Web and API
├── .github/workflows/           # GitHub Actions CI pipeline
├── .env.example                 # Configuration template
├── docker-compose.yml           # Local container orchestration
├── package.json                 # Monorepo npm workspaces config
└── README.md
```

---

## 2. Công nghệ Sử dụng (Technology Stack)

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, React Router v6, TanStack Query, Axios, Lucide React, Recharts.
- **Backend**: Node.js 20+, Express, TypeScript, Prisma ORM, PostgreSQL, Zod, JWT, bcryptjs, Helmet, Morgan.
- **Dev & DevOps**: npm Workspaces, Vitest, Supertest, Docker Compose, GitHub Actions.
- **Cloud Target**: Vercel (Web), Render (API), Supabase (PostgreSQL & Storage).

---

## 3. Quy tắc Cốt lõi Quản lý Tồn kho (Inventory Invariant Rules)

### Công thức Tồn khả dụng (Available Stock)
$$\text{Available} = \text{OnHand} - \text{Reserved} - \text{Quarantined} - \text{KitAllocated}$$

- **OnHand**: Tồn kho vật lý trong kho của phòng lab.
- **Reserved**: Số lượng đã được duyệt trong phiếu mượn (Approved), chờ người mượn đến nhận.
- **Quarantined**: Số lượng cách ly (hàng lỗi, hỏng chờ thanh lý).
- **KitAllocated**: Số lượng đã cấp cố định vào các bộ Kit thực hành.
- **Borrowed (Đang mượn)**: Số lượng linh kiện **đã bàn giao** ra ngoài lab.
  - **Quy tắc quan trọng:** Khi bàn giao, `OnHand` giảm và `Borrowed` tăng. Do đó `Borrowed` **không được trừ hai lần** khỏi `OnHand`.

---

## 4. Hướng dẫn Chạy Dự án (Quick Start)

### 4.1. Cài đặt toàn bộ dependencies
```bash
npm install
```

### 4.2. Cấu hình biến môi trường
```bash
cp .env.example .env
```

### 4.3. Validate & Generate Prisma
```bash
npm run prisma:generate
npm run prisma:validate
```

### 4.4. Build Monorepo
```bash
npm run build:shared
npm run build:api
npm run build:web
```

### 4.5. Khởi động môi trường phát triển
```bash
# Khởi động Backend (Port 5000)
npm run dev:api

# Khởi động Frontend (Port 5173)
npm run dev:web
```

### 4.6. Chạy Kiểm thử (Tests)
```bash
npm run test
```

---

## 5. Tài khoản Thử nghiệm (Demo Credentials)

| Vai trò (Role) | Email | Mật khẩu mặc định |
| :--- | :--- | :--- |
| **System Admin** | `admin@acm.local` | `ACM@dev2026!` |
| **Lab Manager** | `manager@acm.local` | `ACM@dev2026!` |
| **Technician** | `tech@acm.local` | `ACM@dev2026!` |
| **Student** | `student@acm.local` | `ACM@dev2026!` |

---

## 6. Legacy Module Requirements Index (Bảo toàn tài liệu hiện có)
- [Authentication & Authorization](./Authentication_&_Authorization)
- [User Management](./User_Management)
- [Category & Item Management](./Category_&_Item_Management)
- [Inventory & Location Management](./Inventory_&_Location_Management)
- [Import, Export & Stock Transactions](./Import,_Export_&_Stock_Transactions)
- [Borrow & Return Management](./Borrow_&_Return_Management)
