export interface AdminDashboardSummary {
  total_therapists: number;
  total_doctors: number;
  total_clinical_staff: number;
  todays_schedules: number;
  todays_therapist_schedules: number;
  todays_doctor_visits: number;
  pending_claims: number;
  approved_claims: number;
  rejected_claims: number;
  completed_treatments: number;
  completed_therapist_treatments: number;
  completed_doctor_visits: number;
  missed_clinical_activities: number;
  todays_claims: number;
  open_follow_ups: number;
}
