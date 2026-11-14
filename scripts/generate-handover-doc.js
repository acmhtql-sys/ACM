const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  ShadingType,
} = require('docx');

// Palette colors
const COLOR_PRIMARY = '1E3A8A';   // Dark Navy
const COLOR_SECONDARY = '2563EB'; // Blue
const COLOR_ACCENT = '0D9488';    // Teal
const COLOR_TEXT = '1E293B';      // Slate 800
const COLOR_MUTED = '64748B';     // Slate 500
const COLOR_BG_LIGHT = 'F8FAFC';  // Slate 50
const COLOR_BORDER = 'CBD5E1';    // Slate 300
const COLOR_WHITE = 'FFFFFF';
const COLOR_WARN = 'D97706';      // Amber
const COLOR_SUCCESS = '059669';   // Emerald

function createTitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 38,
        color: COLOR_PRIMARY,
        font: 'Arial',
      }),
    ],
  });
}

function createSubtitle(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 300 },
    children: [
      new TextRun({
        text,
        size: 24,
        color: COLOR_MUTED,
        font: 'Arial',
        italics: true,
      }),
    ],
  });
}

function createHeading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 28,
        color: COLOR_PRIMARY,
        font: 'Arial',
      }),
    ],
  });
}

function createHeading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        color: COLOR_SECONDARY,
        font: 'Arial',
      }),
    ],
  });
}

function createHeading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 180, after: 80 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 22,
        color: COLOR_TEXT,
        font: 'Arial',
      }),
    ],
  });
}

function createParagraph(text, options = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80, line: 280 },
    children: [
      new TextRun({
        text,
        size: 22,
        color: options.color || COLOR_TEXT,
        bold: options.bold || false,
        italics: options.italics || false,
        font: 'Arial',
      }),
    ],
  });
}

function createBullet(text, boldPrefix = '') {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 40, after: 40, line: 260 },
    children: [
      ...(boldPrefix
        ? [
            new TextRun({
              text: boldPrefix + ' ',
              bold: true,
              size: 22,
              color: COLOR_PRIMARY,
              font: 'Arial',
            }),
          ]
        : []),
      new TextRun({
        text,
        size: 22,
        color: COLOR_TEXT,
        font: 'Arial',
      }),
    ],
  });
}

function createCallout(title, content, type = 'info') {
  const borderColor = type === 'warn' ? COLOR_WARN : COLOR_SECONDARY;
  const bgColor = type === 'warn' ? 'FFFBEB' : 'EFF6FF';

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: bgColor },
            borders: {
              top: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.SINGLE, size: 24, color: borderColor },
            },
            margins: { top: 140, bottom: 140, left: 200, right: 140 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: title,
                    bold: true,
                    size: 22,
                    color: borderColor,
                    font: 'Arial',
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: content,
                    size: 21,
                    color: COLOR_TEXT,
                    font: 'Arial',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function createTable(headers, rowsData, colWidths = []) {
  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: headers.map((h, i) => {
        return new TableCell({
          width: colWidths[i] ? { size: colWidths[i], type: WidthType.PERCENTAGE } : undefined,
          shading: { type: ShadingType.CLEAR, fill: COLOR_PRIMARY },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_PRIMARY },
            bottom: { style: BorderStyle.SINGLE, size: 8, color: COLOR_PRIMARY },
            left: { style: BorderStyle.SINGLE, size: 4, color: COLOR_PRIMARY },
            right: { style: BorderStyle.SINGLE, size: 4, color: COLOR_PRIMARY },
          },
          margins: { top: 120, bottom: 120, left: 140, right: 140 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: h,
                  bold: true,
                  size: 21,
                  color: COLOR_WHITE,
                  font: 'Arial',
                }),
              ],
            }),
          ],
        });
      }),
    }),
    ...rowsData.map((row, rIndex) => {
      const isEven = rIndex % 2 === 1;
      return new TableRow({
        children: row.map((cellText, cIndex) => {
          return new TableCell({
            width: colWidths[cIndex] ? { size: colWidths[cIndex], type: WidthType.PERCENTAGE } : undefined,
            shading: { type: ShadingType.CLEAR, fill: isEven ? COLOR_BG_LIGHT : COLOR_WHITE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
              left: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
              right: { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER },
            },
            margins: { top: 100, bottom: 100, left: 140, right: 140 },
            children: [
              new Paragraph({
                alignment: cIndex === 0 || cIndex === row.length - 1 ? AlignmentType.LEFT : AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: cellText,
                    size: 20,
                    color: COLOR_TEXT,
                    font: 'Arial',
                  }),
                ],
              }),
            ],
          });
        }),
      });
    }),
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });
}

