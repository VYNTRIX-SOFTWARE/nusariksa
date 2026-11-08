# Review kandidat pemetaan PADK 43 — Kategori 2

Modul ini hanya membantu pemeriksaan **60 pasangan kandidat** antara Tabel 2 (60 parameter Kategori 2) dan Tabel 3 (80 baris × 5 kriteria peringkat) Lampiran IV PADK 43/PADK.03/2025.

Sumber ekstraksi kandidat: PDF yang diberikan untuk review:
- SHA-256: `63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b`.
- Tabel 2: PDF halaman 147–156; Tabel 3: PDF halaman 157–198.
- **Keaslian byte PDF terhadap server OJK belum dibuktikan**. Fingerprint ini hanya untuk berkas yang diperiksa.
- Seluruh pemetaan bersifat `DRAFT_UNVERIFIED`, termasuk kandidat dengan kemiripan teks 100%.

## Cara review melalui UI

1. Login dengan akun berizin `assessments:approve`. Pilih menu **QA Pemetaan PADK**.
2. Pilih satu dari 60 nomor indikator Kategori 2. Prioritaskan nomor **3, 18, 19, 20, 24, 29, dan 32** yang memiliki perbedaan redaksi.
3. Buka PDF sumber asli secara visual pada halaman Tabel 2 dan Tabel 3 yang disebutkan; bandingkan **seluruh persyaratan**, bukan persentase kemiripan.
4. Reviewer substansi memilih `SUBSTANCE`, reviewer pemetaan teknis memilih `TECHNICAL`; **harus dua akun berbeda** untuk nomor yang sama.
5. Pilih **terima kandidat**, **usulkan nomor Tabel 3 berbeda**, atau **eskalasi bila teks tidak dapat dipastikan**. Masukkan alasan dan rujukan halaman. Semua keputusan disimpan sebagai event append-only.
6. Jika keputusan berubah, buat catatan baru. Riwayat sebelumnya tidak boleh diubah. Perubahan bersamaan dengan `expectedLatestEventId` lama ditolak.

## Makna status

`TWO_REVIEWERS_AGREE_CANDIDATE` berarti dua akun berbeda telah menyepakati **nomor pasangan kandidat**. Ini **bukan** validasi kelima kriteria peringkat, pembulatan komposit, autentikasi PDF di host resmi, maupun kesesuaian regulasi secara keseluruhan. Satu hasil `REMAP_PROPOSAL` atau `ESCALATE` membuat kandidat tetap `PENDING`.

**Review per kategori ini tidak boleh mengubah** `regulatoryPackReady`, status produksi, izin scoring, endpoint preview, atau tabel penilaian BPR. Diperlukan proofreading independen seluruh 140 indikator, 400 sel kriteria, metodologi peringkat, dan hasil pemetaan 60 item sebelum regulatory pack bisa dievaluasi ulang untuk produksi.

## Endpoint

- `GET /regulatory/padk43/cyber/crosswalk`: seluruh kandidat, halaman sumber, dan keputusan terbaru.
- `POST /regulatory/padk43/cyber/crosswalk/:number`: catat satu keputusan (origin, cookie, permission, sumber, dan optimistic version diperiksa).
- `GET /regulatory/padk43/cyber/crosswalk/:number/history`: seluruh keputusan historis, tanpa perubahan.

Saat ini izin `assessments:approve` digunakan karena belum ada peran reviewer regulasi khusus. **Owner tetap wajib memastikan kompetensi dan independensi reviewer secara operasional**, karena dua akun berbeda saja tidak membuktikan kualifikasi. Pemisahan permission `regulatory:review` perlu diselesaikan sebelum deployment produksi multi-user.

## Release gate

**BLOCKED**. Rilis Stable memerlukan QA sumber primer dan dua pemeriksaan independen yang benar, perbaikan perbedaan sumber termasuk salah ketik pada Tabel 3, validasi perhitungan, alur input–approval–PDF final, security review, backup/restore, dan UAT. Jangan meluncurkan skor resmi hanya karena semua mapping mempunyai dua keputusan.
