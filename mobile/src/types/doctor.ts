export interface Doctor {
  id: number;
  user_id: number;
  name: string;
  specialization: string | null;
  phone: string | null;
  email?: string | null;
  registration_number?: string | null;
  active: boolean;
  created_at: string;
}

export interface CreateDoctorUserRequest {
  username: string;
  email: string;
  password: string;
}

export interface CreateDoctorRequest {
  user_id: number;
  name: string;
  specialization?: string | null;
  phone?: string | null;
}

export interface CreateDoctorWithLoginRequest {
  username: string;
  email: string;
  password: string;
  name: string;
  specialization?: string | null;
  phone?: string | null;
}

export interface UpdateDoctorRequest {
  user_id: number;
  name: string;
  email?: string | null;
  password?: string;
  specialization?: string | null;
  phone?: string | null;
  active: boolean;
  deactivation_reason?: string | null;
  override_request_id?: number | null;
}
