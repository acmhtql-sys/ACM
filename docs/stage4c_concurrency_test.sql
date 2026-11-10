\set VERBOSITY verbose

-- 1. Phiên thứ nhất (Session 1): Tạo thao tác trả đồ ở trạng thái PREPARED với JSONB snapshot bền vững
\echo '=== 1. Test Session 1 (PREPARED hợp lệ có payload snapshot) ==='
INSERT INTO borrow_return_operations (
  id, borrow_request_id, state, physical_evidence_ref, received_by_id, payload_hash, payload_snapshot
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '6c39a348-d42a-406b-bd69-fea42e400001',
  'PREPARED',
  'EVID-TEST-001',
  'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  '{"items":[{"borrowDetailId":"d1111111-1111-1111-1111-111111111111","returnedQuantity":2,"condition":"GOOD","locationId":"l1111111-1111-1111-1111-111111111111","sourceLocationId":"l1111111-1111-1111-1111-111111111111","notes":null}],"notes":null}'::jsonb
);

-- Đăng ký chứng từ vào system_evidence_registry toàn hệ thống (P1.5)
INSERT INTO system_evidence_registry (
  normalized_ref, original_ref, source_type, source_id
) VALUES (
  lower('EVID-TEST-001'), 'EVID-TEST-001', 'STAGE4C_RETURN', '11111111-1111-1111-1111-111111111111'
);

-- 2. Phiên thứ hai (Session 2 / 2-Session Race): Cố tình ghi đúp PREPARED trên cùng 1 phiếu mượn
\echo '=== 2. Test Session 2 Race Condition (Kỳ vọng lỗi 23505) ==='
INSERT INTO borrow_return_operations (
  id, borrow_request_id, state, physical_evidence_ref, received_by_id
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '6c39a348-d42a-406b-bd69-fea42e400001',
  'PREPARED',
  'EVID-TEST-002',
  'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
);

-- 3. Kiểm tra mã chứng từ BIZ-01 chứa ký tự cấm (@, !)
\echo '=== 3. Test Regex BIZ-01 Ký tự cấm (Kỳ vọng lỗi 23514) ==='
INSERT INTO borrow_return_operations (
  id, borrow_request_id, state, physical_evidence_ref, received_by_id
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  gen_random_uuid(),
  'PREPARED',
  'EVID@INVALID!',
  'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
);

-- 4. Kiểm tra đụng độ mã không phân biệt hoa thường (lower(ref)) trong borrow_return_operations
\echo '=== 4. Test Case-Insensitive Unique (Kỳ vọng lỗi 23505) ==='
INSERT INTO borrow_return_operations (
  id, borrow_request_id, state, physical_evidence_ref, received_by_id
) VALUES (
  '44444444-4444-4444-4444-444444444444',
  gen_random_uuid(),
  'CANCELLED',
  'evid-test-001',
  'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
);

-- 5. Kiểm tra ràng buộc thời gian (verified_at < received_at)
\echo '=== 5. Test Time Invariant (Kỳ vọng lỗi 23514) ==='
INSERT INTO borrow_return_operations (
  id, borrow_request_id, state, physical_evidence_ref, received_by_id, received_at, verified_at
) VALUES (
  '55555555-5555-5555-5555-555555555555',
  gen_random_uuid(),
  'CANCELLED',
  'EVID-TEST-005',
  'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c',
  '2026-11-09 10:00:00+07',
  '2026-11-09 09:00:00+07'
);

-- 6. Kiểm tra đụng độ đăng ký chứng từ trong system_evidence_registry (P1.5)
\echo '=== 6. Test System Evidence Registry Unique (Kỳ vọng lỗi 23505) ==='
INSERT INTO system_evidence_registry (
  normalized_ref, original_ref, source_type, source_id
) VALUES (
  lower('evid-test-001'), 'evid-test-001', 'RC5_RETURN', gen_random_uuid()
);
