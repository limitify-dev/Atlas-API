# 🚀 Koyeb Deployment - Quick Start Guide

## ✅ Pre-Deployment Status

Your Atlas API is **READY** for Koyeb deployment! All checks passed (20/20).

---

## 📋 What You Need

### 1. External PostgreSQL Database

Since Koyeb doesn't provide databases, you need an external PostgreSQL instance. **Recommended options:**

#### 🌟 Supabase (Recommended - Free Tier)
- **URL**: https://supabase.com
- **Free Tier**: Yes (500MB database, 2GB bandwidth)
- **Setup Time**: 2 minutes
- **Steps**:
  1. Create account at supabase.com
  2. Create new project
  3. Go to Settings → Database
  4. Copy "Connection String" (Direct connection)
  5. Format: `postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres`

#### ⚡ Neon.tech (Serverless PostgreSQL)
- **URL**: https://neon.tech
- **Free Tier**: Yes (3GB storage)
- **Setup Time**: 1 minute
- **Auto-scaling**: Yes

#### 🚂 Railway
- **URL**: https://railway.app
- **Free Trial**: $5 credit
- **Setup Time**: 2 minutes

---

## 🎯 Deployment Steps (5 Minutes)

### Step 1: Commit and Push to GitHub (1 min)

```bash
cd /Users/aldrick/Developer/Atlas/Atlas-API

# Add all files
git add .

# Commit
git commit -m "Add Koyeb deployment configuration"

# Push to GitHub
git push origin main
```

**Note**: Your remote is already configured: `git@github.com:limitify-dev/Atlas-API.git`

---

### Step 2: Create External Database (2 min)

**Using Supabase (Recommended)**:

1. Go to https://supabase.com
2. Click "Start your project"
3. Create new project:
   - Name: `atlas-production`
   - Database Password: (generate strong password)
   - Region: Choose closest to you
4. Wait ~2 minutes for provisioning
5. Go to **Settings** → **Database**
6. Copy **Connection String** (URI format)
7. Replace `[YOUR-PASSWORD]` with your actual password

**Your connection string will look like**:
```
postgresql://postgres:YOUR_PASSWORD@db.abc123xyz.supabase.co:5432/postgres
```

---

### Step 3: Deploy to Koyeb (2 min)

1. **Go to Koyeb**: https://app.koyeb.com

2. **Create Web Service**:
   - Click "Create Web Service" button

3. **Select GitHub**:
   - Choose "GitHub" as deployment method
   - Select repository: `limitify-dev/Atlas-API`
   - Branch: `main`

4. **Configure Builder**:
   - Builder: **Dockerfile**
   - Dockerfile path: `Dockerfile` (default)

5. **Add Environment Variables**:

   Click "Add Variable" for each:

   | Name | Value | Type |
   |------|-------|------|
   | `PORT` | `8000` | Plain text |
   | `NODE_ENV` | `production` | Plain text |
   | `DATABASE_URL` | `postgresql://postgres:...` | **Secret** ⚠️ |
   | `SUPABASE_URL` | `https://xxx.supabase.co` | Plain text |
   | `SUPABASE_KEY` | `your-key` | **Secret** ⚠️ |

   **Important**: 
   - Use your **actual** Supabase database URL for `DATABASE_URL`
   - Mark `DATABASE_URL` and `SUPABASE_KEY` as **Secret**

6. **Configure Service**:
   - Service name: `atlas-api`
   - Instance: `nano` (free) or `micro` ($5/mo)
   - Region: Same as your database (e.g., `fra` for Europe)

7. **Configure Port**:
   - Port: `8000`
   - Protocol: `HTTP`

8. **Configure Health Check**:
   - Path: `/`
   - Port: `8000`
   - Initial delay: `60` seconds

9. **Deploy**:
   - Click "Deploy" button
   - Wait 2-3 minutes for build

---

## 📊 Monitor Deployment

### Watch Build Progress

In Koyeb dashboard, you'll see:

