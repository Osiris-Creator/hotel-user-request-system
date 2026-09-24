# Hotel User Request System - Auto Deploy Setup

## 🚀 การตั้งค่า Auto Deploy

### วิธีที่ 1: GitHub Actions (แนะนำ)

#### 1. สร้าง Git Repository

```bash
git init
git add .
git commit -m "Initial commit"
```

#### 2. สร้าง Repository บน GitHub

1. ไปที่ https://github.com/new
2. สร้าง repository ใหม่ชื่อ `hotel-request-system`
3. Push code ขึ้นไป:

```bash
git remote add origin https://github.com/YOUR_USERNAME/hotel-request-system.git
git branch -M main
git push -u origin main
```

#### 3. ตั้งค่า Cloudflare API Token

1. ไปที่ https://dash.cloudflare.com/profile/api-tokens
2. คลิก **Create Token**
3. เลือก template **Edit Cloudflare Workers**
4. หรือสร้าง Custom Token ด้วยสิทธิ์:
   - Account > Workers Scripts > Edit
   - Account > D1 > Edit
   - Account > Cloudflare Pages > Edit
5. คัดลอก Token ที่ได้

#### 4. เพิ่ม Secret ใน GitHub

1. ไปที่ Repository → **Settings** → **Secrets and variables** → **Actions**
2. คลิก **New repository secret**
3. เพิ่ม:
   - Name: `CLOUDFLARE_API_TOKEN`
   - Secret: วาง Token ที่คัดลอกมา
4. คลิก **Add secret**

#### 5. เพิ่ม CLOUDFLARE_ACCOUNT_ID (ถ้าต้องการ)

1. หา Account ID จาก Cloudflare Dashboard (ขวามือ)
2. เพิ่ม Secret:
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Secret: วาง Account ID

#### 6. ทดสอบ Auto Deploy

```bash
# แก้ไขไฟล์อะไรก็ได้
echo "// Updated" >> public/app.js

# Commit และ Push
git add .
git commit -m "Update app"
git push
```

GitHub Actions จะ Deploy อัตโนมัติ! ดูความคืบหน้าที่ **Actions** tab

---

### วิธีที่ 2: Cloudflare Pages Git Integration

#### 1. เชื่อมต่อ Repository

1. ไปที่ https://dash.cloudflare.com
2. **Workers & Pages** → **Create application** → **Pages**
3. เลือก **Connect to Git**
4. เชื่อมต่อ GitHub/GitLab
5. เลือก Repository `hotel-request-system`

#### 2. ตั้งค่า Build

- **Build command**: `npm install` (ถ้ามี build process)
- **Build output directory**: `public`
- **Root directory**: `/`

#### 3. Deploy

คลิก **Save and Deploy**

#### 4. Auto Deploy

ทุกครั้งที่ Push ไป GitHub, Cloudflare Pages จะ Deploy อัตโนมัติ!

---

### วิธีที่ 3: ใช้ Wrangler CLI ร่วมกับ Git Hooks

#### 1. ติดตั้ง Husky

```bash
npm install --save-dev husky
npx husky init
```

#### 2. สร้าง Pre-push Hook

สร้างไฟล์ `.husky/pre-push`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🚀 Deploying to Cloudflare..."

# Deploy Worker
npx wrangler deploy

# Deploy Pages
npx wrangler pages deploy public --project-name=hotel-request-ui

echo "✅ Deployment complete!"
```

#### 3. ทดสอบ

```bash
git add .
git commit -m "Test auto deploy"
git push
```

---

## 📋 ไฟล์ที่สร้าง

- `.github/workflows/deploy.yml` - GitHub Actions workflow
- `.github/workflows/deploy-on-tag.yml` - Deploy เมื่อสร้าง Tag
- `README-DEPLOY.md` - คู่มือนี้

## 🎯 Workflow ที่แนะนำ

### Development
```bash
git checkout -b feature/new-feature
# แก้ไขโค้ด
git commit -m "Add new feature"
git push
```

### Production
```bash
git checkout main
git merge feature/new-feature
git push  # Auto deploy!
```

หรือใช้ Tag:
```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0  # Deploy production
```

## 🔧 Tips

1. **Branch Protection**: ตั้งค่า Branch protection สำหรับ `main` branch
2. **Review Required**: ให้ต้อง review PR ก่อน merge
3. **Staging Environment**: สร้าง branch `staging` สำหรับทดสอบก่อน production
4. **Rollback**: ใช้ `git revert` หรือ Cloudflare Dashboard เพื่อ rollback

## ⚠️ หมายเหตุ

- GitHub Actions มี Free tier 2,000 นาทีต่อเดือน
- Cloudflare Pages มี Unlimited builds
- ตรวจสอบ logs ใน Actions tab หรือ Cloudflare Dashboard
