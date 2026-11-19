# Spesifikasi: Profil awal, shortcut menu, dan navigasi Back

Tanggal: 2026-11-19
Proyek: `omcp` (https://github.com/muhnazih029/omcp)

## Konteks

Saat ini `omcp` hanya membuat profil `design`, `think`, `build`, `full`, dan `minimal` jika server yang disebutkan sudah terdaftar di `opencode.json`. Pengguna baru dengan catalog kosong hanya melihat `full` dan `minimal`, sehingga pilihan profil yang dijanjikan tidak muncul. Selain itu, menu utama hanya bisa dinavigasi dengan panah, beberapa label memiliki spasi ganda setelah emoji, dan membatalkan wizard membuat program keluar seluruhnya.

Tujuan perubahan ini adalah membuat pengalaman first-run lengkap, mempercepat navigasi dengan shortcut keyboard yang benar-benar berfungsi, merapikan tampilan, dan menyediakan jalan kembali ke menu utama dari setiap sub-menu.

## Tujuan

1. User baru dengan **0 server** tetap melihat 5 profil: `full`, `minimal`, `build`, `design`, `think`. `Custom` tetap menjadi aksi sekali pakai, bukan profil ke-6.
2. `build`, `design`, dan `think` dimulai kosong dan diisi manual oleh pengguna.
3. `full` tetap berarti "semua server terdaftar" secara dinamis.
4. Shortcut keyboard aktif di menu utama untuk profil dan semua aksi, dengan legenda di header.
5. Setiap sub-menu memiliki opsi `← Back`; pembatalan di prompt text/multiselect juga kembali ke menu utama.
6. Label emoji dan hint tidak memiliki spasi berlebih.

## Non-tujuan

- Tidak menambahkan mapping otomatis nama MCP ke profil (ditolak oleh pengguna).
- Tidak mengubah format file `omcp.json` secara incompatible; penambahan bersifat opsional.
- Tidak mengubah perilaku `omcp` mode non-interaktif (`use`, `launch`, `list`, `status`, `doctor`, passthrough).
- Tidak mengubah wrapper `opencode` atau onboarding first-run.

## Keputusan dari diskusi

| Keputusan | Pilihan pengguna |
| --- | --- |
| Isi profil saat 0 server | Kosong, diisi manual |
| Daftar profil | 5 profil + Custom session seperti sekarang |
| Nama profil ke-5 | `think` (bukan `brainstorming`) |
| Shortcut | Tombol benar-benar aktif, bukan label visual |
| Cakupan Back | Semua sub-menu |
| Bug spasi | Spasi ganda setelah emoji **dan** hint terlalu panjang |

## Desain detail

### 1. Profil awal dan wildcard `full`

`bootstrapStore()` tidak lagi melewati profil yang servernya belum terdaftar. Kelima profil selalu dibuat:

| Profil | `servers` saat bootstrap | Arti |
| --- | --- | --- |
| `full` | `["*"]` | Semua server yang saat ini ada di catalog (dinamis) |
| `minimal` | `[]` | Tidak ada server |
| `build` | `[]` | Diisi manual |
| `design` | `[]` | Diisi manual |
| `think` | `[]` | Diisi manual |

Perubahan ini hanya berlaku untuk **store yang baru dibuat**. Store yang sudah ada tidak dimodifikasi oleh `normalizeStore()`, sehingga profil pengguna yang sudah terisi tidak dihapus.

Helper baru di `src/store.ts`:

```ts
export function profileServerNames(store: Store, profile: Profile): string[]
```

- Jika `profile.servers` persis `["*"]`, kembalikan semua nama katalog yang sudah ada (`Object.keys(store.catalog)`).
- Jika tidak, kembalikan `profile.servers` apa adanya.

Helper ini dipakai oleh:
- `applyProfile()` — server yang akan diaktifkan;
- `activeProfile()` — perbandingan set server aktif;
- `omcp list` dan menu — hint profil;
- wizard Add a server — kandidat profil;
- wizard Edit — `initialValues` multiselect.

Saat `full` diedit dan pengguna memilih semua server yang terdaftar, nilai `["*"]` dipertahankan. Jika memilih subset, profil disimpan sebagai daftar eksplisit.

### 2. Shortcut menu utama

`runMenu()` beralih dari `p.select()` ke `p.selectKey()` dari `@clack/prompts`.

Binding (tombol ditekan langsung memilih opsi; `option.value` untuk `selectKey` adalah tombolnya):

| Tombol | Aksi |
| --- | --- |
| `1`–`5` | Profil dalam urutan alfabetis tetap: build, design, full, minimal, think |
| `x` | Custom session |
| `e` | Edit a profile |
| `c` | Create a profile |
| `a` | Add a server |
| `s` | Sync from opencode.json |
| `d` | Delete a profile |
| `q` | Quit |

Urutan alfabetis dipakai agar nomor tidak bergeser saat `lastProfile` atau profil aktif berubah. Fungsi murni `menuBindings(store)` di `src/ui/menu.ts` menghasilkan daftar `{ key, target, label, hint }`, di mana `key` adalah tombol satu karakter dan `target` adalah nama profil atau id aksi. Daftar ini dipakai untuk membuat opsi `selectKey` (`value: key`) sekaligus legenda, supaya keduanya tidak bisa beda.

Header menu ditambah baris legenda ringkas, misalnya:

```text
Keys   1-5 profiles · x custom · e edit · c create · a add · s sync · d delete · q quit
```

Legenda juga merangkum arti aksi (edit = mengubah server dalam profil, add = mendaftarkan MCP baru) sesuai permintaan pengguna.

Fungsi `parseChoice()` diubah menerima tombol dan daftar binding untuk memetakan `key` ke `target`.

### 3. Tombol Back

- Opsi `← Back` ditambahkan ke semua prompt `p.select` di sub-menu:
  - pilih profil pada **Edit**,
  - pilih profil pada **Delete**,
  - pilih jenis server pada **Add a server**.
- Memilih `← Back` mengembalikan ke menu utama tanpa perubahan.
- Untuk alur yang diawali `p.text` (**Create**) atau `p.multiselect` (**Custom**, pemilihan server), `runMenu()` membungkus tiap sub-flow dengan penanggal `CancelledError`. Menekan Ctrl+C di prompt tersebut kembali ke menu utama dan menampilkan pesan `Back to menu.`, bukan mengakhiri program.
- `p.confirm` pada Delete sudah memiliki jawaban negatif yang return; tidak diubah.

### 4. Perbaikan spasi

- Semua label aksi memakai satu spasi setelah emoji: `✏️ Edit a profile`, `🗑 Delete a profile`, dst.
- `profileLabel()` sudah memakai satu spasi; dipertahankan.
- Hint dipendekkan:
  - `summarizeServers()` memakai format `a, b, c +N` (maksimal 3 nama);
  - hint di `serverOptions()` dibatasi maksimal 48 karakter agar tidak melintir;
  - hint profil di menu memakai `profileServerNames()` sehingga untuk `full` ditampilkan `all configured servers`, bukan daftar panjang.

### 5. Penjelasan "Add a server"

Ditambahkan ke README dan ke hint legenda menu: **Add a server** mendaftarkan atau menginstall definisi MCP baru (bunx/npx, command, remote URL, atau repo Git). Server masuk catalog dalam keadaan tidak aktif sampai dimasukkan ke profil. Berbeda dengan **Sync**, yang mengimpor server yang sudah ditambahkan lewat `opencode mcp add` atau edit config manual.

## Perubahan file

| File | Perubahan |
| --- | --- |
| `src/store.ts` | Seed 5 profil tanpa filter server; helper `profileServerNames()`; ekspansi `*` |
| `src/apply.ts` | Pakai `profileServerNames()` |
| `src/ui/menu.ts` | `menuBindings()`, `selectKey`, legenda, Back, normalisasi spasi, hint pendek |
| `src/ui/common.ts` | Batasi panjang hint; bantu opsi `← Back` |
| `src/ui/server.ts` | Opsi Back pada prompt jenis server; hint profil `full` |
| `src/doctor.ts` | Tampilkan profil `full` sebagai dinamis |
| `src/cli.ts` | `omcp list` memakai `profileServerNames()` |
| `test/apply.test.ts` | Update ekspektasi bootstrap profil kosong |
| `test/store.test.ts` | Test `profileServerNames()` untuk `*` dan daftar eksplisit |
| `test/menu.test.ts` (baru) | Test `menuBindings()` mapping tombol dan legenda |
| `README.md` | Profil awal, tabel shortcut, penjelasan Add a server, perilaku Back |

## Penanganan error

- Tombol shortcut yang tidak dikenal tidak ada karena `selectKey` hanya menerima tombol terdaftar; fallback tetap `parseChoice` yang mengembalikan `quit` untuk nilai tak dikenal.
- Kegagalan `setupWrapper` saat onboarding sudah ditangani dan tidak berubah.
- `CancelledError` di dalam sub-flow ditangkap oleh `runMenu`; di luar sub-flow tetap ditangani `bin/omcp.ts` dengan exit code 130.

## Rencana pengujian

1. `./node_modules/.bin/tsc --noEmit` — harus bersih.
2. `bun test` — semua test lulus, termasuk test baru.
3. Smoke test TTY dengan HOME palsu:
   - tekan `e` → wizard edit muncul; pilih `← Back` → kembali ke menu;
   - tekan `1` → profil `build` dipilih;
   - buat profil baru, tekan Ctrl+C → kembali ke menu, bukan keluar;
   - cek legenda tampil di header dan tidak ada spasi ganda pada label.
4. Verifikasi `omcp list` pada store baru menampilkan 5 profil dengan server kosong dan `full` = semua server.

## Risiko dan trade-off

- `selectKey` mengharuskan nilai opsi berupa tombol satu karakter. Ini diatasi dengan memisahkan tombol dari nilai profil/aksi melalui `menuBindings()`.
- Urutan profil alfabetis mengorbankan prioritasi `lastProfile`/aktif di menu, tetapi membuat nomor shortcut stabil. Profil aktif tetap ditandai di hint.
- Perubahan bootstrap tidak menghapus profil store lama, tetapi pengguna yang menghapus `omcp.json` akan mendapat profil kosong sesuai permintaan.

## di luar cakupan

- Profil `custom` tersimpan, nama `brainstorming`, shortcut di wizard, dan perubahan format `omcp.json`.

---

## Revisi 2026-11-19 (menggantikan bagian 2)

Setelah mencoba versi pertama, desain shortcut di atas **ditolak**: `p.selectKey()` menghilangkan navigasi arrow dan mengubah menu menjadi daftar aksi, padahal yang diminta adalah daftar profil yang tetap bisa dinavigasi dengan ↑/↓. Bagian 2, 3 (sebagian), dan rencana pengujian yang menyebut angka `1`–`5` digantikan oleh desain berikut.

### Menu utama

- Menu hanya berisi **profil** (5 profil awal; profil buatan pengguna ikut tampil). Arrow ↑/↓ memindahkan highlight, Enter memakai profil tersebut dan meluncurkan OpenCode.
- Footer di bawah daftar berisi teks keterangan, bukan opsi yang bisa disorot:

```text
↑/↓ navigate · Enter use selected profile
e edit · d delete · a add server · s sync · c create · x custom · q quit
edit / delete / add / sync act on the highlighted profile
```

- Header hanya menampilkan profil aktif, server aktif, dan path config. Legenda tidak lagi di header.

### Aksi kontekstual

| Tombol | Efek |
| --- | --- |
| `e` | Edit profil yang sedang disorot, tanpa prompt pemilih profil |
| `d` | Hapus profil yang disorot, dengan konfirmasi |
| `a` | Daftarkan server lalu otomatis memasukkannya ke profil yang disorot |
| `s` | Sync dari `opencode.json` lalu otomatis memasukkan server baru ke profil yang disorot |
| `c` | Buat profil baru (global) |
| `x` | Custom session (global) |
| `q` | Quit |

Untuk `full`, `a`/`s` tidak menambahkan entri eksplisit karena wildcard sudah mencakup semua server; `e` mempertahankan `["*"]` bila semua server tetap dipilih.

### Implementasi

- `@clack/prompts` tidak mengekspos tombol bebas untuk `select`, jadi menu utama memakai `SelectPrompt` dari `@clack/core` v1.6.0 dengan `render()` sendiri dan event `"key"`. `@clack/core` ditambahkan sebagai dependency eksplisit.
- Helper murni `menuAction(key, profile)` memetakan tombol ke aksi + profil; dipakai oleh event handler dan test.
- `addServerFlow(store, assignTo?)` menerima profil tujuan opsional agar wizard tidak lagi bertanya "masuk profil mana" saat dipanggil dari menu.
- `deleteProfile(store, preselected?)` menerima nama profil dari highlight.

### Pengujian revisi

- Test `menuAction()` untuk semua tombol dan fallback.
- Smoke test TTY: arrow berpindah highlight, Enter memakai profil, `e` pada profil tertentu langsung membuka editor profil itu, footer tampil di bawah daftar, tidak ada spasi ganda.
