import {
  focusManager,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { queryClient } from "./queryClient";

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    const subscription = AppState.addEventListener(
      "change",
      (status) => {
        focusManager.setFocused(status === "active");
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
