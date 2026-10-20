# Quick Start - MB Ventures GH Storefront

**Status:** ✅ Production Ready  
**Domain:** https://mbventuresgh.com  
**Email:** info@mbventuresgh.com

---

## ✅ What's Complete

Everything is set up and the store is live (https://mbventuresgh.com):

1. ✅ **Email system** - Configured with Web3Forms, live and sending
2. ✅ **Domain** - mbventuresgh.com integrated throughout
3. ✅ **Tests** — Vitest suite + Playwright read-only and live suites, all passing (current counts in AGENTS.md §7)
4. ✅ **Mobile** - Responsive design, automated checks passing
5. ✅ **Documentation** - Complete guides in `docs/` directory

---

## 🚀 Deploy in 3 Commands

```powershell
# 1. Deploy backend (prod Convex)
npx convex deploy --env-file .env.prod.local

# 2. Commit first, then archive the committed tree
node scripts/pack-deploy.mjs

# 3. Upload -> server-side build -> publish (Hostinger API)
node scripts/deploy-hostinger-api.mjs
```

The GitHub Actions deploy step is not configured (`HOSTINGER_*` secrets missing) —
the script above is the production deploy path.

---

## 🔧 Development

```powershell
# Install dependencies
npm install

# Start dev server (runs both Vite and Convex)
npm run dev

# Visit: http://localhost:8080
```

---

## 📊 Verify Everything Works

```powershell
# Check email configuration
node scripts/verify-email-config.mjs

# Check production configuration
node scripts/verify-production-config.mjs

# Run all tests
npm test

# Run E2E tests (read-only)
npm run test:e2e

# Prepare the dev deployment, then run the live suite (opt-in, self-cleaning)
node scripts/setup-dev-e2e.mjs
npm run test:e2e:live
```

---

## 📚 Documentation

- **`DEPLOYMENT-READY.md`** - Full deployment guide ⭐ Start here
- **`docs/PRODUCTION-CONFIG.md`** - Production configuration details
- **`docs/EMAIL.md`** - Email system documentation
- **`README.md`** - Project overview
- **`roadmap.md`** - Feature status

---

## 🎯 Enable Ordering

Once deployed:

1. Sign in at `https://mbventuresgh.com/staff`
2. Go to Customization → Ordering
3. Toggle "Accept orders" to ON

Payments: pickup orders pay at the shop counter, delivery orders pay cash on
arrival, and — when the staff switch is on — shoppers can pay online through
Paystack's hosted checkout. The shop never adds a delivery fee; riders collect
theirs from the customer directly.

---

## 📧 Email System

**Mode:** Live (sending real emails)  
**Inbox:** info@mbventuresgh.com  
**Plan limit:** 250 emails/month (Web3Forms free plan)

All customer emails (order confirmations, password resets) are forwarded to your inbox. Reply directly from your email client.

---

## 🆘 Need Help?

1. Check `docs/` directory for detailed guides
2. Run verification scripts to diagnose issues
3. Review test output: `npm test -- --reporter=verbose`

---

**Last Updated:** October 20, 2026  
**Status:** Production Ready ✅
