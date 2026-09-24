# Hotel User Request Management System

ระบบจัดการคำขอเข้าใช้งานโปรแกรมสำหรับพนักงานโรงแรม พร้อมระบบบันทึก Audit Log เพื่อการตรวจสอบย้อนหลัง

## คุณสมบัติหลัก

- ✅ จัดการคำขอเข้าใช้งานโปรแกรมสำหรับพนักงานใหม่
- ✅ กำหนด Role ที่สามารถเข้าใช้งานได้ของแต่ละโปรแกรม
- ✅ บันทึกประวัติการเปลี่ยนแปลงทั้งหมดใน Audit Log
- ✅ รองรับ 6 โปรแกรมหลัก:
  1. Opera Cloud
  2. POS Infrasys cloud
  3. Message Box
  4. Visionline Key Card
  5. Okkami
  6. Oracle Fusion Cloud

## โครงสร้างฐานข้อมูล

### Tables
- **programs** - โปรแกรมที่มีในระบบ
- **roles** - Role ของแต่ละโปรแกรม
- **users** - ข้อมูลพนักงาน
- **user_requests** - คำขอเข้าใช้งาน
- **request_access** - รายการโปรแกรมและ Role ที่ขอใช้งาน
- **audit_log** - บันทึกการเปลี่ยนแปลงทั้งหมด

## การติดตั้ง

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. ตั้งค่าฐานข้อมูล

สร้างไฟล์ `.env` จากไฟล์ตัวอย่าง:

```bash
cp .env.example .env
```

แก้ไขค่าใน `.env`:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=hotel_user_request_db
DB_PORT=3306
PORT=3000
NODE_ENV=development
```

### 3. สร้างฐานข้อมูล

```bash
npm run init-db
```

คำสั่งนี้จะ:
- สร้างฐานข้อมูล
- สร้างตารางทั้งหมด
- เพิ่มข้อมูลโปรแกรมและ Role เริ่มต้น

### 4. เริ่มต้นเซิร์ฟเวอร์

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

## API Endpoints

### Programs API

#### GET `/api/programs`
ดึงข้อมูลโปรแกรมทั้งหมด

#### GET `/api/programs/with-roles`
ดึงข้อมูลโปรแกรมพร้อม Role ทั้งหมด

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Opera Cloud",
      "description": "Property Management System",
      "roles": [
        {
          "id": 1,
          "role_name": "Admin",
          "description": null
        }
      ]
    }
  ]
}
```

#### GET `/api/programs/:id/roles`
ดึง Role ของโปรแกรมที่เจาะจง

### User Requests API

#### POST `/api/requests`
สร้างคำขอเข้าใช้งานใหม่

**Request Body:**
```json
{
  "user": {
    "employee_id": "EMP001",
    "first_name": "สมชาย",
    "last_name": "ใจดี",
    "email": "somchai@hotel.com",
    "department": "Front Office",
    "position": "Receptionist"
  },
  "requester": {
    "name": "ผู้จัดการแผนก",
    "email": "manager@hotel.com"
  },
  "programAccess": [
    {
      "program_id": 1,
      "role_id": 2
    },
    {
      "program_id": 4,
      "role_id": 10
    }
  ],
  "notes": "พนักงานใหม่เริ่มงานวันที่ 1 ตุลาคม 2026"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User request created successfully",
  "data": {
    "requestId": 1,
    "requestNumber": "REQ202609001"
  }
}
```

#### GET `/api/requests`
ดึงข้อมูลคำขอทั้งหมด

**Query Parameters:**
- `status` - กรองตามสถานะ (pending, approved, rejected, completed)
- `fromDate` - วันที่เริ่มต้น (YYYY-MM-DD)
- `toDate` - วันที่สิ้นสุด (YYYY-MM-DD)
- `search` - ค้นหาจาก request number, ชื่อ, employee_id
- `limit` - จำกัดจำนวนผลลัพธ์

**Example:**
```
GET /api/requests?status=pending&limit=50
```

