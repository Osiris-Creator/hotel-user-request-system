# Hotel User Request System - Cloudflare Edition

ระบบจัดการคำขอเข้าใช้งานโปรแกรมสำหรับพนักงานโรงแรม ทำงานบน Cloudflare Workers + D1 + Pages

## 🚀 คุณสมบัติ

- ✅ Backend API บน **Cloudflare Workers** (รองรับการเข้าถึงจากทั่วโลก)
- ✅ ฐานข้อมูล **Cloudflare D1** (SQLite-based, serverless)
- ✅ Frontend UI บน **Cloudflare Pages** (รองรับภาษาไทย)
- ✅ รองรับ 6 โปรแกรมหลัก พร้อม Role ต่างๆ
- ✅ ระบบ Audit Log สำหรับการตรวจสอบย้อนหลัง
- ✅ สถานะคำขอ: รอพิจารณา, อนุมัติ, ไม่อนุมัติ, เสร็จสิ้น

## 📋 โครงสร้างโปรเจกต์

```
Request user project/
├── src/
│   ├── index.ts           # Worker API (Backend)
│   └── types.ts           # TypeScript types
├── public/
│   ├── index.html         # Frontend UI
│   ├── app.js             # JavaScript logic
│   └── styles.css         # Styling
├── schema.sql             # Database schema
├── seed.sql               # Initial data (programs & roles)
├── wrangler.toml          # Cloudflare configuration
├── package.json
└── tsconfig.json
```

## 🛠️ การติดตั้งและ Deploy

### ข้อกำหนดเบื้องต้น

- Node.js 18+ และ npm
- บัญชี Cloudflare (ฟรี)
- Wrangler CLI

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. Login เข้า Cloudflare

```bash
npx wrangler login
```

### 3. สร้างฐานข้อมูล D1

```bash
npm run db:create
```

คำสั่งนี้จะสร้าง D1 database และแสดง `database_id` ให้คุณ

**สำคัญ:** คัดลอก `database_id` และแก้ไขในไฟล์ `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "hotel-user-request-db"
database_id = "your-database-id-here"  # ← ใส่ค่าที่ได้
```

### 4. สร้าง Database Schema

```bash
npm run db:init
```

### 5. เพิ่มข้อมูลเริ่มต้น (โปรแกรมและ Role)

```bash
npm run db:seed
```

### 6. ทดสอบ Local

```bash
npm run dev
```

เปิดเบราว์เซอร์ที่ `http://localhost:8787` เพื่อทดสอบ API

### 7. Deploy Backend (Workers)

```bash
npm run deploy
```

คำสั่งนี้จะ deploy Worker และจะได้ URL เช่น:
```
https://hotel-user-request-system.your-subdomain.workers.dev
```

### 8. Deploy Frontend (Pages)

```bash
npx wrangler pages deploy public --project-name=hotel-request-ui
```

