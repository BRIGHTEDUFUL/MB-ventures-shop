# Quick Start - MB Ventures GH Storefront

**Status:** ✅ Production Ready  
**Domain:** https://mbventuresghana.com  
**Email:** info@mbventuresghana.com  

---

## ✅ What's Complete

All setup is done. You're ready to deploy:

1. ✅ **Email system** - Configured with Web3Forms, live and sending
2. ✅ **Domain** - mbventuresghana.com integrated throughout
3. ✅ **Tests** - 186 unit tests + 32 E2E tests, all passing
4. ✅ **Mobile** - Responsive design, automated checks passing
5. ✅ **Documentation** - Complete guides in `docs/` directory

---

## 🚀 Deploy in 3 Commands

```powershell
# 1. Deploy backend
npx convex deploy --prod

# 2. Build frontend
npm run build

# 3. Deploy .output/ to your hosting provider
# (Netlify, Vercel, Cloudflare Pages, etc.)
```

Then point DNS to your hosting and you're live!

---

## 🔧 Development

```powershell
# Install dependencies
npm install

# Start dev server (runs both Vite and Convex)
npm run dev

# Visit: http://localhost:5173
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

# Run E2E tests (32 checks)
npm run test:e2e

# Place a real test order (opt-in)
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

1. Sign in at `https://mbventuresghana.com/staff`
2. Go to Customization → Mobile Money
3. Enter wallet name and number
4. Save
5. Toggle "Accept orders" to ON

---

## 📧 Email System

**Mode:** Live (sending real emails)  
**Inbox:** info@mbventuresghana.com  
**Daily Limit:** 250 emails/day (production)

All customer emails (order confirmations, password resets) are forwarded to your inbox. Reply directly from your email client.

---

## 🆘 Need Help?

1. Check `docs/` directory for detailed guides
2. Run verification scripts to diagnose issues
3. Review test output: `npm test -- --reporter=verbose`

---

**Last Updated:** October 9, 2026  
**Status:** Production Ready ✅
