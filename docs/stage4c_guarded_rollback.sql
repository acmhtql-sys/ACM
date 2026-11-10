DO $$
DECLARE
  v_completed_count INT := 0;
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'borrow_return_operations') THEN
    SELECT COUNT(*) INTO v_completed_count
    FROM borrow_return_operations
    WHERE state = 'COMPLETED';

    IF v_completed_count > 0 THEN
      RAISE EXCEPTION 'ROLLBACK ABORTED: Đã tồn tại % giao dịch COMPLETED, cấm rollback!', v_completed_count;
    END IF;

    DROP INDEX IF EXISTS idx_borrow_return_op_single_pending;
    DROP INDEX IF EXISTS idx_borrow_return_op_evidence_lower;
    DROP TABLE IF EXISTS borrow_return_operations;
    RAISE NOTICE 'GUARDED ROLLBACK SUCCESS: Đã hoàn nguyên an toàn bảng borrow_return_operations.';
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'borrow_return_source_allocations') THEN
    DROP INDEX IF EXISTS idx_br_source_alloc_lookup;
    DROP TABLE IF EXISTS borrow_return_source_allocations;
    RAISE NOTICE 'GUARDED ROLLBACK SUCCESS: Đã hoàn nguyên an toàn bảng borrow_return_source_allocations.';
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'system_evidence_registry') THEN
    DROP INDEX IF EXISTS idx_system_evidence_registry_source;
    DROP TABLE IF EXISTS system_evidence_registry;
    RAISE NOTICE 'GUARDED ROLLBACK SUCCESS: Đã hoàn nguyên an toàn bảng system_evidence_registry.';
  END IF;
END $$;
