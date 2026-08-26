import { expect, test, type Page } from "@playwright/test";

async function launchAt(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  const primary = page.getByRole("button", { name: /allow camera & start pulse/i });
  await expect(primary).toBeVisible();
  const box = await primary.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height);

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.scrollHeight).toBe(geometry.clientHeight);
}

test("launch keeps camera permission behind the explicit pulse action", async ({ page }) => {
  await page.addInitScript(() => {
    const calls = { count: 0 };
    Object.defineProperty(window, "__pulsePhotoCameraCalls", {
      value: calls,
      configurable: true,
    });
    const mediaDevices = navigator.mediaDevices ?? ({} as MediaDevices);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        ...mediaDevices,
        getUserMedia: () => {
          calls.count += 1;
          return Promise.reject(new DOMException("Blocked by test", "NotAllowedError"));
        },
      },
    });
  });

  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __pulsePhotoCameraCalls: { count: number } })
            .__pulsePhotoCameraCalls.count,
      ),
    )
    .toBe(0);

  await page.getByRole("button", { name: /allow camera & start pulse/i }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __pulsePhotoCameraCalls: { count: number } })
            .__pulsePhotoCameraCalls.count,
      ),
    )
    .toBe(1);
  await expect(page.getByRole("spinbutton", { name: /enter bpm manually/i })).toBeVisible();
});

test("launch action stays visible without viewport overflow on phone and desktop", async ({
  page,
}) => {
  await launchAt(page, 390, 844);
  await launchAt(page, 1141, 602);
});