#### GET `/api/requests/:id`
ดึงข้อมูลคำขอแบบละเอียด

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "request_number": "REQ202609001",
    "status": "pending",
    "employee_id": "EMP001",
    "first_name": "สมชาย",
    "last_name": "ใจดี",
    "programAccess": [
      {
        "id": 1,
        "program_id": 1,
        "role_id": 2,
        "program_name": "Opera Cloud",
        "role_name": "Front Desk"
      }
    ]
  }
}
```

#### PATCH `/api/requests/:id/status`
อัปเดตสถานะคำขอ

**Request Body:**
```json
{
  "status": "approved",
  "changedBy": "ผู้จัดการ IT",
  "approvedBy": "คุณสมหญิง"
}
```

**Status Values:**
- `pending` - รอพิจารณา
- `approved` - อนุมัติแล้ว
- `rejected` - ไม่อนุมัติ
- `completed` - ดำเนินการเรียบร้อยแล้ว

#### GET `/api/requests/:id/audit`
ดึง Audit Log ของคำขอ

### Audit Log API

#### GET `/api/audit`
ดึงข้อมูล Audit Log ทั้งหมด

**Query Parameters:**
- `fromDate` - วันที่เริ่มต้น
- `toDate` - วันที่สิ้นสุด
- `action` - ประเภทการกระทำ (CREATE, UPDATE_STATUS)
- `requestId` - ID ของคำขอ
- `limit` - จำกัดจำนวน (default: 100)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "request_id": 1,
      "request_number": "REQ202609001",
      "action": "CREATE",
      "changed_by": "ผู้จัดการแผนก",
      "old_value": null,
      "new_value": "{...}",
      "change_description": "New user access request created",
      "created_at": "2026-09-24T10:30:00.000Z"
    }
  ]
}
```

## โปรแกรมและ Role เริ่มต้น

### 1. Opera Cloud (Property Management System)
- Admin
- Front Desk
- Reservation
- Housekeeping
- Cashier
- Report Viewer

### 2. POS Infrasys cloud (Point of Sale System)
- Admin
- Manager
- Cashier
- Server
- Report Viewer

### 3. Message Box (Internal Communication)
- Admin
- User
- Manager

### 4. Visionline Key Card (Key Card Management)
- Admin
- Front Desk
- Security
- Engineer

### 5. Okkami
- Admin
- User
- Manager

### 6. Oracle Fusion Cloud (ERP)
- Admin
- Finance
- HR
- Procurement
- Report Viewer

## การใช้งาน Audit Log

ระบบจะบันทึกการเปลี่ยนแปลงทั้งหมดอัตโนมัติ:

1. **การสร้างคำขอใหม่** - บันทึก action = 'CREATE'
2. **การเปลี่ยนสถานะ** - บันทึก action = 'UPDATE_STATUS' พร้อมค่าเก่าและค่าใหม่
3. **การแก้ไขข้อมูล** - บันทึกทุกการเปลี่ยนแปลง

ข้อมูลที่บันทึก:
- Request ID
- ประเภทการกระทำ (Action)
- ผู้ทำการเปลี่ยนแปลง
- ค่าเก่า (Old Value)
- ค่าใหม่ (New Value)
- คำอธิบาย
- IP Address (ถ้ามี)
- วันเวลา

## ตัวอย่างการใช้งาน

### ตัวอย่าง 1: สร้างคำขอสำหรับพนักงาน Front Desk

```bash
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{
    "user": {
      "employee_id": "EMP001",
      "first_name": "สมชาย",
      "last_name": "ใจดี",
      "email": "somchai@hotel.com",
      "department": "Front Office",
      "position": "Receptionist"
    },
    "requester": {
      "name": "ผู้จัดการแผนก",
      "email": "manager@hotel.com"
    },
    "programAccess": [
      {"program_id": 1, "role_id": 2},
      {"program_id": 4, "role_id": 10}
    ],
    "notes": "พนักงานใหม่เริ่มงานวันที่ 1 ตุลาคม"
  }'
```

### ตัวอย่าง 2: อนุมัติคำขอ

```bash
curl -X PATCH http://localhost:3000/api/requests/1/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "changedBy": "IT Manager",
    "approvedBy": "คุณสมหญิง"
  }'
```

### ตัวอย่าง 3: ค้นหาคำขอที่รออนุมัติ

```bash
curl "http://localhost:3000/api/requests?status=pending&limit=20"
```

### ตัวอย่าง 4: ดู Audit Log ของเดือนนี้

```bash
curl "http://localhost:3000/api/audit?fromDate=2026-09-01&toDate=2026-09-30"
```

## การ Deploy

### Requirements
- Node.js 14+
- MySQL 5.7+ หรือ MariaDB 10.2+

### Production
1. ตั้งค่า `NODE_ENV=production` ใน `.env`
2. ใช้ process manager เช่น PM2:

```bash
npm install -g pm2
pm2 start server.js --name hotel-request-system
```

## License

ISC
