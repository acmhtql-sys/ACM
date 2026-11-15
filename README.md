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

Dự án được tổ chức theo mô hình **Monorepo** với 3 tầng chức năng độc lập, phân tách rõ ràng trách nhiệm:

| Tầng kiến trúc | Thư mục | Vai trò & Trách nhiệm chính |
| :--- | :--- | :--- |
| 🌐 **Frontend Application** | `apps/web/` | Giao diện SaaS Dashboard (React 18, Vite, Tailwind CSS, TanStack Query) |
| 🚀 **Backend Service** | `apps/api/` | Dịch vụ RESTful API lõi (Express, TypeScript, Prisma ORM, JWT, RBAC Guard) |
| 📦 **Shared Library** | `packages/shared/` | Thư viện dùng chung (@acm/shared: Types, DTOs, Enums, Zod Schemas, Công thức tồn kho) |
| 🗄️ **Database & Infra** | `database/`, `infra/` | Script khởi tạo DB PostgreSQL (`init.sql`), Supabase RLS Policies, Docker Compose |
| 📚 **Docs & Scripts** | `docs/`, `scripts/` | Tài liệu kiến trúc, runbook vận hành, scripts seed dữ liệu và kiểm thử hệ thống |

```text
ACM/
├── 🌐 apps/
│   ├── web/                    # Giao diện người dùng Web (React 18 + Vite + Tailwind CSS)
│   └── api/                    # Dịch vụ Backend API (Node.js + Express + Prisma ORM)
├── 📦 packages/
│   └── shared/                 # Định nghĩa dùng chung (@acm/shared: Types, DTOs, Enums, Math)
├── 🗄️ database/                 # Script khởi tạo cơ sở dữ liệu PostgreSQL cục bộ (init.sql)
├── 📚 docs/                     # Toàn bộ tài liệu kiến trúc, deployment staging & runbooks
├── ☁️ infra/                    # Cấu hình hạ tầng Supabase, RLS Policies, Dockerfile
├── ⚙️ scripts/                  # Scripts seed dữ liệu, migration và kiểm thử hệ thống
├── 🧪 tests/                    # Kiểm thử tích hợp chéo monorepo (Monorepo Integration Tests)
└── 🤖 .github/workflows/        # CI/CD Workflows tự động kiểm tra mã nguồn (GitHub Actions)
```

---

## 4. Công nghệ Sử dụng (Technology Stack)