async function generate() {
  const doc = new Document({
    creator: 'ACM System Engineering Team',
    title: 'Tài Liệu Bàn Giao Hệ Thống ACM QLLK',
    description: 'Tài liệu hướng dẫn vận hành, quản trị tài khoản và chuyển giao công nghệ hệ thống quản lý linh kiện phòng Lab Robotics & AI',
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch = 1440 twips
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'ACM SYSTEM — TÀI LIỆU BÀN GIAO & VẬN HÀNH HỆ THỐNG',
                    size: 16,
                    color: COLOR_MUTED,
                    font: 'Arial',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Trang ',
                    size: 18,
                    color: COLOR_MUTED,
                    font: 'Arial',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    color: COLOR_MUTED,
                    font: 'Arial',
                  }),
                  new TextRun({
                    text: ' / ',
                    size: 18,
                    color: COLOR_MUTED,
                    font: 'Arial',
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 18,
                    color: COLOR_MUTED,
                    font: 'Arial',
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          // ==================== TRANG BÌA ====================
          createTitle('TÀI LIỆU BÀN GIAO & HƯỚNG DẪN VẬN HÀNH HỆ THỐNG'),
          createSubtitle('HỆ THỐNG QUẢN LÝ KHO LINH KIỆN & THỰC HÀNH LAB ROBOTICS & AI (ACM SYSTEM)'),

          createCallout(
            'THÔNG TIN SẢN PHẨM & TRUY CẬP TRỰC TUYẾN',
            '• Đường dẫn ứng dụng (Production Live URL): https://acm-flax-beta.vercel.app\n• Nền tảng hạ tầng: Vercel Cloud (Frontend) + Supabase Cloud PostgreSQL (Singapore Region - ap-southeast-1)\n• Phiên bản nghiệm thu: Release Version 2.0 (Tháng 11/2026)\n• Đơn vị thụ hưởng: Bộ môn / Trung tâm Robotics & Trí tuệ Nhân tạo Lab',
            'info'
          ),

          new Paragraph({ spacing: { before: 240 } }),

          // ==================== PHẦN 1 ====================
          createHeading1('1. TỔNG QUAN HỆ THỐNG & KIẾN TRÚC KỸ THUẬT'),
          createParagraph(
            'Hệ thống Quản lý Kho Linh kiện & Phòng Lab Robotics (ACM System) là giải pháp phần mềm chuyên dụng được thiết kế nhằm số hóa toàn diện quy trình kiểm kê, xuất nhập tồn, phân bổ bộ kit thực hành và quy trình mượn - trả linh kiện ứng dụng trí tuệ nhân tạo (Camera AI Scan & Live Proof).'
          ),
          createHeading2('1.1. Kiến trúc Công nghệ Monorepo'),
          createBullet('Giao diện người dùng (Frontend): React 18, TypeScript, Tailwind CSS, Vite, Lucide Icons, Headless UI, HTML5 Canvas/MediaStream cho Camera AI.', '• Frontend:'),
          createBullet('Máy chủ dịch vụ (Backend API): Node.js, Express.js, TypeScript, Prisma ORM, JSON Web Token (JWT), BCrypt Password Hashing, Zod Data Validation.', '• Backend:'),
          createBullet('Cơ sở dữ liệu (Database): PostgreSQL 15 lưu trữ trên Supabase Cloud với đầy đủ ràng buộc khóa ngoại, transaction an toàn (ACID), và cơ chế Audit Logging.', '• Database:'),
          createBullet('Nhận diện thông minh (Vision AI): Tích hợp camera thời gian thực phát hiện linh kiện, gắn dấu thời gian thực (Live Proof) để đối soát mượn trả.', '• AI Vision:'),

          // ==================== PHẦN 2 ====================
          createHeading1('2. DANH SÁCH TÀI KHOẢN HỆ THỐNG & PHÂN QUYỀN TRUY CẬP'),
          createParagraph(
            'Hệ thống áp dụng mô hình phân quyền bảo mật theo vai trò (Role-Based Access Control - RBAC) nghiêm ngặt gồm 4 cấp độ người dùng. Dưới đây là danh sách các tài khoản tiêu chuẩn được thiết lập sẵn trên hệ thống:'
          ),

          createTable(
            ['Tên tài khoản', 'Email đăng nhập', 'Mật khẩu mặc định', 'Vai trò (Role)', 'Phạm vi & Quyền hạn'],
            [
              [
                'Quản trị viên Hệ thống (System Admin)',
                'admin@acm.local',
                'ACM@dev2026!',
                'ADMIN',
                'Toàn quyền cao nhất: Quản lý người dùng, phân quyền, cấu hình hệ thống, xóa dữ liệu, xem toàn bộ nhật ký kiểm toán (Audit Logs), duyệt và xóa mọi giao dịch.'
              ],
              [
                'Quản lý Phòng Lab / Thủ kho',
                'manager@acm.local',
                'ACM@dev2026!',
                'LAB_MANAGER',
                'Quản lý kho hàng: Tạo và duyệt phiếu nhập kho, xuất kho, điều chuyển, quản lý danh mục linh kiện, tạo hộp kit, duyệt yêu cầu mượn trả của sinh viên, xem báo cáo thống kê.'
              ],
              [
                'Kỹ thuật viên / Trợ giảng Lab',
                'tech@acm.local',
                'ACM@dev2026!',
                'TECHNICIAN',
                'Tác nghiệp thực tế tại phòng Lab: Bàn giao linh kiện, quét Camera AI nhận diện trả hàng, lắp ráp và bảo trì hộp kit, kiểm đếm số lượng tồn kho thực tế.'
              ],
              [
                'Sinh viên / Người mượn',
                'student@acm.local',
                'ACM@dev2026!',
                'STUDENT',
                'Tra cứu danh mục linh kiện, kiểm tra số lượng tồn khả dụng, tạo phiếu đăng ký mượn linh kiện/kit thực hành, theo dõi trạng thái phiếu mượn cá nhân.'
              ]
            ],
            [22, 22, 16, 15, 25]
          ),

          new Paragraph({ spacing: { before: 140 } }),
          createCallout(
            'LƯU Ý BẢO MẬT TÀI KHOẢN QUẢN TRỊ',
            'Sau khi tiếp nhận bàn giao, Quản trị viên phòng Lab bắt buộc phải đăng nhập vào tài khoản admin@acm.local và thay đổi mật khẩu mặc định tại mục Cài đặt hệ thống để đảm bảo an toàn.',
            'warn'
          ),

          // ==================== PHẦN 3 ====================
          createHeading1('3. HƯỚNG DẪN VẬN HÀNH CÁC PHÂN HỆ NGHIỆP VỤ'),

          createHeading2('3.1. Phân hệ Quản lý Kho & Vị trí Lưu trữ (Locations)'),
          createParagraph(
            'Cơ sở dữ liệu quản lý vị trí kho theo cấu trúc phân cấp đa tầng (Tree Structure) gồm 3 cấp bậc:'
          ),
          createBullet('Kho trung tâm / Phòng Lab tổng (ví dụ: WH-MAIN - Kho Trung tâm AI Robotic Lab).', '• Cấp 1 - WAREHOUSE:'),
          createBullet('Kệ để linh kiện hoặc Tủ thiết bị (ví dụ: RACK-A - Kệ A, RACK-B - Kệ B).', '• Cấp 2 - RACK:'),
          createBullet('Ngăn tủ, Hộp khay nhỏ (ví dụ: BIN-A1 - Ngăn Vi điều khiển, BIN-A2 - Ngăn Cảm biến).', '• Cấp 3 - BIN:'),
          createParagraph(
            'Mỗi linh kiện khi lưu trữ trong hệ thống đều được liên kết chính xác với một vị trí cụ thể. Phần mềm cho phép chuyển đổi trạng thái Hoạt động / Tạm khóa của vị trí kho khi cần sửa chữa.'
          ),

          createHeading2('3.2. Phân hệ Quản lý Danh mục & Linh kiện (Items & Categories)'),
          createBullet('Mã SKU chuẩn quốc tế / quy ước phòng Lab (ví dụ: MAIN-02, ESP32-WROOM-32, SEN-IR, MOT-SERVO-01).', '• Mã định danh (Code/SKU):'),
          createBullet('Tên linh kiện rõ ràng bằng tiếng Việt hoặc tiếng Anh chuẩn kỹ thuật.', '• Tên linh kiện:'),
          createBullet('Phân loại danh mục: Bo mạch chính, Cảm biến, Động cơ, Khớp nối & Khung vỏ, Cáp kết nối, Linh kiện thụ động...', '• Danh mục:'),
          createBullet('Đơn vị tính: Cái, Bộ, Con, Mét, Cuộn, Gói...', '• Đơn vị tính (Unit):'),
          createBullet('Hình thức quản lý: Tài sản cố định (TRACKED_ASSET - quản lý mượn trả) hoặc Vật tư tiêu hao (CONSUMABLE - xuất dùng một lần).', '• Phân loại tài sản:'),
          createBullet('Định mức tồn tối thiểu (Min Stock Alert): Khi số lượng tồn thực tế nhỏ hơn định mức này, hệ thống sẽ tự động bật cảnh báo sắp hết hàng lên bảng điều khiển.', '• Định mức an toàn:'),

          createHeading2('3.3. Phân hệ Quản lý Giao dịch Kho (Stock In / Out / Transfer / Adjustment)'),
          createParagraph(
            'Mọi biến động về số lượng trong kho đều phải thông qua giao dịch có mã chứng từ và ghi vết người thực hiện:'
          ),
          createBullet('Nhập kho (Stock In): Ghi nhận nhập mua mới, tài trợ hoặc bàn giao thêm thiết bị. Cung cấp tính năng thêm nhanh toàn bộ linh kiện của một danh mục chỉ với một click.', '• Nhập kho:'),
          createBullet('Xuất kho (Stock Out): Ghi nhận xuất tiêu hao, cấp phát cho dự án hoặc thanh lý linh kiện hỏng.', '• Xuất kho:'),
          createBullet('Điều chuyển kho (Transfer): Di chuyển linh kiện từ vị trí kho này sang vị trí kho khác (ví dụ: từ Kệ dự trữ sang Bàn thực hành Lab).', '• Chuyển kho:'),
          createBullet('Kiểm kê điều chỉnh (Adjustment): Đối soát số lượng thực tế tại phòng Lab so với sổ sách, bù trừ số liệu và bắt buộc nhập lý do chênh lệch.', '• Kiểm kê:'),

          createHeading2('3.4. Phân hệ Hộp Kit Thực hành (Practice Kits)'),
          createParagraph(
            'Hộp Kit là giải pháp đóng gói chuyên biệt cho các bài thí nghiệm, đồ án môn học hoặc cuộc thi Robotics (ví dụ: Bộ Kit Robot AI Fantasy Zoo, Xe Robot Dò Line, Kit IoT ESP32):'
          ),
          createBullet('Tạo Hộp Kit mới: Nhập Tên kit, hệ thống tự động sinh Mã kit ngắn gọn theo tên (ví dụ: "AI FANTASY ZOO - Chủ đề 1" -> mã "KIT-AFZ-01").', '• Tạo mới Kit:'),
          createBullet('Cơ chế KitAllocated: Khi đóng hộp kit, số lượng linh kiện thành phần sẽ được trừ khỏi "Tồn kho khả dụng" và chuyển sang trạng thái "Phân bổ trong Kit" tại đúng vị trí kho đã chọn.', '• Phân bổ linh kiện:'),
          createBullet('Kiểm tra tồn kho thời gian thực: Ngay khi chọn vị trí lưu kho, bảng linh kiện sẽ kiểm tra số lượng tồn thực tế. Nếu đủ hàng sẽ báo xanh lá (Còn X cái ✓), nếu thiếu sẽ báo vàng/đỏ cảnh báo ngay.', '• Cảnh báo tồn:'),
          createBullet('Bộ chọn linh kiện thông minh: Gom nhóm linh kiện theo từng danh mục chuẩn (optgroup), hỗ trợ nút bấm thêm nhanh theo danh mục và nút "+ Thêm dòng linh kiện mới" tiện lợi.', '• Thao tác nhanh:'),
          createBullet('Vòng đời hộp Kit: Sẵn sàng (AVAILABLE) -> Đang phân bổ (ALLOCATED) -> Bảo trì kiểm tra (MAINTENANCE) -> Rã kit (RETIRED). Khi rã kit, toàn bộ linh kiện tự động hoàn trả về kho.', '• Vòng đời kit:'),

          createHeading2('3.5. Quy trình Mượn & Trả Linh Kiện (Borrow & Return Workflow)'),
          createParagraph(
            'Quy trình mượn trả được kiểm soát chặt chẽ qua 4 bước nghiệp vụ an toàn:'
          ),
          createBullet('Bước 1 - Tạo phiếu mượn: Sinh viên chọn mục đích mượn (Thực hành môn học, Nghiên cứu/Đồ án, Thi đấu Robotics, Hoạt động CLB...), chọn ngày hẹn mượn - ngày hẹn trả và danh sách linh kiện cần mượn. Trạng thái phiếu: PENDING (Chờ duyệt).', '• 1. Đăng ký mượn:'),
          createBullet('Bước 2 - Phê duyệt: Quản lý Lab hoặc Admin kiểm tra tồn kho khả dụng và nhấn Phê duyệt (APPROVED).', '• 2. Phê duyệt:'),
          createBullet('Bước 3 - Bàn giao thiết bị: Kỹ thuật viên xuất giao linh kiện, chuyển trạng thái sang HANDED_OVER. Hỗ trợ kích hoạt Camera chụp ảnh trực tiếp khuôn mặt/linh kiện bàn giao (Live Proof Verification) chống giả mạo.', '• 3. Bàn giao:'),
          createBullet('Bước 4 - Hoàn trả thông minh qua Camera AI: Khi sinh viên trả đồ, kỹ thuật viên mở modal "Nhận hoàn trả qua Camera AI". Camera nhận diện trực tiếp linh kiện, tính toán số lượng thực nhận, kiểm tra tình trạng (Tốt/Hỏng) và tự động cộng hoàn tồn kho vào đúng vị trí lưu trữ.', '• 4. Hoàn trả AI:'),

          createHeading2('3.6. Hệ thống Chuông Thông báo & Nhật ký Kiểm toán (Audit Logs)'),
          createBullet('Chuông Thông báo Hệ thống: Nằm ở góc trên thanh điều hướng, tự động kiểm tra và thông báo các sự kiện quan trọng (phiếu mượn mới cần duyệt, phiếu quá hạn trả, cảnh báo linh kiện chạm mức tối thiểu, giao dịch kho mới hoàn tất).', '• Chuông thông báo:'),
          createBullet('Nhật ký Kiểm toán (Audit Logs): Ghi nhận toàn bộ vết lịch sử: Ai thực hiện (User ID/Email), Thao tác gì (CREATE/UPDATE/DELETE/STATUS_CHANGE), Bảng dữ liệu nào, Thời gian chính xác đến từng mili-giây và dữ liệu trước/sau thay đổi.', '• Nhật ký kiểm toán:'),

          // ==================== PHẦN 4 ====================
          createHeading1('4. HƯỚNG DẪN KỸ THUẬT, BẢO TRÌ & SAO LƯU DỮ LIỆU'),
          createHeading2('4.1. Cấu hình Biến môi trường (.env)'),
          createParagraph(
            'Hệ thống yêu cầu các biến môi trường cấu hình tại file apps/api/.env và apps/web/.env:'
          ),
          createBullet('DATABASE_URL: Chuỗi kết nối PostgreSQL Supabase (chế độ Transaction Pooling port 6543 hoặc Session Pooling port 5432).', '• Database URL:'),
          createBullet('JWT_SECRET: Khóa bí mật ký xác thực JWT token của người dùng.', '• JWT Secret:'),
          createBullet('PORT: Cổng lắng nghe của máy chủ API (mặc định: 3000 hoặc biến môi trường cloud).', '• Port:'),
          createBullet('VITE_API_BASE_URL: Địa chỉ endpoint của backend API để ứng dụng web kết nối.', '• Web API URL:'),

          createHeading2('4.2. Các Lệnh Điều Hành Hệ Thống (CLI Scripts)'),
          createBullet('npm run dev: Khởi chạy môi trường phát triển đồng thời cả Backend API và Frontend Web.', '• Chạy dev:'),
          createBullet('npm run build: Biên dịch kiểm tra TypeScript và đóng gói mã nguồn phân phối.', '• Đóng gói:'),
          createBullet('npm run test: Chạy toàn bộ 435+ bài kiểm thử tự động (Unit test, Integration test, Security test).', '• Kiểm thử:'),
          createBullet('npm run typecheck: Kiểm tra nghiêm ngặt kiểu dữ liệu TypeScript trên toàn bộ Monorepo.', '• Soát lỗi type:'),

          createHeading2('4.3. Kế hoạch Sao lưu & Khôi phục Thảm họa (Backup & Disaster Recovery)'),
          createBullet('Sao lưu tự động hàng ngày (Daily Automated Backup): Cơ sở dữ liệu Supabase được sao lưu tự động hàng ngày và lưu trữ tối thiểu 7 ngày gần nhất.', '• Auto Backup:'),
          createBullet('Sao lưu thủ công trước các đợt kiểm kê lớn: Quản trị viên sử dụng công cụ pg_dump để xuất file sao lưu định kỳ (ví dụ: pg_dump -d [DATABASE_URL] -F c -b -v -f "acm_backup.dump").', '• Manual Backup:'),
          createBullet('Khôi phục thảm họa (Disaster Recovery): Khi xảy ra sự cố phần cứng, cơ sở dữ liệu có thể khôi phục lại điểm thời gian gần nhất (Point-In-Time Recovery) trong vòng dưới 15 phút.', '• Khôi phục:'),

          // ==================== PHẦN 5 ====================
          createHeading1('5. BIÊN BẢN NGHIỆM THU & BÀN GIAO'),
          createParagraph(
            'Hôm nay, ngày ... tháng ... năm 2026, tại Phòng Lab Robotics & AI, hai bên tiến hành lập biên bản bàn giao và nghiệm thu hệ thống phần mềm ACM System với các nội dung đã được xác nhận như sau:'
          ),

          createTable(
            ['STT', 'Hạng mục bàn giao', 'Trạng thái nghiệm thu', 'Ghi chú'],
            [
              ['1', 'Mã nguồn toàn bộ hệ thống (Monorepo GitHub)', 'Đạt 100%', 'Đã chuyển giao quyền Admin repo'],
              ['2', 'Cơ sở dữ liệu đám mây Supabase PostgreSQL', 'Hoạt động ổn định', 'Đã seed dữ liệu mẫu & cấu hình index'],
              ['3', 'Ứng dụng Web trực tuyến Vercel Cloud', 'Hoạt động ổn định', 'Đã cấu hình CI/CD tự động deploy'],
              ['4', 'Tài khoản Quản trị viên và Kỹ thuật viên Lab', 'Đã bàn giao đầy đủ', 'Đã cấp mật khẩu bảo mật'],
              ['5', 'Tài liệu hướng dẫn sử dụng & vận hành', 'Đầy đủ, chi tiết', 'File Word .docx chuẩn hóa'],
              ['6', 'Bộ kiểm thử tự động (435/435 Tests)', 'Đạt 100% Passed', 'Bảo đảm an toàn giao dịch Idempotency']
            ],
            [8, 42, 25, 25]
          ),

          new Paragraph({ spacing: { before: 260 } }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                      top: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE },
                      left: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                    },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: 'ĐẠI DIỆN BÊN GIAO', bold: true, size: 22, color: COLOR_PRIMARY, font: 'Arial' }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 600 },
                        children: [
                          new TextRun({ text: '(Ký, ghi rõ họ tên)', italics: true, size: 18, color: COLOR_MUTED, font: 'Arial' }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: 'Đội ngũ Kỹ thuật Phát triển ACM System', bold: true, size: 20, font: 'Arial' }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    borders: {
                      top: { style: BorderStyle.NONE },
                      bottom: { style: BorderStyle.NONE },
                      left: { style: BorderStyle.NONE },
                      right: { style: BorderStyle.NONE },
                    },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: 'ĐẠI DIỆN BÊN NHẬN', bold: true, size: 22, color: COLOR_PRIMARY, font: 'Arial' }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 600 },
                        children: [
                          new TextRun({ text: '(Ký, ghi rõ họ tên)', italics: true, size: 18, color: COLOR_MUTED, font: 'Arial' }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: 'Ban Quản lý Phòng Lab Robotics & AI', bold: true, size: 20, font: 'Arial' }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.resolve('d:/ACM_QLLK', 'TAI_LIEU_BAN_GIAO_HE_THONG_ACM_QLLK.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log('✅ File docx đã được tạo thành công tại:', outputPath);
}

generate().catch((err) => {
  console.error('❌ Lỗi tạo file docx:', err);
  process.exit(1);
});