```
✅ Cloning repository...
✅ Building Docker image...
✅ Installing dependencies...
✅ Generating Prisma client...
✅ Building application...
✅ Image built successfully
✅ Deploying...
```

### Check Runtime Logs

Once deployed, logs should show:

```
🚀 Starting Atlas API...
⏳ Waiting for PostgreSQL to be ready...
📡 Checking database at db.xxx.supabase.co:5432...
✅ PostgreSQL is ready!
🔄 Running Prisma migrations...
✅ Migrations completed successfully!
🔧 Generating Prisma Client...
✅ Prisma Client generated successfully!
🎯 Starting NestJS application...
Application is running on: http://localhost:8000
API Documentation: http://localhost:8000/doc
```

---

## 🌐 Access Your API

After successful deployment:

**Your API URL** (Koyeb provides):
```
https://atlas-api-limitify-dev.koyeb.app
```

**Test the API**:
```bash
curl https://atlas-api-limitify-dev.koyeb.app
```

**API Documentation**:
```
https://atlas-api-limitify-dev.koyeb.app/doc
```

---

## 🔄 Enable Auto-Deployment

To automatically deploy when you push to GitHub:

1. In Koyeb, go to your service
2. Click **Settings** tab
3. Under **Git Integration**:
   - ✅ Enable "Auto-deploy on push"
   - Branch: `main`
4. Save

Now every `git push` triggers a new deployment!

---

## 🐛 Common Issues & Solutions

### Issue: "Database connection failed"

**Symptoms**: Container keeps restarting, logs show database timeout

**Solutions**:
1. Verify `DATABASE_URL` is correct (copy-paste from Supabase)
2. Ensure you replaced `[YOUR-PASSWORD]` with actual password
3. Check Supabase database is running (green status)
4. Use **Direct connection** string, not pooler

### Issue: "Port binding error"

**Symptoms**: "EADDRINUSE" or port already in use

**Solution**: Ensure `PORT=8000` in Koyeb environment variables

### Issue: "Prisma migrations fail"

**Symptoms**: "Migration failed" in logs

**Solutions**:
1. Run migrations manually first:
   ```bash
   DATABASE_URL="your-production-url" npx prisma migrate deploy
   ```
2. Check database user has CREATE/ALTER permissions

### Issue: "Health check failing"

**Symptoms**: Service shows "Unhealthy"

**Solutions**:
1. Increase health check initial delay to 90 seconds
2. Check runtime logs for errors
3. Verify port 8000 is exposed correctly

---

## 💰 Cost Estimate

### Koyeb
- **Nano instance**: Free tier (limited resources)
- **Micro instance**: ~$5/month (recommended for production)

### Database (Supabase)
- **Free tier**: $0/month (500MB database)
- **Pro tier**: $25/month (8GB database, better performance)

### Total Monthly Cost
- **Development**: $0 (Koyeb nano + Supabase free)
- **Production**: $5-30/month (Koyeb micro + Supabase free/pro)

---

## 📚 Resources

- **Koyeb Dashboard**: https://app.koyeb.com
- **Detailed Guide**: See `KOYEB_DEPLOYMENT.md`
- **Environment Reference**: See `.env.example`
- **Pre-deployment Check**: Run `./check-koyeb-ready.sh`

---

## ✅ Deployment Checklist

- [x] Docker configuration complete
- [x] All required files present
- [x] Security checks passed
- [x] Git repository configured
- [ ] Code pushed to GitHub
- [ ] External database created
- [ ] Koyeb account created
- [ ] GitHub connected to Koyeb
- [ ] Environment variables configured
- [ ] Service deployed
- [ ] API tested and working

---

## 🎉 You're Ready!

Your Atlas API is fully prepared for Koyeb deployment. Just follow the 3 steps above:

1. **Push to GitHub** (1 min)
2. **Create Database** (2 min)
3. **Deploy to Koyeb** (2 min)

**Total time: ~5 minutes** ⚡

Good luck with your deployment! 🚀
