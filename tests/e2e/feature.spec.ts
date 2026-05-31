import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

/**
 * Load-bearing cross-peer assertion for the advertised core action:
 * "every phone publishes its BPM into the mesh; all phones glow together at
 * the room's average BPM."
 *
 * The camera/torch finger-pulse sensor cannot be driven from two headless
 * browsers, so we drive the manual-BPM fallback — which writes the entered
 * value into the EXACT SAME y-webrtc awareness `hr` field the camera path
 * publishes. We arm peer A, log a BPM there, and assert the OPPOSITE peer B
 * sees that value as its room average. That proves the reading genuinely
 * propagates across the mesh, sensor or no sensor.
 */
test("a manual BPM logged on peer A shows up as room average on peer B", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    // Arm both peers so each instantiates its WebrtcProvider (and thus its
    // awareness channel). Headless Chrome has no rear camera, but the mesh
    // room is keyed on `armed`, not on camera readiness.
    await a.getByRole("button", { name: /allow camera/i }).click();
    await b.getByRole("button", { name: /allow camera/i }).click();

    // Before A logs anything, B's room average is empty.
    await expect(b.getByTestId("room-bpm")).toContainText("room avg: — BPM");

    // Peer A logs a distinctive BPM by hand.
    const manualInput = a.getByRole("spinbutton", { name: /enter bpm manually/i });
    await manualInput.fill("123");
    await a.getByRole("button", { name: /log bpm manually/i }).click();

    // Peer A reflects its own published reading immediately.
    await expect(a.getByTestId("local-bpm")).toContainText("123");

    // The load-bearing cross-peer assertion: peer B's room average — computed
    // purely from awareness state it received over the mesh — now reads 123.
    await expect(b.getByTestId("room-bpm")).toContainText("room avg: 123 BPM", {
      timeout: 15_000,
    });
  } finally {
    await cleanup();
  }
});
