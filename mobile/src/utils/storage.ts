import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
  isUserRole,
  type AuthUser,
  type UserRole,
} from "../types/auth";

const ACCESS_TOKEN_KEY = "access_token";
const USER_INFO_KEY = "auth_user";
const USER_ROLE_KEY = "auth_role";
const WORKDAY_STATE_KEY = "active_workday";
const PUSH_TOKEN_KEY = "expo_push_token";
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible:
    SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface StoredWorkdayState {
  workdayId: number;
  startedAt: string;
  workDate: string;
}

const isSecureStorageAvailable = async (): Promise<boolean> =>
  Platform.OS !== "web" && SecureStore.isAvailableAsync();

export const saveToken = async (token: string): Promise<void> => {
  if (await isSecureStorageAvailable()) {
    await SecureStore.setItemAsync(
      ACCESS_TOKEN_KEY,
      token,
      SECURE_STORE_OPTIONS
    );
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
    return;
  }

  if (Platform.OS === "web") {
    await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
    return;
  }

  throw new Error(
    "Secure credential storage is unavailable on this device."
  );
};

export const getToken = async (): Promise<string | null> => {
  if (await isSecureStorageAvailable()) {
    const secureToken = await SecureStore.getItemAsync(
      ACCESS_TOKEN_KEY,
      SECURE_STORE_OPTIONS
    );

    if (secureToken) {
      return secureToken;
    }

    const legacyToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);

    if (!legacyToken) {
      return null;
    }

    try {
      await SecureStore.setItemAsync(
        ACCESS_TOKEN_KEY,
        legacyToken,
        SECURE_STORE_OPTIONS
      );
      await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
      return legacyToken;
    } catch {
      await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
      return null;
    }
  }

  return Platform.OS === "web"
    ? AsyncStorage.getItem(ACCESS_TOKEN_KEY)
    : null;
};

export const saveUserSession = async (user: AuthUser): Promise<void> => {
  await AsyncStorage.multiSet([
    [USER_INFO_KEY, JSON.stringify(user)],
    [USER_ROLE_KEY, user.role],
  ]);
};

export const getStoredRole = async (): Promise<UserRole | null> => {
  const role = await AsyncStorage.getItem(USER_ROLE_KEY);
  return isUserRole(role) ? role : null;
};

export const getStoredUser = async (): Promise<AuthUser | null> => {
  const value = await AsyncStorage.getItem(USER_INFO_KEY);

  if (!value) {
    return null;
  }

  try {
    const user: unknown = JSON.parse(value);

    if (
      typeof user === "object" &&
      user !== null &&
      "id" in user &&
      "username" in user &&
      "email" in user &&
      "role" in user &&
      "is_active" in user &&
      typeof user.id === "number" &&
      typeof user.username === "string" &&
      typeof user.email === "string" &&
      isUserRole(user.role) &&
      typeof user.is_active === "boolean"
    ) {
      return user as AuthUser;
    }
  } catch {
    // Invalid persisted user data is cleared below.
  }

  await AsyncStorage.multiRemove([USER_INFO_KEY, USER_ROLE_KEY]);
  return null;
};

export const clearAuthSession = async (): Promise<void> => {
  await AsyncStorage.multiRemove([
    ACCESS_TOKEN_KEY,
    USER_INFO_KEY,
    USER_ROLE_KEY,
    WORKDAY_STATE_KEY,
  ]);

  try {
    if (await isSecureStorageAvailable()) {
      await Promise.all([
        SecureStore.deleteItemAsync(
          ACCESS_TOKEN_KEY,
          SECURE_STORE_OPTIONS
        ),
        SecureStore.deleteItemAsync(
          PUSH_TOKEN_KEY,
          SECURE_STORE_OPTIONS
        ),
      ]);
    }
  } catch {
    // Secure credential cleanup must not prevent logout navigation.
  }
};

export const removeToken = async () => {
  await clearAuthSession();
};

export const saveWorkdayState = async (
  state: StoredWorkdayState
): Promise<void> => {
  await AsyncStorage.setItem(WORKDAY_STATE_KEY, JSON.stringify(state));
};

export const getWorkdayState =
  async (): Promise<StoredWorkdayState | null> => {
    const value = await AsyncStorage.getItem(WORKDAY_STATE_KEY);

    if (!value) {
      return null;
    }

    try {
      const state: unknown = JSON.parse(value);

      if (
        typeof state === "object" &&
        state !== null &&
        "workdayId" in state &&
        "startedAt" in state &&
        "workDate" in state &&
        typeof state.workdayId === "number" &&
        typeof state.startedAt === "string" &&
        typeof state.workDate === "string"
      ) {
        return state as StoredWorkdayState;
      }
    } catch {
      // Invalid local state is removed below.
    }

    await AsyncStorage.removeItem(WORKDAY_STATE_KEY);
    return null;
  };

export const removeWorkdayState = async (): Promise<void> => {
  await AsyncStorage.removeItem(WORKDAY_STATE_KEY);
};
