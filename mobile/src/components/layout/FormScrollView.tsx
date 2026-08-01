import { spacing } from "@/src/theme";
import { forwardRef } from "react";
import {
  Platform,
  StyleSheet,
  type ScrollView,
} from "react-native";
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller";

export type FormScrollViewProps = KeyboardAwareScrollViewProps;

export const FormScrollView = forwardRef<
  ScrollView,
  FormScrollViewProps
>(function FormScrollView(
  {
    bottomOffset = spacing.xl,
    keyboardDismissMode = Platform.OS === "ios"
      ? "interactive"
      : "on-drag",
    keyboardShouldPersistTaps = "handled",
    nestedScrollEnabled = true,
    style,
    ...props
  },
  ref
) {
  return (
    <KeyboardAwareScrollView
      {...props}
      ref={ref}
      bottomOffset={bottomOffset}
      keyboardDismissMode={keyboardDismissMode}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      nestedScrollEnabled={nestedScrollEnabled}
      style={[styles.scrollView, style]}
    />
  );
});

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
});
