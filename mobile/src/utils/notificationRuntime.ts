import Constants, {
  ExecutionEnvironment,
} from "expo-constants";
import { Platform } from "react-native";

export const supportsRemotePushNotifications = (): boolean =>
  (Platform.OS === "android" || Platform.OS === "ios") &&
  Constants.executionEnvironment !==
    ExecutionEnvironment.StoreClient;
