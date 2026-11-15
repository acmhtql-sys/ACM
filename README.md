# ⚡ ACM – Components & Equipment Management System

> **Hệ thống Quản lý Linh kiện & Thiết bị (Air Components Manager)**  
> Giải pháp quản lý vòng đời linh kiện, thiết bị, vị trí kho và bộ Kit thực hành chuyên sâu dành cho **Phòng Lab Robotics, Trung tâm AI & Cơ sở Đào tạo Kỹ thuật**.

---

<p align="center">
  <img src="https://img.shields.io/badge/Status-Production--Ready-success?style=for-the-badge&logo=statuspage" alt="Status" />
  <img src="https://img.shields.io/badge/Architecture-Monorepo-blue?style=for-the-badge&logo=turborepo" alt="Architecture" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-17-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
</p>

<p align="center">
  🌐 <strong>Live Cloud App:</strong> <a href="https://acm-acm-1cfa.vercel.app" target="_blank">acm-acm-1cfa.vercel.app</a> &nbsp;|&nbsp; 
  🔗 <strong>Repository:</strong> <a href="https://github.com/acmhtql-sys/ACM" target="_blank">github.com/acmhtql-sys/ACM</a>
</p>

---

## 📌 Mục lục (Table of Contents)

- [1. Giới thiệu Dự án](#1-giới-thiệu-dự-án-project-overview)
- [2. Tính năng Nổi bật](#2-tính-năng-nổi-bật-key-features)
- [3. Kiến trúc Monorepo Chuẩn](#3-kiến-trúc-monorepo-chuẩn-workspace-structure)
- [4. Công nghệ Sử dụng](#4-công-nghệ-sử-dụng-technology-stack)
- [5. Quy tắc Bất biến Quản lý Tồn kho](#5-quy-tắc-bất-biến-quản-lý-tồn-kho-inventory-invariant-rules)
- [6. Hướng dẫn Cài đặt & Khởi chạy](#6-hướng-dẫn-cài-đặt--khởi-chạy-quick-start)
- [7. Tài khoản Thử nghiệm](#7-tài-khoản-thử-nghiệm-demo-credentials)
- [8. Tài liệu Bàn giao & Kỹ thuật](#8-tài-liệu-bàn-giao--kỹ-thuật-documentation)
- [9. Bản quyền & Tác giả](#9-bản-quyền--tác-giả-copyright--authors)

---

## 1. Giới thiệu Dự án (Project Overview)

**ACM (Air Components Manager)** là nền tảng quản lý chuyên biệt được thiết kế để giải quyết bài toán phức tạp trong vận hành phòng Lab Robotics & Trí tuệ Nhân tạo:
- Thất thoát linh kiện nhỏ (cảm biến, vi điều khiển, dây cáp, ốc vít).
- Xung đột số lượng tồn kho khi nhiều lớp thực hành cùng mượn thiết bị.
- Thiếu công cụ quản lý các **Hộp Kit thực hành (Practice Kits)** theo chủ đề môn học.
- Quy trình mượn - trả thủ công trên giấy tờ hoặc bảng tính dễ nhầm lẫn, thiếu tính bảo toàn lịch sử.

Hệ thống cung cấp giao diện Dashboard SaaS hiện đại, khả năng quét mã QR nhanh chóng, cơ chế kiểm soát tồn kho theo thời gian thực (Real-time Inventory Tracking) và thuật toán phân bổ nguyên tử (Atomic CAS Allocation) chống race condition tuyệt đối.

---

## 2. Tính năng Nổi bật (Key Features)

### 🧰 1. Quản lý Hộp Kit Thực hành (Practice Kits)
- Quản lý vòng đời hộp kit từ khi đóng gói, phân bổ bài học đến khi thu hồi hoặc rã kit.
- **Tự động liên kết kho nguồn:** Tự động kết nối linh kiện thành phần với các Khay/Thùng còn hàng.
- **Chống trùng lặp thông minh (Auto-merge):** Tự động gộp số lượng và ghi chú khi chọn trùng linh kiện, giao diện stepper số lượng tối ưu.

### 📦 2. Quản lý Danh mục & Linh kiện Đa tầng
- Quản lý thông tin chi tiết: Mã SKU, Tên, Danh mục, Đơn vị tính, Hình ảnh, Tồn tối thiểu, Vị trí cất giữ.
- Cảnh báo tự động khi linh kiện chạm ngưỡng tồn kho an toàn.

### 🗄️ 3. Quản lý Kho & Vị trí Lưu trữ Trực quan
- Mô hình phân cấp 3 cấp độ: `Kho tổng (Warehouse)` ➔ `Kệ (Shelf)` ➔ `Khay / Hộp / Thùng linh kiện (Bin/Box)`.
- Tra cứu tức thì số lượng từng linh kiện đang nằm ở chính xác ngăn khay/hộp nào.

### 🔄 4. Mượn & Trả Linh kiện (Borrow & Return Management)
- Luồng máy trạng thái (FSM) chặt chẽ: `PENDING` (Chờ duyệt) ➔ `APPROVED` (Đã duyệt) ➔ `HANDED_OVER` (Đã bàn giao) ➔ `RETURNED` (Đã hoàn trả).
- Hỗ trợ mượn theo từng linh kiện lẻ hoặc mượn trọn bộ Hộp Kit thực hành.
- Quét mã QR / Barcode hỗ trợ bàn giao nhanh tại quầy kỹ thuật.

### 📥 5. Giao dịch Nhập - Xuất - Điều chuyển Kho
- Lưu vết lịch sử xuất nhập kho minh bạch, liên kết trực tiếp với phiếu nhập/xuất.
- Cơ chế bảo vệ Idempotency Key chống gửi trùng lặp giao dịch khi mạng chập chờn.

### 🛡️ 6. Phân quyền RBAC & Bảo mật Toàn diện
- Phân quyền theo 4 vai trò cụ thể:
  - 👑 **System Admin:** Quản trị toàn quyền, cấu hình hệ thống, quản lý người dùng.
  - 👔 **Lab Manager:** Quản lý xuất nhập, duyệt phiếu mượn, quản lý hộp kit, xem báo cáo.
  - 🔧 **Technician:** Bàn giao thiết bị, kiểm kê kho, kiểm tra chất lượng khi hoàn trả.
  - 🎓 **Student / Borrower:** Tạo yêu cầu mượn, theo dõi trạng thái phiếu mượn cá nhân.
- Bảo mật xác thực qua JWT, cơ chế khóa tài khoản chống brute-force, bảo vệ tài khoản Quản trị viên cuối cùng (Last Operational Admin Recovery).

---

## 3. Kiến trúc Monorepo Chuẩn (Workspace Structure)

Dự án được cấu trúc theo tiêu chuẩn **npm Workspaces Monorepo**, phân tách rõ ràng giữa ứng dụng, thư viện dùng chung và tài liệu:

```text
ACM/
├── apps/
│   ├── web/                     # Frontend App: React 18 + Vite + Tailwind CSS
│   │   ├── src/
│   │   │   ├── app/             # Router & App Root
│   │   │   ├── pages/           # SaaS Dashboard Pages (Items, Kits, Borrow, Inventory,...)
│   │   │   ├── layouts/         # Sidebar, Header, Mobile Nav
│   │   │   ├── components/      # UI components, Modals, Camera QR Scanner
│   │   │   └── services/        # Axios API Client & State management
│   │   └── package.json
│   └── api/                     # Backend API: Node.js + Express + TypeScript + Prisma
│       ├── src/
│       │   ├── config/          # Database connection, Environment, Security
│       │   ├── modules/         # Modular APIs (auth, items, kits, borrow, inventory, audit)
│       │   ├── middleware/      # Error handler, RBAC, Idempotency, Rate Limiter
│       │   └── server.ts        # Express HTTP Bootstrap
│       ├── prisma/              # schema.prisma & Migration scripts
│       └── package.json
├── packages/
│   └── shared/                  # Thư viện dùng chung (@acm/shared)
│       └── src/                 # Shared Types, DTOs, Enums, Zod schemas, Invariant formulas
├── database/                    # Script khởi tạo cơ sở dữ liệu (init.sql cho Docker)
├── docs/                        # Toàn bộ tài liệu kỹ thuật, kiến trúc & deployment
│   ├── deployment/              # Checklist triển khai Cloud, báo cáo kiểm định bảo mật
│   └── runbooks/                # Hướng dẫn quy trình vận hành và khôi phục sự cố
├── infra/                       # Cấu hình Supabase SQL, RLS Policies, Dockerfile
├── scripts/                     # Script seed dữ liệu mẫu, migration, kiểm tra bảo mật
├── tests/                       # Bộ kiểm thử tích hợp chéo monorepo (Integration Tests)
├── .github/workflows/           # GitHub Actions CI/CD Pipeline tự động
├── docker-compose.yml           # Khởi chạy PostgreSQL 17 & Redis cục bộ
├── render.yaml                  # Cấu hình tự động triển khai Backend trên Render
├── vercel.json                  # Cấu hình định tuyến & triển khai Frontend trên Vercel
├── package.json                 # Cấu hình gốc Monorepo npm workspaces
└── README.md                    # Tài liệu hướng dẫn chính của dự án
```

---

## 4. Công nghệ Sử dụng (Technology Stack)

| Lĩnh vực | Công nghệ | Chi tiết sử dụng |
| :--- | :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite | Xây dựng Single Page Application hiệu năng cao |
| **Giao diện & UI** | Tailwind CSS, Lucide React, Recharts | Thiết kế phong cách SaaS hiện đại, responsive hoàn toàn |
| **Backend** | Node.js (v20+ / v22), Express, TypeScript | RESTful API mô-đun hóa, bảo vệ CSRF, CORS, Helmet |
| **Cơ sở dữ liệu** | PostgreSQL 17, Supabase | Cơ sở dữ liệu quan hệ, Row-Level Security, Realtime storage |
| **ORM & Migration** | Prisma ORM | Quản lý schema, type-safe query, migration tự động |
| **Kiểm thử (Testing)** | Vitest, Testing Library, Supertest | Unit test, DOM test, Integration test và API test |
| **Hạ tầng & Cloud** | Vercel (Web), Render (API), Docker Compose | CI/CD tự động qua GitHub Actions, multi-cloud ready |

---

## 5. Quy tắc Bất biến Quản lý Tồn kho (Inventory Invariant Rules)

Hệ thống áp dụng công thức bảo toàn tồn kho nghiêm ngặt để đảm bảo dữ liệu luôn chính xác tuyệt đối:

$$\text{Available} = \text{OnHand} - \text{Reserved} - \text{Quarantined} - \text{KitAllocated}$$

### Ý nghĩa các đại lượng:
- **`OnHand` (Tồn thực tế):** Số lượng vật lý đang có mặt trong kho của phòng Lab.
- **`Reserved` (Đã giữ chỗ):** Số lượng nằm trong các phiếu mượn đã được duyệt (`APPROVED`), chờ sinh viên tới quầy nhận.
- **`Quarantined` (Cách ly):** Số lượng linh kiện bị hỏng hóc, lỗi kỹ thuật đang chờ xử lý hoặc thanh lý.
- **`KitAllocated` (Cấp phát Kit):** Số lượng linh kiện đã được đóng gói cố định vào các Hộp Kit thực hành.
- **`Borrowed` (Đang mượn bên ngoài):** Số lượng linh kiện đã được bàn giao (`HANDED_OVER`) ra khỏi phạm vi phòng Lab.
  > ⚠️ **Lưu ý bảo toàn:** Khi bàn giao, `OnHand` giảm tương ứng với số linh kiện mang ra ngoài, đồng thời `Borrowed` tăng lên. Do đó `Borrowed` **không được phép trừ lặp lần 2** khỏi `OnHand`.

---

## 6. Hướng dẫn Cài đặt & Khởi chạy (Quick Start)

### 6.1. Yêu cầu Tiên quyết
- Node.js version `>= 20.x` (khuyến nghị v22 LTS)
- npm version `>= 10.x`
- Docker & Docker Compose (nếu chạy Database PostgreSQL cục bộ)

### 6.2. Cài đặt Dependencies
```bash
# Clone repository
git clone https://github.com/acmhtql-sys/ACM.git
cd ACM

# Cài đặt tất cả dependencies cho các workspaces
npm install
```

### 6.3. Cấu hình Biến môi trường
```bash
cp .env.example .env
```
*Chỉnh sửa file `.env` với chuỗi kết nối Database và JWT Secret phù hợp.*

### 6.4. Sinh mã Prisma & Khởi tạo Database
```bash
# Sinh Prisma Client
npm run prisma:generate

# Kiểm tra tính hợp lệ của Schema
npm run prisma:validate
```

### 6.5. Build Dự án
```bash
# Build gói dùng chung (@acm/shared)
npm run build:shared

# Build toàn bộ Backend và Frontend
npm run build
```

### 6.6. Khởi động Chế độ Phát triển (Development)
```bash
# Khởi động Backend API (Port 5000)
npm run dev:api

# Khởi động Frontend Web (Port 5173)
npm run dev:web
```
*Truy cập ứng dụng tại:* `http://localhost:5173`

### 6.7. Chạy Kiểm thử (Testing)
```bash
# Chạy toàn bộ Unit Tests
npm run test:unit

# Chạy Integration Tests
npm run test:integration
```

---

## 7. Tài khoản Thử nghiệm (Demo Credentials)

| Vai trò (Role) | Email đăng nhập | Mật khẩu mặc định | Quyền hạn chính |
| :--- | :--- | :--- | :--- |
| **System Admin** | `admin@acm.local` | `ACM@dev2026!` | Toàn quyền quản trị hệ thống, quản lý người dùng |
| **Lab Manager** | `manager@acm.local` | `ACM@dev2026!` | Quản lý kho, duyệt phiếu mượn, tạo hộp kit, báo cáo |
| **Technician** | `tech@acm.local` | `ACM@dev2026!` | Bàn giao mượn/trả, kiểm kê kho, thao tác kỹ thuật |
| **Student** | `student@acm.local` | `ACM@dev2026!` | Tra cứu linh kiện, gửi yêu cầu mượn kit |

---

## 8. Tài liệu Kỹ thuật & Vận hành (Documentation)

Hệ thống được lập tài liệu kỹ thuật và hướng dẫn vận hành chi tiết tại:

- 📂 **[Thư mục Tài liệu Kỹ thuật (docs/)](./docs/)**: Chứa tài liệu kiến trúc tổng thể, sơ đồ cơ sở dữ liệu và checklist triển khai hệ thống.
- 🚀 **[Hướng dẫn Triển khai Cloud (docs/deployment/)](./docs/deployment/)**: Toàn bộ tài liệu cấu hình môi trường, checklist kiểm tra bảo mật và báo cáo nghiệm thu.
- 📖 **[Quy trình Vận hành & Cứu hộ (docs/runbooks/)](./docs/runbooks/)**: Hướng dẫn quy trình quản trị viên, xử lý khẩn cấp và bảo trì hệ thống.

---

## 9. Bản quyền & Tác giả (Copyright & Authors)

Dự án **ACM – Components & Equipment Management System** được phát triển và thuộc quyền sở hữu trí tuệ của:

<div align="center">

| Đại diện sở hữu | Tài khoản GitHub | Vai trò đóng góp |
| :--- | :--- | :--- |
| **Tổ chức Dự án** | [@acmhtql-sys](https://github.com/acmhtql-sys) | Đơn vị chủ quản hệ thống & Quản trị kho mã nguồn |
| **Thái Phương** | [@Phuong05122005](https://github.com/Phuong05122005) | Tác giả chính, Phát triển & Kiến trúc hệ thống |
| **Minh Ánh** | [@minhanhhhhhhh](https://github.com/minhanhhhhhhh) | Đồng tác giả, Thiết kế nghiệp vụ & Tài liệu hệ thống |

<br/>

**© 2026 ACM – Air Components Manager. Bản quyền thuộc về acmhtql-sys, Phuong05122005 và minhanhhhhhhh.**  
*Mọi hành vi sao chép, phân phối hoặc sử dụng cho mục đích thương mại phải có sự đồng ý bằng văn bản của các tác giả.*

</div>
