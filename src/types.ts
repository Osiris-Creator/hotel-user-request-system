export interface Env {
  DB: D1Database;
  CORS_ORIGIN: string;
}

export interface UserRequest {
  id?: number;
  request_number: string;
  user_id: number;
  requester_name: string;
  requester_email: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  request_date?: string;
  approved_by?: string;
  approved_date?: string;
  completed_date?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id?: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  department?: string;
  position?: string;
}

export interface ProgramAccess {
  program_id: number;
  role_id: number;
}

export interface CreateRequestBody {
  user: User;
  requester: {
    name: string;
    email: string;
  };
  programAccess: ProgramAccess[];
  department_id?: number | null;
  notes?: string;
}

export interface AuditLog {
  id?: number;
  request_id?: number;
  action: string;
  changed_by: string;
  old_value?: string;
  new_value?: string;
  change_description: string;
  ip_address?: string;
  created_at?: string;
}
