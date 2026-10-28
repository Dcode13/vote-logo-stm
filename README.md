# STM 56 · Voting Logo 2026

Website pemilihan logo HUT ke-56 STM — SMK Negeri 3 Gorontalo. Dibuat dengan React, TypeScript, Vite, Tailwind CSS, dan Supabase PostgreSQL.

Antarmuka memakai tema terang dengan biru toska, putih, serta aksen kuning dan merah yang mengikuti lambang sekolah. Logo sekolah pada header, footer, halaman utama, login, sidebar admin, dan favicon memakai aset `image/school-logo.webp`.

## Menjalankan project

Memerlukan Node.js 22 atau lebih baru.

```bash
npm install
npm run dev
```

Buka alamat lokal yang ditampilkan Vite. Untuk memeriksa dan membuat versi produksi:

```bash
npm run build
npm run preview
```

## Dua halaman

- **Voting:** galeri 14 kandidat, pratinjau logo, konfirmasi pilihan, dan status suara.
- **Hasil voting:** login admin, total suara, peringkat logo, grafik perolehan, pembaruan setiap 15 detik, dan ekspor CSV.

Dashboard admin diakses melalui tautan langsung **`/#hasil`**. Saat menjalankan `npm run dev` pada port bawaan, buka [http://localhost:5173/#hasil](http://localhost:5173/#hasil), lalu klik **Masuk dashboard**. Untuk website yang sudah dihosting, tambahkan `/#hasil` pada alamat website. Halaman voting publik tidak menampilkan menu **Hasil Voting**, **Masuk admin**, atau tautan masuk admin di footer.

Kredensial awal sesuai permintaan:

```text
Username: admin123
Password: admin123
```

## Mengaktifkan Supabase

1. Buat project di [Supabase](https://supabase.com/dashboard).
2. Salin `.env.example` menjadi `.env.local` di root project.
3. Isi URL API dan publishable/anon key dari pengaturan project:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=KEY_PUBLISHABLE_ATAU_ANON_PROJECT

# Hanya untuk script migrasi lokal, bukan untuk frontend:
SUPABASE_DB_URL="postgresql://postgres.PROJECT_ID:PASSWORD@SESSION_POOLER_HOST:5432/postgres"
SUPABASE_DB_CA_FILE=supabase/certs/prod-ca-2021.crt
```

4. Ambil connection string **Session pooler** dari menu **Connect** Supabase untuk `SUPABASE_DB_URL`. `VITE_SUPABASE_URL` harus berupa alamat `https://...supabase.co`; jangan isi kolom ini dengan connection string PostgreSQL.
5. Periksa dan terapkan migrasi dari project lokal:

```bash
npm run db:push -- --dry-run
npm run db:push
npm run db:verify
npm run db:check-api -- --verify
```

Script memeriksa schema dan riwayat migrasi terlebih dahulu, lalu memasang tabel serta fungsi dalam satu transaksi. Script menolak benturan schema/fungsi yang tidak dikenali dan tidak mereset database. Verifikasi SQL menggunakan transaksi yang di-rollback sehingga suara percobaan tidak ikut tersimpan.

Alternatif untuk pemasangan manual pada project kosong: buka **SQL Editor**, lalu jalankan seluruh isi [`supabase/migrations/202610280001_initial_voting.sql`](supabase/migrations/202610280001_initial_voting.sql) satu kali. Jika SQL sudah dipasang manual, gunakan script verifikasi; jangan mengulang pemasangan awal.

6. Hentikan lalu jalankan kembali `npm run dev`. Untuk hosting, isi kedua variabel `VITE_SUPABASE_*` sebelum menjalankan build.

Gunakan **publishable key atau anon key**, jangan `service_role`/secret key. Variabel dengan awalan `VITE_` ikut masuk ke bundle browser. Kunci publishable memang dipakai oleh browser, sedangkan akses data dibatasi database.

`SUPABASE_DB_URL` mengandung password database dan hanya dibaca script lokal di direktori `scripts/`. Simpan nilai sebenarnya di `.env.local`, yang diabaikan Git; `.env.example` tetap menjadi template kosong.

Sertifikat CA publik Supabase disimpan di `supabase/certs/prod-ca-2021.crt`, diunduh dari [penyimpanan sertifikat Supabase](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt). Script database menggunakan CA ini dengan verifikasi sertifikat dan hostname tetap aktif. Untuk sertifikat project yang berbeda, unduh dari **Database Settings → SSL Configuration** lalu sesuaikan `SUPABASE_DB_CA_FILE`.

Tanpa kedua variabel ini, aplikasi menampilkan **mode demo**. Suara demo dimulai dari nol dan hanya disimpan di browser, bukan di Supabase. Data demo tidak otomatis disalin ke database. Jika hanya satu variabel terisi, aplikasi menampilkan kesalahan konfigurasi. Ketika Supabase sudah dikonfigurasi tetapi server bermasalah, aplikasi tetap menampilkan kegagalan; suara tidak dialihkan diam-diam ke demo.

## Penyimpanan dan akses database

- Seluruh tabel berada di schema `voting_private`, dengan RLS aktif dan akses langsung `anon`/`authenticated` dicabut.
- Browser hanya memanggil lima RPC: `get_voting_status`, `cast_vote`, `admin_login`, `get_admin_results`, dan `admin_logout`.
- Halaman publik hanya menerima jumlah keseluruhan dan status suara milik token browser itu sendiri. Perolehan setiap logo diberikan setelah token sesi admin lolos pemeriksaan database.
- Kata sandi admin disimpan sebagai hash bcrypt. Token sesi acak disimpan sebagai hash SHA-256 di database, berlaku delapan jam, dan dicabut saat keluar.
- Login dibatasi sepuluh percobaan per username per menit di database. Kegagalan login dikembalikan sebagai JSON supaya penghitung tetap tersimpan.
- Token pemilih disimpan di `localStorage`; hanya hash-nya yang disimpan di database. Unique constraint mencegah dua suara dari token yang sama, termasuk request bersamaan.

Pembatasan suara berlaku **satu kali per browser**, bukan verifikasi satu orang. Menghapus data situs atau memakai browser/perangkat lain memungkinkan token baru. Jika acara memerlukan satu suara per siswa/alumni yang benar-benar terverifikasi, perlu identitas pemilih seperti akun sekolah atau kode undangan unik.

Implementasi fungsi mengikuti panduan resmi [Database Functions](https://supabase.com/docs/guides/database/functions) dan [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): `SECURITY DEFINER` memakai `search_path` kosong, referensi schema eksplisit, serta izin `EXECUTE` yang dibatasi.

## Pengaturan panitia

Jalankan perintah berikut di SQL Editor sebagai pemilik database untuk menutup voting:

```sql
update voting_private.settings set is_open = false where id = true;
```

Untuk membukanya kembali, ubah `false` menjadi `true`.

Kata sandi awal `admin123` mengikuti permintaan project. Untuk menggantinya di server:

```sql
update voting_private.admins
set password_hash = extensions.crypt('GANTI_DENGAN_PASSWORD_BARU', extensions.gen_salt('bf', 10))
where username = 'admin123';

-- Cabut sesi yang sudah ada setelah mengganti password.
delete from voting_private.admin_sessions;
```

Perubahan ini berlaku untuk Supabase. Kredensial demo lokal tetap `admin123` / `admin123`.

## Logo

Logo website menggunakan [`image/logo1.webp`](image/logo1.webp) sampai `image/logo14.webp`, dengan alpha transparan dan dimensi sekitar 1.200–1.700 piksel pada sisi terpanjang. Latar diproses menggunakan built-in imagegen dengan instruksi mempertahankan desain, teks, warna, dan proporsi; WebP dioptimalkan pada quality 95 dengan alpha lossless. Total 14 file sekitar 5,95 MB. JPEG asli dipertahankan untuk referensi.

Pemetaan nomor logo ke file sumber serta dimensi hasil tercatat di `image/manifest-1-7.json` dan `image/manifest-8-14.json`. Font disimpan bersama project, sehingga antarmuka tidak memerlukan koneksi Google Fonts.

Brief pemrosesan gambar: **background-extraction** — hapus hanya latar di luar logo, hasilkan alpha transparan, pertahankan seluruh teks, simbol, warna, dan proporsi logo asli tanpa mengganti desain. Seluruh 14 aset diproses melalui built-in imagegen, kemudian dikonversi ke WebP untuk website.

## Pengujian

```bash
npm test
npm run test:e2e
```

Tes data memeriksa suara ganda, login/sesi, mode demo, kesalahan konfigurasi, peringkat seri, dan CSV. Tes browser memeriksa alur voting, proteksi dashboard, login, ekspor, reload, dan layout di desktop serta ponsel. Playwright memakai Google Chrome di `/usr/bin/google-chrome`; untuk lokasi lain, atur variabel `CHROME_PATH`.

Tes browser menjalankan server terpisah di port `4174` dengan mode demo yang dipaksakan, sehingga tes tidak mengirim suara ke database Supabase meskipun `.env.local` sudah terisi.

Build frontend dan tes mode demo tidak memvalidasi koneksi database live. Migration perlu dijalankan di project Supabase sebelum digunakan bersama.

## Struktur utama

```text
src/                  Antarmuka React
src/lib/api.ts        Data layer Supabase dan demo lokal
src/lib/types.ts      Tipe data voting, hasil, dan sesi admin
supabase/migrations/  Skema PostgreSQL, seed 14 logo, dan RPC
.env.example          Contoh konfigurasi browser-safe
```

Project ini disiapkan untuk dijalankan dan dibangun secara lokal. Koneksi database live baru aktif setelah variabel Supabase diisi dan migration dijalankan di project Anda.
