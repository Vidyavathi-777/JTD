# NGO Donation Platform
> Razorpay + Supabase + Nodemailer | Vercel Deployment | One-Time & Recurring Donations

---

## 📁 Project Structure

```
ngo-final/
├── api/index.js                   ← Vercel entry point (Express app)
├── config/
│   ├── razorpay.js
│   ├── supabase.js
│   └── mailer.js
├── controllers/
│   ├── donationController.js
│   └── subscriptionController.js
├── emails/templates.js
├── routes/donation.js
├── routes/subscription.js
├── middleware/validateWebhook.js
├── webhooks/razorpayWebhook.js
├── public/index.html              ← Frontend (served by backend)
├── supabase-schema.sql
├── vercel.json
└── .env.example
```

---

## 🚀 Setup Guide

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste the entire `supabase-schema.sql` → Run
3. Copy your **Project URL** and **service_role key** (Settings → API)

### 3. Set up Razorpay
1. Sign up at [razorpay.com](https://razorpay.com)
2. Go to **Settings → API Keys** → generate test keys
3. Go to **Settings → Webhooks** → add a webhook:
   - URL: `https://your-app.vercel.app/webhook/razorpay`
   - Secret: any strong random string (save this)
   - Events to subscribe:
     - `payment.failed`
     - `subscription.charged`
     - `subscription.cancelled`
     - `subscription.paused`
     - `subscription.resumed`

### 4. Configure environment variables

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

For Gmail SMTP:
1. Enable 2FA on your Google account
2. Go to Google Account → Security → App Passwords
3. Generate an App Password for "Mail"
4. Use that 16-character password as `SMTP_PASS`

### 5. Run locally
```bash
npm run dev
# Visit http://localhost:3000
```

### 6. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables on Vercel dashboard or via CLI:
vercel env add RAZORPAY_KEY_ID
vercel env add RAZORPAY_KEY_SECRET
vercel env add RAZORPAY_WEBHOOK_SECRET
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add SMTP_HOST
vercel env add SMTP_PORT
vercel env add SMTP_SECURE
vercel env add SMTP_USER
vercel env add SMTP_PASS
vercel env add MAIL_FROM
vercel env add NGO_NAME
vercel env add APP_URL

# Redeploy after adding env vars
vercel --prod
```

---

## 🔗 API Endpoints

### One-Time Donation
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/donation/order` | Create Razorpay order |
| `POST` | `/api/donation/verify` | Verify payment + send email |

**Create Order body:**
```json
{
  "name": "Rahul Kumar",
  "email": "rahul@example.com",
  "phone": "9876543210",
  "amount": 500,
  "message": "Keep up the great work!"
}
```

### Recurring Subscription
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/subscription/create` | Create Razorpay subscription |
| `POST` | `/api/subscription/verify` | Verify first payment + send welcome email |
| `POST` | `/api/subscription/cancel/:subscriptionId` | Cancel subscription |

**Create Subscription body:**
```json
{
  "name": "Priya Sharma",
  "email": "priya@example.com",
  "phone": "9876543210",
  "amount": 1000,
  "frequency": "monthly",
  "message": "Happy to support!"
}
```

**frequency options:** `monthly` | `quarterly` | `half_yearly` | `yearly`

### Webhook
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/webhook/razorpay` | Razorpay event handler |

---

## 📧 Emails Sent

| Trigger | Template | Recipient |
|---------|----------|-----------|
| One-time payment verified | Green receipt email | Donor |
| Subscription first payment | Welcome + auto-pay details | Donor |
| Every recurring charge (webhook) | Charge receipt + next date | Donor |

---

## 🗄️ Database Tables

| Table | Purpose |
|-------|---------|
| `donations` | One-time donation records |
| `subscription_plans` | Cached Razorpay plan IDs per frequency+amount |
| `subscriptions` | Active/cancelled subscriptions |
| `subscription_charges` | Every recurring debit event |

---

## ⚠️ Going Live

1. Switch Razorpay keys from **test** to **live** in Vercel env vars
2. Update webhook URL in Razorpay dashboard to production domain
3. Ensure SMTP credentials are production-ready
4. Test end-to-end with a small live payment
