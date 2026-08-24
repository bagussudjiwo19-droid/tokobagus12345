# 📱 Build APK Android — KASIR TOKO BAGUS

Panduan build **APK Android native** dari aplikasi Expo/React Native ini,
**tanpa EAS / tanpa akun Expo / tanpa token**. Build dilakukan langsung dengan
**Gradle** (native Android), di komputer Anda sendiri (Windows / macOS / Linux
**x86_64/Intel/AMD** atau Mac Apple Silicon).

> Aplikasi ini TIDAK bisa di-build di server Emergent karena server tersebut
> ber-arsitektur **ARM64 (aarch64)**, sedangkan tool Android (`aapt2`) dan
> **NDK** dari Google hanya tersedia untuk **x86_64** → muncul error
> `cannot execute binary file: Exec format error`. Karena itu build harus
> dijalankan di komputer Anda.

---

## 0. Yang sudah SAYA siapkan (tidak perlu Anda ubah lagi)
- ✅ `app.json`: Application ID / package = **`com.tokobagus.kasir`**
- ✅ Semua permission Android sudah benar: Kamera, Bluetooth (scan/connect/admin),
  Media (foto), Rekam Audio, Storage, Internet.
- ✅ Icon & splash sudah terpasang (`assets/images/`).
- ✅ Dependency sudah diperbaiki (`expo-doctor`): `expo-asset` ditambah,
  versi `expo`/`expo-constants` diselaraskan.
- ✅ New Architecture aktif (wajib untuk Reanimated 4) — semua fitur dipertahankan.
- ✅ `EXPO_PUBLIC_BACKEND_URL` mengarah ke backend produksi Anda.

---

## 1. Prasyarat di komputer Anda (sekali saja)
1. **Node.js 20+** dan **Yarn** — https://nodejs.org
2. **JDK 17** (Temurin/Adoptium) — https://adoptium.net
3. **Android Studio** — https://developer.android.com/studio
   - Buka Android Studio → **More Actions → SDK Manager** → tab **SDK Platforms**:
     centang **Android 15 (API 35)**.
   - Tab **SDK Tools**: centang **Android SDK Build-Tools**, **Platform-Tools**,
     **NDK (Side by side)**, **CMake**. Klik Apply untuk mengunduh.
4. Set environment variable (biasanya otomatis oleh Android Studio):
   - `ANDROID_HOME` = lokasi SDK (mis. `C:\Users\<nama>\AppData\Local\Android\Sdk`
     atau `~/Library/Android/sdk` di macOS)

---

## 2. Ambil kode & pasang dependency
```bash
git clone https://github.com/bagussudjiwo19-droid/bagustoko123.git
cd bagustoko123/frontend
yarn install
```

Pastikan file `frontend/.env` berisi (buat bila belum ada):
```
EXPO_PUBLIC_BACKEND_URL=https://repo-preview-live-7.emergent.host
```

---

## 3. Generate project Android native
```bash
npx expo prebuild --platform android --clean
```
Ini membuat folder `android/` lengkap (sudah memakai package `com.tokobagus.kasir`
dan seluruh permission).

---

## 4A. Build APK untuk TESTING (cepat, langsung install)
APK "debug" sudah ter-tandatangan otomatis, bisa langsung dipasang di HP:
```bash
cd android
# Windows:
gradlew.bat assembleDebug
# macOS / Linux:
./gradlew assembleDebug
```
Hasil APK ada di:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

## 4B. Build APK RELEASE (untuk dibagikan/produksi)
1. Buat keystore (sekali saja):
```bash
keytool -genkeypair -v -keystore my-release-key.keystore \
  -alias tokobagus -keyalg RSA -keysize 2048 -validity 10000
```
2. Taruh `my-release-key.keystore` di folder `android/app/`.
3. Edit `android/gradle.properties`, tambahkan:
```
MYAPP_UPLOAD_STORE_FILE=my-release-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=tokobagus
MYAPP_UPLOAD_STORE_PASSWORD=<password_anda>
MYAPP_UPLOAD_KEY_PASSWORD=<password_anda>
```
4. Edit `android/app/build.gradle` bagian `signingConfigs` & `buildTypes.release`
   agar memakai konfigurasi di atas (lihat dok resmi RN "Generating a release build").
5. Build:
```bash
cd android
./gradlew assembleRelease     # (Windows: gradlew.bat assembleRelease)
```
Hasil:
```
android/app/build/outputs/apk/release/app-release.apk
```

---

## 5. Install ke HP Android
- **Cara 1 (kabel USB):** aktifkan *Developer Options → USB Debugging*, lalu:
  ```bash
  adb install -r android/app/build/outputs/apk/debug/app-debug.apk
  ```
- **Cara 2 (manual):** salin file `.apk` ke HP, buka lewat File Manager,
  izinkan *"Install unknown apps"*, lalu install.

---

## 6. Catatan fitur native (hanya jalan di APK, bukan web)
- 🖨️ **Printer Bluetooth** (cetak struk) — `react-native-bluetooth-classic`
- 📷 **Scan barcode kamera** — `expo-camera`
- 💾 **Database offline SQLite** — `expo-sqlite`
- 🖼️ **Upload bukti transaksi & simpan galeri** — `expo-image-picker`, `expo-media-library`
- 📤 **Bagikan struk / share intent** — `expo-sharing`, `expo-share-intent`
- 🔊 **Cari produk via suara** — `expo-speech-recognition`

Semua sudah dikonfigurasi di `app.json` (plugins + permissions) dan akan berfungsi
penuh di APK hasil build.

---

## Troubleshooting singkat
- **`SDK location not found`** → buat `android/local.properties` berisi
  `sdk.dir=/path/ke/Android/Sdk`.
- **NDK not found** → install "NDK (Side by side)" dari SDK Manager.
- **Java version error** → pastikan pakai **JDK 17** (`java -version`).
- **Build lambat pertama kali** → wajar (download Gradle + kompilasi C++), build
  berikutnya jauh lebih cepat.
