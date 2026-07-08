// `@expo/metro-runtime` must be the first import for Fast Refresh support.
import "@expo/metro-runtime";
import "expo/src/Expo.fx";

import { withErrorOverlay } from "@expo/metro-runtime/error-overlay";
import { App } from "expo-router/build/qualified-entry";
import * as SplashScreen from "expo-router/build/utils/splash";
import { AppRegistry, Platform } from "react-native";

const RootComponent =
  process.env.NODE_ENV !== "production" ? withErrorOverlay(App) : App;

setTimeout(() => {
  SplashScreen._internal_preventAutoHideAsync?.();
});

AppRegistry.registerComponent("main", () => RootComponent);

if (Platform.OS === "web" && typeof window !== "undefined") {
  const rootTag = document.getElementById("root");

  if (process.env.NODE_ENV !== "production" && !rootTag) {
    throw new Error(
      'Required HTML element with id "root" was not found in the document HTML.'
    );
  }

  AppRegistry.runApplication("main", {
    hydrate: globalThis.__EXPO_ROUTER_HYDRATE__,
    rootTag,
  });
}
