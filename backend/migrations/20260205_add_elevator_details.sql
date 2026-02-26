ALTER TABLE elevators
  -- ADD COLUMN serial_number VARCHAR(100) NULL AFTER label,
  ADD COLUMN control_group_type VARCHAR(100) NULL AFTER serial_number,
  ADD COLUMN cabin_door_type VARCHAR(100) NULL AFTER control_group_type,
  ADD COLUMN lock_type VARCHAR(100) NULL AFTER cabin_door_type,
  ADD COLUMN machine_room_key VARCHAR(100) NULL AFTER lock_type,
  ADD COLUMN comment TEXT NULL AFTER machine_room_key;
