# 🤖 VocaFlow Standalone Bot (Render Deploy Edition)

Đây là mã nguồn tách biệt hoàn toàn cho Telegram Bot của VocaFlow, được tối ưu hóa để chạy trên **Render Free Tier**.

## 🚀 Cách hoạt động
- **Webhook:** Bot sử dụng Webhook thay vì Long-polling để Render có thể "tỉnh giấc" mỗi khi có tin nhắn mới.
- **Cron Job:** Cung cấp endpoint `/cron` để các dịch vụ như `cron-job.org` gọi vào mỗi giờ, giúp xử lý việc nhả từ vựng hàng ngày.

## 🛠 Hướng dẫn thiết lập (Local)

1. **Copy thư mục này** ra một thư mục hoàn toàn mới ngoài dự án cũ.
2. **Khởi tạo Git:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
3. **Tạo Repo trên GitHub** và push code lên đó.
4. **Cài đặt thư viện:**
   ```bash
   npm install
   ```
5. **Cấu hình biến môi trường:**
   - Copy file `.env.example` thành `.env`.
   - Điền `TELEGRAM_BOT_TOKEN`.
   - Copy file `serviceAccountKey.json` gốc của bạn vào thư mục này.

## 🌍 Triển khai lên Render.com

1. Tạo **New Web Service** trên Render và liên kết với Repo GitHub này.
2. **Build Selection:**
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
3. **Environment Variables (Rất quan trọng):**
   - `TELEGRAM_BOT_TOKEN`: Token của bạn.
   - `FIREBASE_SERVICE_ACCOUNT_BASE64`: 
     - Bạn dùng công cụ Online hoặc lệnh này để chuyển file JSON thành Base64:
     - `[Convert]::ToBase64String([IO.File]::ReadAllBytes("serviceAccountKey.json"))` (PowerShell)
     - `base64 -w 0 serviceAccountKey.json` (Linux/Mac)
   - `CRON_SECRET`: Một mật khẩu tự chọn (vd: `my_voca_secret_123`).
4. **Thiết lập Cron hàng giờ:**
   - Truy cập [cron-job.org](https://cron-job.org/).
   - Tạo task mới gọi đến: `https://ten-app-cua-ban.onrender.com/cron`.
   - Thêm Header: `Authorization: Bearer <CRON_SECRET_CỦA_BẠN>`.

## 📌 Lưu ý bảo mật
**KHÔNG BAO GIỜ** đẩy file `serviceAccountKey.json` lên GitHub. Hãy dùng biến môi trường `FIREBASE_SERVICE_ACCOUNT_BASE64` khi deploy lên Cloud.
