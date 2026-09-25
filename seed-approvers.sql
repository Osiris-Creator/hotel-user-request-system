-- Insert default approval settings
-- Level 1: Approver 1
-- Level 2: Approver 2
-- Level 3: Final notification email

INSERT OR IGNORE INTO approval_settings (approver_level, approver_name, approver_email, is_active) VALUES
  (1, 'Approver 1', 'approver1@avanisamui.com', 1),
  (2, 'Approver 2', 'approver2@avanisamui.com', 1),
  (3, 'Final Notification', 'it-admin@avanisamui.com', 1);
