import { Platform } from "react-native";

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
