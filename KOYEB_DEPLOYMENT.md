# Deploying Atlas API to Koyeb

This guide walks you through deploying your containerized Atlas API to Koyeb, a serverless platform that supports Docker deployments.

---

## 📋 Prerequisites

Before deploying to Koyeb, ensure you have:

1. ✅ **GitHub Account** - Your code should be in a GitHub repository
2. ✅ **Koyeb Account** - Sign up at [koyeb.com](https://www.koyeb.com)
3. ✅ **External PostgreSQL Database** - Koyeb doesn't provide databases, so you'll need:
   - Supabase (recommended - free tier available)
   - AWS RDS
   - Google Cloud SQL
   - Neon.tech
   - Railway
   - Or any other PostgreSQL provider

4. ✅ **Environment Variables Ready**:
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_KEY` - Your Supabase API key

---

## 🔧 Step 1: Prepare Your Repository

### 1.1 Push Your Code to GitHub

If you haven't already, push your Atlas API to GitHub:

```bash
cd /Users/aldrick/Developer/Atlas/Atlas-API

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Add Docker configuration for Koyeb deployment"

# Add remote (replace with your repository URL)
git remote add origin https://github.com/YOUR_USERNAME/Atlas-API.git

# Push to GitHub
git push -u origin main
```

### 1.2 Verify Required Files

Ensure these files are in your repository:
- ✅ `Dockerfile`
- ✅ `docker-entrypoint.sh`
- ✅ `.dockerignore`
- ✅ `package.json`
- ✅ `tsconfig.json`
- ✅ `nest-cli.json`
- ✅ `prisma/schema.prisma`

**Important**: Do NOT commit `.env` file (it should be in `.gitignore`)

---

## 🌐 Step 2: Set Up External Database

### Option A: Supabase (Recommended - Free Tier)

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Go to **Settings** → **Database**
4. Copy the **Connection String** (Direct connection, not pooler)
5. Format: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

### Option B: Neon.tech (Free Tier)

1. Go to [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string
4. Format: `postgresql://[user]:[password]@[endpoint].neon.tech/[dbname]`

### Option C: Railway (Free Trial)

1. Go to [railway.app](https://railway.app)
2. Create a new PostgreSQL database
3. Copy the connection string from the **Connect** tab

---

## 🚀 Step 3: Deploy to Koyeb

### 3.1 Connect GitHub to Koyeb

1. **Log in to Koyeb**: Go to [app.koyeb.com](https://app.koyeb.com)
2. **Connect GitHub**:
   - Go to **Settings** → **GitHub**
   - Click **Install GitHub App**
   - Select your GitHub account/organization
   - Choose which repositories Koyeb can access (select your Atlas-API repo)

### 3.2 Create a New Service

1. **Navigate to Services**:
   - Click **Create Web Service** button

2. **Select Deployment Method**:
   - Choose **GitHub** as the deployment method
   - Select your **Atlas-API** repository
   - Choose the branch (usually `main` or `master`)

3. **Configure Builder**:
   - **Builder**: Select **Dockerfile**
   - **Dockerfile path**: Leave as `Dockerfile` (default)
   - **Build context**: Leave as `/` (root of repository)

4. **Configure Environment Variables**:
   
   Click **Add Variable** for each of the following:

   | Name | Value | Type |
   |------|-------|------|
   | `PORT` | `8000` | Plain text |
   | `NODE_ENV` | `production` | Plain text |
   | `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | **Secret** ⚠️ |
   | `SUPABASE_URL` | `https://xxx.supabase.co` | Plain text |
   | `SUPABASE_KEY` | `your-supabase-key` | **Secret** ⚠️ |

   **Important Notes**:
   - Use **Secret** type for sensitive values (DATABASE_URL, SUPABASE_KEY)
   - Koyeb uses port `8000` by default, so set `PORT=8000`
   - Replace the DATABASE_URL with your actual external database connection string

5. **Configure Service Settings**:
   
   - **Service name**: `atlas-api` (or your preferred name)
   - **Instance type**: `nano` (free tier) or `micro` (for better performance)
   - **Regions**: Choose closest to your database (e.g., `fra` for Europe, `was` for US East)
   - **Scaling**: 
     - Min instances: `1`
     - Max instances: `1` (or more for auto-scaling)

6. **Configure Port Exposure**:
   
   - **Port**: `8000` (must match the PORT environment variable)
   - **Protocol**: `HTTP`
   - **Path**: `/` (root path)

7. **Configure Health Checks** (Optional but recommended):
   
   - **Path**: `/` or `/health` (if you have a health endpoint)
   - **Port**: `8000`
   - **Initial delay**: `60` seconds (to allow Prisma migrations to complete)
   - **Timeout**: `10` seconds

8. **Deploy**:
   - Review all settings
   - Click **Deploy** button

---

## 📊 Step 4: Monitor Deployment

### 4.1 Watch Build Logs

1. After clicking Deploy, you'll see the build progress
2. Monitor the logs for:
   ```
   ✅ Building Docker image...
   ✅ Installing dependencies...
   ✅ Generating Prisma client...
   ✅ Building application...
   ✅ Image built successfully
   ```

### 4.2 Watch Runtime Logs

Once deployed, check the runtime logs for:

```
🚀 Starting Atlas API...
⏳ Waiting for PostgreSQL to be ready...
📡 Checking database at [your-db-host]:5432...
✅ PostgreSQL is ready!
🔄 Running Prisma migrations...
✅ Migrations completed successfully!
🔧 Generating Prisma Client...
✅ Prisma Client generated successfully!
🎯 Starting NestJS application...
📍 Port: 8000
🌐 Environment: production
Application is running on: http://localhost:8000
API Documentation: http://localhost:8000/doc
```

### 4.3 Access Your Deployed API

Once deployment is successful:

1. **Public URL**: Koyeb will provide a URL like:
   ```
   https://atlas-api-YOUR-ORG.koyeb.app
   ```

2. **Test the API**:
   ```bash
   curl https://atlas-api-YOUR-ORG.koyeb.app
   ```

3. **Access API Documentation**:
   ```
   https://atlas-api-YOUR-ORG.koyeb.app/doc
   ```

---

## 🔧 Step 5: Configure Custom Domain (Optional)

### 5.1 Add Custom Domain

1. Go to your service in Koyeb
2. Click **Domains** tab
3. Click **Add Domain**
4. Enter your domain (e.g., `api.yourdomain.com`)
5. Follow DNS configuration instructions

### 5.2 Update DNS Records

Add a CNAME record in your DNS provider:

```
Type: CNAME
Name: api (or your subdomain)
Value: [your-koyeb-service].koyeb.app
TTL: 3600
```

Koyeb automatically provisions SSL certificates for custom domains.

---

## 🔄 Step 6: Enable Auto-Deployment

Koyeb can automatically redeploy when you push to GitHub:

1. Go to your service **Settings**
2. Under **Git Integration**:
   - ✅ Enable **Auto-deploy on push**
   - Select branch to track (e.g., `main`)
3. Save changes

Now, every push to your main branch will trigger a new deployment!

---

## 🐛 Troubleshooting

### Issue 1: Build Fails - "Prisma Client Not Found"

**Solution**: Ensure `tsconfig.json` has the path mapping:
```json
{
  "compilerOptions": {
    "paths": {
      "@prisma/client": ["./prisma/generated/client"]
    }
  }
}
```

### Issue 2: Container Crashes - "Database Connection Failed"

**Symptoms**: Logs show database connection timeouts

**Solutions**:
1. Verify `DATABASE_URL` is correct
2. Ensure database allows connections from Koyeb's IP ranges
3. Check if database is publicly accessible
4. For Supabase: Use **Direct connection** string, not pooler

### Issue 3: Health Check Fails

**Symptoms**: Service shows as "Unhealthy"

**Solutions**:
1. Increase health check initial delay to `90` seconds
2. Verify port `8000` is exposed correctly
3. Check if Prisma migrations are completing successfully
4. Review runtime logs for errors

### Issue 4: Port Binding Error

**Symptoms**: "Port already in use" or "EADDRINUSE"

**Solution**: Ensure:
- `PORT` environment variable is set to `8000` in Koyeb
- Your `main.ts` uses `process.env.PORT`:
  ```typescript
  await app.listen(process.env.PORT ?? 4000);
  ```

### Issue 5: Prisma Migrations Fail

**Symptoms**: "Migration failed" in logs

**Solutions**:
1. Run migrations manually from local machine first:
   ```bash
   DATABASE_URL="your-production-db-url" npx prisma migrate deploy
   ```
2. Ensure database user has CREATE/ALTER permissions
3. Check if schema is compatible with PostgreSQL version

---

## 📈 Monitoring & Scaling

### View Metrics

In Koyeb dashboard:
- **CPU Usage**: Monitor application performance
- **Memory Usage**: Ensure instance size is adequate
- **Request Rate**: Track API traffic
- **Response Time**: Monitor latency

### Scaling

To handle more traffic:

1. **Vertical Scaling**: Upgrade instance type
   - nano → micro → small → medium

2. **Horizontal Scaling**: Increase instance count
   - Set max instances to 2+ for auto-scaling
   - Koyeb automatically load balances

---

## 💰 Pricing Considerations

### Free Tier
- **Nano instance**: Free tier available
- **Limitations**: 
  - Limited CPU/memory
  - May sleep after inactivity
  - Suitable for development/testing

### Paid Tiers
- **Micro**: ~$5/month - Better performance
- **Small**: ~$15/month - Production-ready
- **Custom**: Contact Koyeb for enterprise needs

**Note**: Database costs are separate (from your database provider)

---

## 🔒 Security Best Practices

### 1. Use Secrets for Sensitive Data
- Always use **Secret** type for:
  - `DATABASE_URL`
  - `SUPABASE_KEY`
  - Any API keys or tokens

### 2. Enable HTTPS
- Koyeb provides free SSL certificates
- Always use HTTPS endpoints

### 3. Restrict Database Access
- Configure database firewall to allow only Koyeb IPs
- Use strong database passwords
- Enable SSL for database connections

### 4. Environment Isolation
- Use separate databases for staging/production
- Never use production credentials in development

---

## 📝 Deployment Checklist

Before deploying:

- [ ] Code pushed to GitHub
- [ ] External PostgreSQL database created
- [ ] Database connection string obtained
- [ ] Supabase project created (if using)
- [ ] All environment variables documented
- [ ] `.env` file NOT committed to Git
- [ ] Dockerfile tested locally
- [ ] Prisma migrations tested
- [ ] Health check endpoint working

During deployment:

- [ ] GitHub connected to Koyeb
- [ ] Repository selected
- [ ] Dockerfile builder chosen
- [ ] All environment variables configured
- [ ] Port set to 8000
- [ ] Health checks configured
- [ ] Instance type selected
- [ ] Region selected

After deployment:

- [ ] Build logs reviewed
- [ ] Runtime logs checked
- [ ] API endpoint tested
- [ ] Documentation accessible
- [ ] Database migrations completed
- [ ] Custom domain configured (optional)
- [ ] Auto-deployment enabled

---

## 🎯 Quick Deploy Summary

**TL;DR - Fastest Path to Deployment:**

1. **Push code to GitHub**
2. **Create external PostgreSQL database** (Supabase recommended)
3. **Go to Koyeb** → Create Web Service
4. **Select GitHub** → Choose your repo
5. **Select Dockerfile** builder
6. **Add environment variables**:
   - `PORT=8000`
   - `DATABASE_URL=your-db-url`
   - `SUPABASE_URL=your-url`
   - `SUPABASE_KEY=your-key`
7. **Set port to 8000**
8. **Click Deploy**
9. **Wait 2-3 minutes**
10. **Access your API** at the provided Koyeb URL!

---

## 📚 Additional Resources

- **Koyeb Documentation**: https://www.koyeb.com/docs
- **Koyeb Docker Guide**: https://www.koyeb.com/docs/deploy/dockerfiles
- **Koyeb CLI**: https://www.koyeb.com/docs/cli
- **Supabase Docs**: https://supabase.com/docs
- **Prisma Deployment**: https://www.prisma.io/docs/guides/deployment

---

## 🆘 Need Help?

- **Koyeb Support**: support@koyeb.com
- **Koyeb Community**: https://community.koyeb.com
- **Koyeb Discord**: https://discord.gg/koyeb

---

**🎉 Congratulations!** Your Atlas API is now deployed on Koyeb and accessible worldwide!
