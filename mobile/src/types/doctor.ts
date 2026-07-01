export interface Doctor {
  id: number;
  name: string;
  specialization: string | null;
  phone: string | null;
  email?: string | null;
  registration_number?: string | null;
  active: boolean;
  created_at: string;
}

export interface CreateDoctorRequest {
  name: string;
  specialization?: string | null;
  phone?: string | null;
}

export interface UpdateDoctorRequest {
  name: string;
  specialization?: string | null;
  phone?: string | null;
  active: boolean;
}