หรือใช้ Cloudflare Dashboard:
1. ไปที่ [Cloudflare Dashboard](https://dash.cloudflare.com)
2. เลือก **Pages** > **Create a project**
3. เลือก **Upload assets**
4. อัปโหลดโฟลเดอร์ `public/`
5. ตั้งชื่อโปรเจกต์: `hotel-request-ui`

### 9. อัปเดต API URL ใน Frontend

แก้ไขไฟล์ [`public/app.js:2`](public/app.js:2):

```javascript
const API_URL = 'https://hotel-user-request-system.your-subdomain.workers.dev';
```

แล้ว deploy frontend อีกครั้ง:

```bash
npx wrangler pages deploy public --project-name=hotel-request-ui
```

## 🌐 การเข้าถึงระบบ

หลัง Deploy เสร็จ คุณจะได้ URL:

- **Frontend UI**: `https://hotel-request-ui.pages.dev`
- **Backend API**: `https://hotel-user-request-system.your-subdomain.workers.dev`

## 📊 API Endpoints

### Programs
- `GET /api/programs` - ดูโปรแกรมทั้งหมดพร้อม Role
- `GET /api/programs/:id/roles` - ดู Role ของโปรแกรมที่เจาะจง

### Requests
- `POST /api/requests` - สร้างคำขอใหม่
- `GET /api/requests` - ดูคำขอทั้งหมด (มีตัวกรอง)
- `GET /api/requests/:id` - ดูรายละเอียดคำขอ
- `PATCH /api/requests/:id/status` - อัปเดตสถานะ
- `GET /api/requests/:id/audit` - ดู Audit Log ของคำขอ

### Audit Log
- `GET /api/audit` - ดู Audit Log ทั้งหมด

## 💡 การใช้งาน Frontend

### 1. สร้างคำขอใหม่
- กรอกข้อมูลพนักงาน (รหัส, ชื่อ, อีเมล, แผนก, ตำแหน่ง)
- กรอกข้อมูลผู้ขอ
- เลือกโปรแกรมและ Role ที่ต้องการ (สามารถเพิ่มได้หลายรายการ)
- กดปุ่ม "สร้างคำขอ"

### 2. ดูรายการคำขอ
- กรองตามสถานะ: รอพิจารณา, อนุมัติ, ไม่อนุมัติ, เสร็จสิ้น
- ค้นหาด้วยเลขที่คำขอ, ชื่อ, รหัสพนักงาน
- คลิกที่การ์ดเพื่อดูรายละเอียด

### 3. อนุมัติ/ปฏิเสธคำขอ
- เปิดรายละเอียดคำขอที่สถานะ "รอพิจารณา"
- กดปุ่ม "อนุมัติ" หรือ "ไม่อนุมัติ"
- ระบุชื่อผู้อนุมัติ

### 4. ดู Audit Log
- เลือกประเภท Action: CREATE, UPDATE_STATUS
- เลือกช่วงเวลา: 7, 30, 90 วัน
- ดูประวัติการเปลี่ยนแปลงทั้งหมด

## 🔒 ความปลอดภัย

- ✅ CORS ถูกตั้งค่าไว้แล้ว
- ✅ บันทึก IP Address ใน Audit Log
- ✅ Transaction support ป้องกันข้อมูลไม่สมบูรณ์
- ✅ Input validation

## 💰 ค่าใช้จ่าย (Cloudflare Free Plan)

- **Workers**: 100,000 requests/วัน (ฟรี)
- **D1**: 5 GB storage, 5 million reads/วัน (ฟรี)
- **Pages**: Unlimited requests (ฟรี)

เพียงพอสำหรับโรงแรมขนาดกลาง-ใหญ่!

## 🔧 การจัดการฐานข้อมูล

### ดูข้อมูลในฐานข้อมูล

```bash
npx wrangler d1 execute hotel-user-request-db --command "SELECT * FROM programs"
npx wrangler d1 execute hotel-user-request-db --command "SELECT * FROM user_requests LIMIT 10"
```

### Backup ฐานข้อมูล

```bash
npx wrangler d1 export hotel-user-request-db --output backup.sql
```

### Restore ฐานข้อมูล

```bash
npx wrangler d1 execute hotel-user-request-db --file backup.sql
```

## 📱 การใช้งานบนมือถือ

Frontend รองรับการใช้งานบนมือถือ (Responsive Design) ทำให้ผู้จัดการสามารถอนุมัติคำขอจากมือถือได้ทุกที่ทุกเวลา

## 🆘 การแก้ไขปัญหา

### ปัญหา: Database binding ไม่ทำงาน
**วิธีแก้**: ตรวจสอบว่า `database_id` ใน `wrangler.toml` ถูกต้อง

### ปัญหา: CORS error
**วิธีแก้**: ตรวจสอบว่า API URL ใน `app.js` ถูกต้อง

### ปัญหา: Deploy Pages ไม่สำเร็จ
**วิธีแก้**: ลองใช้ Cloudflare Dashboard แทน CLI

## 📝 License

ISC

## 🤝 Support

หากมีปัญหาหรือต้องการความช่วยเหลือ:
- ตรวจสอบ [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- ตรวจสอบ [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
