-- Insert default admin user (password is hashed in production, but for demo we'll use plain text)
-- Default admin: admin / Admin@123
INSERT INTO system_users (username, password, full_name, email, role, is_active)
VALUES ('admin', 'Admin@123', 'ผู้ดูแลระบบ', 'admin@hotel.com', 'admin', 1);
