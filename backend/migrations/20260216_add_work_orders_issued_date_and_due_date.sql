ALTER TABLE work_orders
  ADD COLUMN issued_date DATE NULL AFTER status,
  ADD COLUMN due_date DATE NULL AFTER issued_date;
