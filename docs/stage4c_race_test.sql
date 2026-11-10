\set VERBOSITY verbose

-- Test A: G04 2-Session Race (Kỳ vọng lỗi 23505 vi phạm idx_borrow_return_op_single_pending)
\echo '=== TEST RACE: Ghi đúp PREPARED trên cùng borrow_request_id ==='
INSERT INTO borrow_return_operations (
  id, borrow_request_id, state, physical_evidence_ref, received_by_id
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '6c39a348-d42a-406b-bd69-fea42e400001',
  'PREPARED',
  'EVID-TEST-001',
  'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
);

-- Test B: G03 Case-Insensitive Unique (Kỳ vọng lỗi 23505 vi phạm lower(physical_evidence_ref))
\echo '=== TEST BIZ-01 UNIQUE: Thử trùng mã chữ thường evid-test-002 ==='
INSERT INTO borrow_return_operations (
  id, borrow_request_id, state, physical_evidence_ref, received_by_id
) VALUES (
  '44444444-4444-4444-4444-444444444444',
  '6c39a348-d42a-406b-bd69-fea42e400001',
  'CANCELLED',
  'evid-test-002',
  'c1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c'
);