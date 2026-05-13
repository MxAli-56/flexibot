# 🤖 FlexiBot: Multi-Tenant Agentic AI Platform

FlexiBot is a professional-grade AI chatbot ecosystem designed for business automation. Its flagship implementation is **Smile Care AI**, a specialized dental receptionist.

## 🚀 Key Features
- **Multi-Tenant Admin Dashboard:** Onboard new clinics with unique Client IDs and custom system prompts.
- **Agentic Logic:** Handles complex appointment booking with real-time doctor availability checks and automated email notifications.
- **High-Performance AI:** Primary engine powered by **Qwen 2.5-72B** with a robust fallback system.
- **Dynamic Web Integration:** A "Zero-Flicker" injection script (`embed.js`) that adapts to any host website theme.
- **Uptime Monitoring:** Production-ready deployment with 100% service availability via UptimeRobot.

## 🛠️ Tech Stack
- **Backend:** Node.js, Express, MongoDB Atlas (Deployed on Render)
- **Frontend:** Vercel, JavaScript (Zero-Flicker Embed Strategy)
- **Intelligence:** Qwen 2.5 & Mistral (via DeepInfra), Brevo API
- **Monitoring:** UptimeRobot

## 📅 Lead Generation & Booking
The system features a sophisticated 18-block post-processing engine that cleans AI output and enforces strict validation for:
- Phone & Date formats (Pakistani mobile number support).
- Doctor shift hours and Sunday closures.
- Dynamic session management for abandoned leads.

---
**Live Demo:** [https://smile-care-dental-lovat.vercel.app/](https://smile-care-dental-lovat.vercel.app/)
