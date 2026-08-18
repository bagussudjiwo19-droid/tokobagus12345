// Web/Expo Go: tidak ada key-event native. Input scanner ditangani oleh
// TextInput tersembunyi di layar Transaksi. Komponen ini sengaja no-op.
export default function HardwareScanner(_props: { enabled: boolean; onScan: (code: string) => void }) {
  return null;
}
