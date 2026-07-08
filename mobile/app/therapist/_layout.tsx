import type { ErrorBoundaryProps } from "expo-router";

import TherapistTabsLayout, {
  ErrorBoundary as TherapistTabsErrorBoundary,
} from "../(tabs)/_layout";

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <TherapistTabsErrorBoundary {...props} />;
}

export default function TherapistLayout() {
  return <TherapistTabsLayout />;
}
