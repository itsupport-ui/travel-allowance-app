export const radius = {
  none: 0,
  xs: 2,
  s3: 3,
  sm: 4,
  md: 6,
  control: 8,
  lg: 10,
  xl: 12,
  card: 14,
  panel: 16,
  largePanel: 20,
  rounded: 40,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;
