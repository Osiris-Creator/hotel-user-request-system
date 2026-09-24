-- Insert default programs
INSERT OR IGNORE INTO programs (name, description) VALUES
  ('Opera Cloud', 'Property Management System'),
  ('POS Infrasys cloud', 'Point of Sale System'),
  ('Message Box', 'Internal Communication System'),
  ('Visionline Key Card', 'Key Card Management System'),
  ('Okkami', 'Okkami System'),
  ('Oracle Fusion Cloud', 'Oracle Fusion Cloud ERP');

-- Insert roles for Opera Cloud (program_id = 1)
INSERT OR IGNORE INTO roles (program_id, role_name) VALUES
  (1, 'Admin'),
  (1, 'Front Desk'),
  (1, 'Reservation'),
  (1, 'Housekeeping'),
  (1, 'Cashier'),
  (1, 'Report Viewer');

-- Insert roles for POS Infrasys cloud (program_id = 2)
INSERT OR IGNORE INTO roles (program_id, role_name) VALUES
  (2, 'Admin'),
  (2, 'Manager'),
  (2, 'Cashier'),
  (2, 'Server'),
  (2, 'Report Viewer');

-- Insert roles for Message Box (program_id = 3)
INSERT OR IGNORE INTO roles (program_id, role_name) VALUES
  (3, 'Admin'),
  (3, 'User'),
  (3, 'Manager');

-- Insert roles for Visionline Key Card (program_id = 4)
INSERT OR IGNORE INTO roles (program_id, role_name) VALUES
  (4, 'Admin'),
  (4, 'Front Desk'),
  (4, 'Security'),
  (4, 'Engineer');

-- Insert roles for Okkami (program_id = 5)
INSERT OR IGNORE INTO roles (program_id, role_name) VALUES
  (5, 'Admin'),
  (5, 'User'),
  (5, 'Manager');

-- Insert roles for Oracle Fusion Cloud (program_id = 6)
INSERT OR IGNORE INTO roles (program_id, role_name) VALUES
  (6, 'Admin'),
  (6, 'Finance'),
  (6, 'HR'),
  (6, 'Procurement'),
  (6, 'Report Viewer');
