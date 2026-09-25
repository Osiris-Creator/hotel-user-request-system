-- Insert default departments
INSERT OR IGNORE INTO departments (name, description) VALUES
  ('Front Office', 'Guest services and reception'),
  ('Housekeeping', 'Room cleaning and maintenance'),
  ('Food & Beverage', 'Restaurant and bar services'),
  ('Engineering', 'Technical maintenance'),
  ('Sales & Marketing', 'Sales and marketing team'),
  ('Accounting', 'Finance and accounting'),
  ('Human Resources', 'HR department'),
  ('IT', 'Information technology');

-- Insert default department heads (update with real names and emails)
INSERT OR IGNORE INTO department_heads (department_id, head_name, head_email) VALUES
  (1, 'Front Office Manager', 'fo-manager@avanisamui.com'),
  (2, 'Housekeeping Manager', 'hk-manager@avanisamui.com'),
  (3, 'F&B Manager', 'fb-manager@avanisamui.com'),
  (4, 'Chief Engineer', 'engineer@avanisamui.com'),
  (5, 'Sales Manager', 'sales-manager@avanisamui.com'),
  (6, 'Accounting Manager', 'accounting@avanisamui.com'),
  (7, 'HR Manager', 'hr-manager@avanisamui.com'),
  (8, 'IT Manager', 'it-manager@avanisamui.com');
