# Quick Start Guide - การ Deploy บน Cloudflare

## 🚀 Deploy ใน 5 นาที

### ขั้นตอนที่ 1: ติดตั้ง Dependencies

```bash
npm install
```

### ขั้นตอนที่ 2: Login Cloudflare

```bash
npx wrangler login
```

### ขั้นตอนที่ 3: สร้างและตั้งค่า Database

```bash
# สร้าง D1 database
npx wrangler d1 create hotel-user-request-db
```

คุณจะได้ผลลัพธ์:
```
✅ Successfully created DB 'hotel-user-request-db'
binding = "DB"
database_name = "hotel-user-request-db"
database_id = "xxxx-xxxx-xxxx-xxxx"
```

**คัดลอก `database_id` และแก้ไขใน wrangler.toml:**

เปิดไฟล์ `wrangler.toml` แล้วแก้ไข:
```toml
[[d1_databases]]
binding = "DB"
database_name = "hotel-user-request-db"
database_id = "xxxx-xxxx-xxxx-xxxx"  # ← วาง database_id ที่คุณได้
```

### ขั้นตอนที่ 4: สร้าง Tables และเพิ่มข้อมูล

```bash
# สร้าง schema
npx wrangler d1 execute hotel-user-request-db --file=./schema.sql

# เพิ่มข้อมูลเริ่มต้น
npx wrangler d1 execute hotel-user-request-db --file=./seed.sql
```

### ขั้นตอนที่ 5: Deploy Backend API

```bash
npm run deploy
```

คุณจะได้ URL เช่น:
```
https://hotel-user-request-system.your-subdomain.workers.dev
```

**คัดลอก URL นี้!**

### ขั้นตอนที่ 6: อัปเดต API URL ใน Frontend

เปิดไฟล์ `public/app.js` บรรทัดที่ 2:

```javascript
const API_URL = 'https://hotel-user-request-system.your-subdomain.workers.dev';
```

แทนที่ URL ด้วย URL ที่คุณได้จากขั้นตอนที่ 5

### ขั้นตอนที่ 7: Deploy Frontend

```bash
npx wrangler pages deploy public --project-name=hotel-request-ui
```

คุณจะได้ URL เช่น:
```
https://hotel-request-ui.pages.dev
```

## ✅ เสร็จสิ้น!

เปิดเบราว์เซอร์ที่ URL Frontend ของคุณเพื่อเริ่มใช้งาน!

---

## 🧪 ทดสอบ Local (Optional)

```bash
npm run dev
```

เปิด: `http://localhost:8787`

---

## 📋 คำสั่งที่ใช้บ่อย

### ดูข้อมูลในฐานข้อมูล
```bash
npx wrangler d1 execute hotel-user-request-db --command "SELECT * FROM programs"
npx wrangler d1 execute hotel-user-request-db --command "SELECT * FROM user_requests LIMIT 5"
```

### ดู Logs
```bash
npx wrangler tail
```

### Update Frontend
หลังแก้ไขไฟล์ใน `public/`:
```bash
npx wrangler pages deploy public --project-name=hotel-request-ui
```

### Update Backend
หลังแก้ไขไฟล์ใน `src/`:
```bash
npm run deploy
```

---

## 🎯 URL สำคัญ

หลัง Deploy เสร็จ คุณจะมี:

- **ระบบ Frontend**: `https://hotel-request-ui.pages.dev`
- **API Backend**: `https://hotel-user-request-system.your-subdomain.workers.dev`
- **Cloudflare Dashboard**: `https://dash.cloudflare.com`

---

## 💡 Tips

1. **Custom Domain**: ไปที่ Cloudflare Dashboard > Pages > Custom domains เพื่อใช้โดเมนของคุณเอง
2. **Environment Variables**: ตั้งค่าได้ที่ Cloudflare Dashboard > Workers > Settings
3. **Analytics**: ดูสถิติการใช้งานได้ที่ Dashboard

---

## ❓ เกิดปัญหา?

### ปัญหา: "Database not found"
→ ตรวจสอบว่า `database_id` ใน `wrangler.toml` ถูกต้อง

### ปัญหา: "CORS error"
→ ตรวจสอบว่า API URL ใน `public/app.js` ถูกต้อง

### ปัญหา: "Wrangler command not found"
→ รัน: `npm install -g wrangler`
