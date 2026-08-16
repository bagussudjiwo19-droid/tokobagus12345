// ============================================================================
// PIN ADMIN untuk mengunci kios Cek Harga. Disimpan AMAN & TIDAK plaintext:
// hash = SHA-256(salt + pin). Di perangkat Android/iOS pakai expo-secure-store
// (Keystore/Keychain). Di web (preview) fallback AsyncStorage agar bisa diuji.
// ============================================================================
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const KEY = "miko_admin_pin_v1";
const isWeb = Platform.OS === "web";

async function setItem(v: string): Promise<void> {
  if (isWeb) return AsyncStorage.setItem(KEY, v);
  return SecureStore.setItemAsync(KEY, v);
}
async function getItem(): Promise<string | null> {
  if (isWeb) return AsyncStorage.getItem(KEY);
  return SecureStore.getItemAsync(KEY);
}

function randomSalt(): string {
  const bytes = Crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hash(salt: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export async function hasAdminPin(): Promise<boolean> {
  const raw = await getItem();
  return !!raw;
}

export async function setAdminPin(pin: string): Promise<void> {
  const salt = randomSalt();
  const h = await hash(salt, pin);
  await setItem(JSON.stringify({ salt, hash: h }));
}

export async function verifyAdminPin(pin: string): Promise<boolean> {
  const raw = await getItem();
  if (!raw) return false;
  try {
    const { salt, hash: h } = JSON.parse(raw);
    const test = await hash(salt, pin);
    return test === h;
  } catch {
    return false;
  }
}
