import { Platform, PermissionsAndroid } from "react-native";

// react-native-bluetooth-classic is a NATIVE module — unavailable in Expo Go / web.
// We guard the require so the app still boots in preview; real printing only
// works in a native build (Publish → generate build).
let RNBluetoothClassic: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  RNBluetoothClassic = require("react-native-bluetooth-classic").default;
} catch {
  RNBluetoothClassic = null;
}

export type BTDevice = { address: string; name: string };

export const NATIVE_ONLY_MSG =
  "Fitur printer Bluetooth hanya tersedia di aplikasi hasil build (bukan Expo Go/preview).";

export function isBluetoothAvailable(): boolean {
  return !!RNBluetoothClassic && Platform.OS !== "web";
}

// Minta izin Bluetooth/Location yang diperlukan Android (runtime).
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const apiLevel = Number(Platform.Version) || 0;
    const perms: string[] = [];
    if (apiLevel >= 31) {
      perms.push(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      );
    }
    // Android <= 11 (dan sebagian perangkat) butuh lokasi untuk discovery.
    perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    const res = await PermissionsAndroid.requestMultiple(perms as any);
    return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

async function ensureEnabled(): Promise<void> {
  const enabled = await RNBluetoothClassic.isBluetoothEnabled();
  if (!enabled) {
    try {
      await RNBluetoothClassic.requestBluetoothEnabled();
    } catch {
      throw new Error("Bluetooth belum aktif. Nyalakan Bluetooth HP Anda.");
    }
  }
}

// Cari perangkat Bluetooth di sekitar (discovery) + gabung dengan yang sudah dipasangkan.
export async function discoverPrinters(): Promise<BTDevice[]> {
  if (!isBluetoothAvailable()) throw new Error(NATIVE_ONLY_MSG);
  const ok = await requestBluetoothPermissions();
  if (!ok) {
    throw new Error("Izin Bluetooth/Lokasi ditolak. Aktifkan izin di Pengaturan HP untuk mencari perangkat.");
  }
  await ensureEnabled();
  const map = new Map<string, BTDevice>();
  try {
    const bonded = await RNBluetoothClassic.getBondedDevices();
    (bonded || []).forEach((d: any) => map.set(d.address, { address: d.address, name: d.name || d.address }));
  } catch { /* ignore */ }
  try {
    const found = await RNBluetoothClassic.startDiscovery();
    (found || []).forEach((d: any) => map.set(d.address, { address: d.address, name: d.name || d.address }));
  } catch { /* ignore discovery errors, tetap kembalikan bonded */ } finally {
    try { await RNBluetoothClassic.cancelDiscovery(); } catch { /* ignore */ }
  }
  return Array.from(map.values());
}

export async function listPairedPrinters(): Promise<BTDevice[]> {
  if (!isBluetoothAvailable()) throw new Error(NATIVE_ONLY_MSG);
  const enabled = await RNBluetoothClassic.isBluetoothEnabled();
  if (!enabled) {
    try {
      await RNBluetoothClassic.requestBluetoothEnabled();
    } catch {
      throw new Error("Bluetooth belum aktif. Nyalakan Bluetooth HP Anda.");
    }
  }
  const devices = await RNBluetoothClassic.getBondedDevices();
  return (devices || []).map((d: any) => ({ address: d.address, name: d.name || d.address }));
}

let connectedAddress: string | null = null;

export async function connectPrinter(address: string): Promise<void> {
  if (!isBluetoothAvailable()) throw new Error(NATIVE_ONLY_MSG);
  try {
    const already = await RNBluetoothClassic.getConnectedDevice(address).catch(() => null);
    if (!already) {
      await RNBluetoothClassic.connectToDevice(address, { delimiter: "\n" });
    }
    connectedAddress = address;
  } catch (e: any) {
    throw new Error(
      "Gagal terhubung ke printer. Pastikan printer menyala, dekat, dan sudah dipasangkan (paired) di Bluetooth HP.",
    );
  }
}

export async function printText(address: string, text: string): Promise<void> {
  if (!isBluetoothAvailable()) throw new Error(NATIVE_ONLY_MSG);
  if (connectedAddress !== address) {
    await connectPrinter(address);
  }
  try {
    await RNBluetoothClassic.writeToDevice(address, text, "ascii");
  } catch (e) {
    connectedAddress = null;
    throw new Error("Gagal mengirim data ke printer. Hubungkan ulang printer lalu coba cetak lagi.");
  }
}

export async function disconnectPrinter(address: string): Promise<void> {
  if (!isBluetoothAvailable()) return;
  try {
    await RNBluetoothClassic.disconnectFromDevice(address);
  } catch {}
  connectedAddress = null;
}
