export interface TherapistResponse {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
}

export interface TherapistListItem extends TherapistResponse {
  todayScheduleCount: number;
}

export interface CreateTherapistPayload {
  username: string;
  email: string;
  password: string;
  role: "therapist";
  is_active: boolean;
}

export interface UpdateTherapistPayload {
  username: string;
  email: string;
  is_active: boolean;
  password?: string;
}