| Phân hệ / Lĩnh vực | Công nghệ Chủ đạo | Chi tiết & Mục đích Sử dụng |
| :--- | :--- | :--- |
| 🌐 **Frontend App** | ![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) | Xây dựng Single Page Application hiệu năng cao, type-safe toàn diện |
| 🎨 **Giao diện & UI** | ![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) ![Lucide](https://img.shields.io/badge/Lucide_Icons-F56565?style=flat-square) ![Recharts](https://img.shields.io/badge/Recharts-22C55E?style=flat-square) | Phong cách SaaS Dashboard hiện đại, responsive đa thiết bị, biểu đồ động |
| 🚀 **Backend Service** | ![Node.js](https://img.shields.io/badge/Node.js_22-339933?style=flat-square&logo=nodedotjs&logoColor=white) ![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white) | RESTful API mô-đun hóa, bảo vệ CSRF, CORS, Helmet, Rate Limiter |
| 🗄️ **Cơ sở Dữ liệu** | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL_17-4169E1?style=flat-square&logo=postgresql&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white) | Cơ sở dữ liệu quan hệ ACID, Row-Level Security (RLS), Cloud Storage |
| 🔄 **ORM & Validation** | ![Prisma](https://img.shields.io/badge/Prisma_ORM-2D3748?style=flat-square&logo=prisma&logoColor=white) ![Zod](https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white) | Type-safe query builder, migration tự động, kiểm thực dữ liệu 2 chiều |
| 🧪 **Kiểm thử (Test)** | ![Vitest](https://img.shields.io/badge/Vitest-FCC72B?style=flat-square&logo=vitest&logoColor=black) ![Testing_Library](https://img.shields.io/badge/Testing_Library-E33332?style=flat-square&logo=testinglibrary&logoColor=white) | Unit test (438+ tests), DOM test component, API integration test |
| ☁️ **Hạ tầng & Cloud** | ![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white) ![Render](https://img.shields.io/badge/Render-46E3B7?style=flat-square&logo=render&logoColor=black) ![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white) | Triển khai Multi-Cloud, CI/CD tự động hóa qua GitHub Actions |

---

## 5. Quy tắc Bất biến Quản lý Tồn kho (Inventory Invariant Rules)

Hệ thống áp dụng mô hình toán học bảo toàn tồn kho nghiêm ngặt để đảm bảo số liệu vật lý tại kho và số liệu trên phần mềm luôn chính xác tuyệt đối theo thời gian thực:

<div align="center">

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│   TỒN KHẢ DỤNG (Available) = OnHand − Reserved − Quarantined − KitAllocated            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

$$\mathbf{Available} = \mathbf{OnHand} - \mathbf{Reserved} - \mathbf{Quarantined} - \mathbf{KitAllocated}$$

</div>

### Bảng Định nghĩa & Trạng thái Vật lý

| Chỉ số Tồn kho | Ký hiệu | Ý nghĩa trong Phòng Lab Robotics & AI | Trạng thái Vật lý |
| :--- | :---: | :--- | :--- |
| **Tồn thực tế** | `OnHand` | Tổng số lượng linh kiện đang có mặt thực tế trong các kệ, tủ, khay của phòng Lab | 🏢 Nằm tại phòng kho |
| **Đã giữ chỗ** | `Reserved` | Số lượng linh kiện nằm trong các phiếu mượn đã được duyệt (`APPROVED`), đang chờ người mượn tới quầy nhận | ⏳ Chờ bàn giao |
| **Hàng cách ly** | `Quarantined` | Số lượng linh kiện bị hỏng hóc, cháy nổ, gãy chân cắm... đang cách ly chờ sửa chữa hoặc thanh lý | ⚠️ Ngăn cách ly |
| **Cấp phát Kit** | `KitAllocated` | Số lượng linh kiện đã được đóng gói cố định vào các **Hộp Kit thực hành** theo chủ đề bài học | 🧰 Nằm trong hộp Kit |
| **Tồn khả dụng** | `Available` | Số lượng thực sự còn tự do để cho mượn lẻ hoặc lấy ra đóng thêm các bộ Kit mới | ✅ Sẵn sàng xuất mượn |
| **Đang mượn ngoài** | `Borrowed` | Số lượng linh kiện **đã bàn giao** (`HANDED_OVER`) ra khỏi phạm vi phòng Lab | 🏃 Sinh viên đang giữ |

> ### 💡 Nguyên lý Bảo toàn Bất biến (Zero Double-Deduction Principle)
> - **Khi bàn giao linh kiện (`HANDED_OVER`):**  
>   Linh kiện rời khỏi phòng Lab ➔ $\text{OnHand}$ giảm đúng bằng số lượng bàn giao, đồng thời $\text{Borrowed}$ tăng lên tương ứng.
> - **Quy tắc tuyệt đối:** Vì $\text{OnHand}$ đã giảm khi mang ra ngoài, nên $\text{Borrowed}$ **KHÔNG ĐƯỢC PHÉP TRỪ LẶP LẦN 2** vào công thức $\text{Available}$.
> - **Khi hoàn trả (`RETURNED`):**  
>   Linh kiện nhập lại kho ➔ $\text{Borrowed}$ giảm và $\text{OnHand}$ tăng lại (hoặc chuyển vào $\text{Quarantined}$ nếu bị hỏng trong quá trình thực hành).

---

## 6. Hướng dẫn Cài đặt & Khởi chạy (Quick Start)

> **Yêu cầu môi trường:** Node.js `>= 20.x` (khuyến nghị v22 LTS) & npm `>= 10.x`. Tùy chọn Docker Compose nếu chạy Database cục bộ.

### 6.1. Khởi chạy Nhanh (5 Bước Tinh gọn)

```bash
# 1. Clone repository & cài đặt dependencies cho toàn bộ monorepo
git clone https://github.com/acmhtql-sys/ACM.git
cd ACM
npm install

# 2. Cấu hình biến môi trường
cp .env.example .env

# 3. Khởi tạo Prisma Client & kiểm tra Schema cơ sở dữ liệu
npm run prisma:generate
npm run prisma:validate

# 4. Biên dịch các gói dùng chung & ứng dụng
npm run build:shared
npm run build

# 5. Khởi chạy môi trường phát triển (Chạy song song Backend & Frontend)
npm run dev:api    # 🚀 Backend API:  http://localhost:5000
npm run dev:web    # 🌐 Frontend Web:  http://localhost:5173
```

### 6.2. Bảng Tra cứu Các Lệnh Hỗ trợ Thường Dùng (Commands Reference)

| Tác vụ | Lệnh thực thi | Mô tả chi tiết |
| :--- | :--- | :--- |
| **Kiểm thử Unit** | `npm run test:unit` | Chạy toàn bộ unit test của `packages/shared`, `apps/api`, `apps/web` |
| **Kiểm thử Tích hợp** | `npm run test:integration` | Kiểm thử tích hợp monorepo chéo các gói và cơ sở dữ liệu |
| **Kiểm tra TypeScript** | `npm run typecheck` | Quét kiểm tra type safety toàn bộ workspace mà không sinh file |
| **Khởi chạy Docker DB** | `docker compose up -d` | Khởi tạo PostgreSQL 17 và Redis cục bộ trong container |
| **Seed dữ liệu mẫu** | `npm run prisma:seed:test` | Nạp dữ liệu mẫu ban đầu (phòng kho, danh mục, linh kiện, tài khoản) |

---

## 7. Tài khoản Thử nghiệm (Demo Credentials)

Hệ thống được thiết kế theo mô hình phân quyền dựa trên vai trò (**Role-Based Access Control - RBAC**) với 4 tài khoản thử nghiệm tiêu chuẩn:

| Vai trò (Role) | Email đăng nhập | Phạm vi Quyền hạn & Trách nhiệm chính |
| :--- | :--- | :--- |
| 👑 **System Admin** | `admin@acm.local` | Quản trị toàn quyền, cấu hình hệ thống, quản lý tài khoản người dùng, xem toàn bộ nhật ký kiểm toán (Audit Logs) |
| 👔 **Lab Manager** | `manager@acm.local` | Quản lý kho, duyệt phiếu mượn/trả, quản lý và đóng gói hộp kit thực hành, xem báo cáo thống kê KPI |
| 🔧 **Technician** | `tech@acm.local` | Bàn giao thiết bị cho sinh viên, nhận hoàn trả, kiểm kê tồn kho định kỳ, kiểm tra chất lượng linh kiện |
| 🎓 **Student** | `student@acm.local` | Tra cứu linh kiện trong kho, lập phiếu yêu cầu mượn linh kiện/hộp kit, theo dõi lịch sử mượn cá nhân |

> 🔒 **Lưu ý bảo mật (Security Policy):**  
> Vì lý do an toàn thông tin, **mật khẩu đăng nhập không được công khai trên kho lưu trữ mã nguồn**.  
> Mật khẩu cho các tài khoản thử nghiệm được cấu hình an toàn thông qua biến môi trường nội bộ trong tệp `.env` hoặc được tạo tự động khi chạy lệnh seed cơ sở dữ liệu (`npm run prisma:seed:test`). Vui lòng liên hệ quản trị viên dự án để nhận thông tin xác thực an toàn.

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
