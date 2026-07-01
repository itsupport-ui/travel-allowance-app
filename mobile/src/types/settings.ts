export interface AppSettings {
  id: number;
  per_km_rate: number;
  daily_allowance: number;
}

export interface UpdateSettingsRequest {
  per_km_rate: number;
  daily_allowance: number;
}
