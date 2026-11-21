import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const memoryWebStore = new Map<string, string>();
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function isNativeSecureStoreAvailable(): boolean {
  return Platform.OS !== "web";
}

export async function getSecureToken(key: string): Promise<string | null> {
  if (!isNativeSecureStoreAvailable()) {
    await AsyncStorage.removeItem(key).catch(() => {});
    return memoryWebStore.get(key) ?? null;
  }

  const secureValue = await SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS);
  if (secureValue) {
    // Clean up any leftover legacy plaintext AsyncStorage entry if still present
    await AsyncStorage.removeItem(key).catch(() => {});
    return secureValue;
  }

  // One-time migration from legacy AsyncStorage to SecureStore
  const legacyValue = await AsyncStorage.getItem(key).catch(() => null);
  if (legacyValue) {
    await SecureStore.setItemAsync(key, legacyValue, KEYCHAIN_OPTIONS);
    await AsyncStorage.removeItem(key).catch(() => {});
    return legacyValue;
  }

  return null;
}

export async function setSecureToken(key: string, value: string): Promise<void> {
  await AsyncStorage.removeItem(key).catch(() => {});
  if (!isNativeSecureStoreAvailable()) {
    memoryWebStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS);
}

export async function deleteSecureToken(key: string): Promise<void> {
  memoryWebStore.delete(key);
  await AsyncStorage.removeItem(key).catch(() => {});
  if (isNativeSecureStoreAvailable()) {
    await SecureStore.deleteItemAsync(key, KEYCHAIN_OPTIONS).catch(() => {});
  }
}

export async function clearSecureTokens(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => deleteSecureToken(key)));
}
