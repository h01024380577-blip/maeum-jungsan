import express from "express";
import next from "next";
import path from "path";
import dotenv from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as cheerio from "cheerio";
import webpush from "web-push";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

// Initialize Firebase Admin
let db: any = null;
try {
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0250392989"
  });
  db = getFirestore();
} catch (e) {
  console.error("Firebase Admin initialization failed:", e);
}

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEm-p0mLRpFUf2KCCAkXssryxXSt-ubluosgR0psGehl7CYzQ1G7Hmflix7wWdQnDRdp7OjjwKr3MlBarGYDwDo';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'dwqWMRJ5IPXPRgg4ueiMTEIrX2UBwLUghfVoj9qOZ4U';

webpush.setVapidDetails(
  'mailto:h01024380577@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

puppeteer.use(StealthPlugin());

const PORT = 3000;

nextApp.prepare().then(() => {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // API routes
  app.post("/api/scrape", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=375,812"],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
      await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1");
      
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      // Wait for content to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));

      const extractedText = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script, style, iframe, noscript, nav, footer');
        scripts.forEach(s => s.remove());
        return document.body.innerText.replace(/\s+/g, " ").trim();
      });

      let screenshot = null;
      if (!extractedText || extractedText.length < 100) {
        screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
      }

      res.json({ 
        text: extractedText,
        screenshot: screenshot ? `data:image/png;base64,${screenshot}` : null
      });
    } catch (error: any) {
      console.error("Scraping failed:", error);
      res.status(500).json({ error: "Failed to scrape URL", details: error.message });
    } finally {
      if (browser) await browser.close();
    }
  });

  app.get("/api/cron/notify", async (req, res) => {
    if (!db) return res.status(500).json({ error: "Database not initialized" });

    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const entriesSnapshot = await db.collection('entries')
        .where('date', '==', tomorrowStr)
        .get();

      if (entriesSnapshot.empty) {
        return res.json({ message: "No events for tomorrow" });
      }

      const notifications = [];

      for (const entryDoc of entriesSnapshot.docs) {
        const entry = entryDoc.data();
        const userId = entry.userId;

        const subDoc = await db.collection('subscriptions').doc(userId).get();
        if (!subDoc.exists) continue;

        const subscription = subDoc.data();
        const pushConfig = {
          endpoint: subscription.endpoint,
          keys: subscription.keys
        };

        const eventName = entry.eventType === 'other' ? entry.customEventName : 
                          entry.eventType === 'wedding' ? '결혼식' :
                          entry.eventType === 'funeral' ? '장례식' : '생일';

        const payload = JSON.stringify({
          title: `💡 내일은 ${entry.targetName}님의 ${eventName} 날이에요!`,
          body: `잊지 말고 축하 메시지나 마음을 전해보세요. (AI 추천 금액: 100,000원)`,
          url: `/contacts/${entry.contactId}`
        });

        notifications.push(
          webpush.sendNotification(pushConfig, payload)
            .catch(async (err) => {
              if (err.statusCode === 410 || err.statusCode === 404) {
                console.log(`Subscription for user ${userId} is gone. Cleaning up.`);
                await db.collection('subscriptions').doc(userId).delete();
              } else {
                console.error(`Error sending push to user ${userId}:`, err);
              }
            })
        );
      }

      await Promise.all(notifications);
      res.json({ message: `Sent ${notifications.length} notifications` });
    } catch (error: any) {
      console.error("Cron job failed:", error);
      res.status(500).json({ error: "Cron job failed", details: error.message });
    }
  });

  app.post("/api/test-push", async (req, res) => {
    const { subscription, title, body } = req.body;
    if (!subscription) return res.status(400).json({ error: "Subscription is required" });

    try {
      const payload = JSON.stringify({
        title: title || "🔔 테스트 알림",
        body: body || "푸시 알림 테스트입니다. 정상적으로 수신되었습니다!",
        url: "/"
      });

      await webpush.sendNotification(subscription, payload);
      res.json({ success: true, message: "Test notification sent" });
    } catch (error: any) {
      console.error("Test push failed:", error);
      res.status(500).json({ error: "Test push failed", details: error.message });
    }
  });

  // Handle all other requests with Next.js
  app.all("*", (req, res) => {
    return handle(req, res);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`> Ready on http://0.0.0.0:${PORT}`);
  });
});
