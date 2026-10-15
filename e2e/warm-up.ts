import { chromium, type FullConfig } from "@playwright/test";

/**
 * Loads the app once before the parallel tests start. On a cold server the
 * first wave of concurrent page loads can stall on static chunks for long
 * enough to trip assertions; one sequential visit avoids that.
 */
export default async function warmUp(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.request.post(`${baseURL}/api/assistant/proposals`, {
      data: { message: "warm up", timeZone: "UTC", locale: "en", clientRequestId: crypto.randomUUID() },
    });
  } finally {
    await browser.close();
  }
}
