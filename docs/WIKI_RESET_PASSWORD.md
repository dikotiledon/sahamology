# Reset Password Sahamology

Jika Anda lupa password proteksi aplikasi, Anda dapat mereset melalui PostgreSQL.

## Langkah-langkah Reset (Docker Compose)

1. Buka terminal di folder repositori Sahamology.
2. Jalankan perintah berikut untuk masuk ke psql di dalam container database:

   ```bash
   docker compose exec db psql -U sahamology -d sahamology
   ```

   > Ganti `sahamology` dengan nilai `POSTGRES_USER`/`POSTGRES_DB` Anda jika berbeda.

3. Jalankan query berikut:

   ```sql
   UPDATE profile SET value = '', updated_at = now() WHERE key = 'password_hash';
   UPDATE profile SET value = 'false', updated_at = now() WHERE key = 'password_enabled';
   ```

4. Ketik `\q` untuk keluar.
5. Refresh aplikasi Sahamology di browser Anda.

Setelah reset, aplikasi akan bisa diakses tanpa password. Anda dapat mengaktifkan dan mengatur password baru melalui ikon 🛡️ (Shield) di Navbar.

---

*Kembali ke [Halaman Utama Wiki](Home)*
