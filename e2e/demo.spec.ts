import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = (process.env.BASE_URL || 'https://get-me-an-alt.vercel.app').replace(
  /\/+$/,
  ''
);
const DEMO_PROJECT_ID = process.env.DEMO_PROJECT_ID || 'plant-auto-waterer';
const PACE_SCALE = Number(process.env.DEMO_PACE_SCALE ?? 1);
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const MARKERS_FILE = path.join(__dirname, 'test-results', 'markers.json');

test.use({
  video: {
    mode: 'on',
    size: { width: 1920, height: 1080 },
  },
  viewport: { width: 1920, height: 1080 },
});

async function pause(page: Page, ms: number): Promise<void> {
  const scaled = Math.max(50, Math.round(ms * PACE_SCALE));
  await page.waitForTimeout(scaled);
}

async function saveStepScreenshot(page: Page, name: string): Promise<void> {
  if (process.env.SAVE_STEP_SCREENSHOTS !== '1') {
    return;
  }
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
    await page.screenshot({
      path: filePath,
      fullPage: false,
      animations: 'allow',
      timeout: 3000,
    });
  } catch (err) {
    console.warn(`[demo.spec] Could not capture screenshot ${name}:`, err);
  }
}

let testStartMs = Date.now();
function elapsedSecNum(): number {
  return Number(((Date.now() - testStartMs) / 1000).toFixed(2));
}
function elapsedSec(): string {
  return ((Date.now() - testStartMs) / 1000).toFixed(1);
}

async function safeStep(
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    console.log(`[demo.spec +${elapsedSec()}s] ==> START ${label}`);
    await fn();
    console.log(`[demo.spec +${elapsedSec()}s] <== DONE  ${label}`);
  } catch (err) {
    console.warn(
      `[demo.spec +${elapsedSec()}s] !!! SKIP "${label}":`,
      err instanceof Error ? err.message : err
    );
  }
}

async function smoothScrollTo(page: Page, y: number, pauseMs = 700): Promise<void> {
  try {
    await page.evaluate((targetY) => {
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }, y);
    await pause(page, pauseMs);
  } catch {
    // ignore scroll errors
  }
}

test.describe('Get Me An Alt — Full Story Screen Recording Walkthrough (v3 · 60s Cut)', () => {
  test('walks Renaissance landing -> preset/link -> Mission Control 9-agent DAG -> BOM -> PrintPanel -> IKEA 3D & Exploded View -> Ask Argon Modify', async ({
    page,
  }) => {
    testStartMs = Date.now();
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(MARKERS_FILE), { recursive: true });

    const markers: Record<string, number> = {
      t0: 0,
      tMissionStart: 10.0,
      tBomStart: 32.0,
      tThreeStart: 50.0,
      tModifyStart: 64.0,
      tEnd: 78.0,
    };

    // =========================================================================
    // SEGMENT 1 (0s - 8s in video): RENAISSANCE LANDING, PASTE URL & CODEX PRESETS
    // =========================================================================
    await safeStep('1. Open Renaissance Workshop Landing Hero', async () => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toBeVisible();
      await pause(page, 1200);
      await saveStepScreenshot(page, '01-landing-hero');
    });

    await safeStep('2. Paste Product Link, Select Printer, Scroll Sketch-to-Reality & Presets', async () => {
      const heroInput = page
        .getByPlaceholder(/Paste product link|describe a gadget/i)
        .first()
        .or(page.locator('input[type="text"]').first());

      if (await heroInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await heroInput
          .fill(
            'https://www.amazon.com/s?k=smart+automatic+plant+watering+system+reservoir',
            { force: true }
          )
          .catch(() => {});
        await pause(page, 700);
      }

      // Inspect target printer dropdown on landing hero
      const landingPrinterSelect = page.locator('form select').first();
      if (
        await landingPrinterSelect.isVisible({ timeout: 1500 }).catch(() => false)
      ) {
        await landingPrinterSelect
          .selectOption('bambu-a1-mini', { force: true })
          .catch(() => {});
        await pause(page, 450);
        await landingPrinterSelect
          .selectOption('bambu-a1', { force: true })
          .catch(() => {});
        await pause(page, 450);
      }

      // Scroll through Da Vinci Folios: 7-stage study, 83% ledger, Sketch-to-Reality 3D, and Codex Presets
      await smoothScrollTo(page, 720, 800);
      await smoothScrollTo(page, 1550, 900);
      await smoothScrollTo(page, 2350, 1000);
      await smoothScrollTo(page, 3050, 1000);

      // Hover preset cards (Robot Arm / Bladeless Fan / Camera Slider / Art Easel / Plant Waterer)
      const easelCard = page
        .getByRole('button', { name: /Robot Arm|Bladeless|Camera Slider|Art Easel/i })
        .first();
      if (await easelCard.isVisible({ timeout: 1200 }).catch(() => false)) {
        await easelCard.hover().catch(() => {});
        await pause(page, 600);
      }

      const watererCard = page
        .getByRole('button', { name: /Smart Plant Auto-Waterer/i })
        .first();
      if (await watererCard.isVisible({ timeout: 1200 }).catch(() => false)) {
        await watererCard.hover().catch(() => {});
        await pause(page, 500);
      }

      await saveStepScreenshot(page, '02-paste-product-link');
    });

    // =========================================================================
    // SEGMENT 2 (8s - 19s in video, ~3-4x speed): MISSION CONTROL 9-AGENT DAG, CRITIC & TEARDOWN
    // =========================================================================
    await safeStep('3. Open Showcase Project & Watch Mission Control 9-Agent DAG Light Up', async () => {
      await page.goto(`${BASE_URL}/projects/${DEMO_PROJECT_ID}`, {
        waitUntil: 'domcontentloaded',
      });
      markers.tMissionStart = elapsedSecNum();
      await pause(page, 1600);

      const missionSection = page
        .locator('section[aria-label*="Mission Control"]')
        .first();

      if (await missionSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        await smoothScrollTo(page, 160, 700);

        // Trigger 2x speed or Replay if already finished so the 9-agent DAG lights up vividly
        const replayBtn = missionSection
          .getByRole('button', { name: /Replay/i })
          .first();
        if (await replayBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await replayBtn.click().catch(() => {});
        }

        // Watch agents light up across the DAG (Analyst -> Researcher -> Teardown -> Designer <-> Critic -> BOM/Price Hunter/CAD -> Instructions)
        await pause(page, 4200);

        // Click key agent nodes to inspect thoughts & artifacts
        for (const pattern of [/03\s*Teardown|Teardown/i, /05\s*Critic|Critic/i, /08\s*CAD|CAD/i]) {
          const nodeBtn = missionSection
            .getByRole('button', { name: pattern })
            .first();
          if (await nodeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await nodeBtn.click().catch(() => {});
            await pause(page, 700);
          }
        }
      }

      await saveStepScreenshot(page, '03-mission-control-timeline');
    });

    await safeStep('4. Inspect Printability Critic & Video Teardown Gallery', async () => {
      // Scroll to CritiquePanel on Overview tab (2-round Critic -> Designer loop)
      await smoothScrollTo(page, 950, 900);
      const round1Btn = page.getByRole('button', { name: /Round 1/i }).first();
      const round2Btn = page.getByRole('button', { name: /Round 2/i }).first();
      if (await round1Btn.isVisible({ timeout: 800 }).catch(() => false)) {
        await round1Btn.click().catch(() => {});
        await pause(page, 600);
      }
      if (await round2Btn.isVisible({ timeout: 800 }).catch(() => false)) {
        await round2Btn.click().catch(() => {});
        await pause(page, 600);
      }

      // Open Sources tab briefly to show Video Teardown frames + part callouts
      await smoothScrollTo(page, 620, 500);
      const sourcesTab = page.getByRole('button', { name: /^Sources/i }).first();
      if (await sourcesTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sourcesTab.click();
        await pause(page, 1000);
        await smoothScrollTo(page, 820, 900);
      }
      await saveStepScreenshot(page, '05-sources-teardown-tab');
    });

    // =========================================================================
    // SEGMENT 3 (19s - 32s in video): BOM & 83% SAVINGS + PRINT PLATES, 3MF & PRINT SERVICE
    // =========================================================================
    markers.tBomStart = elapsedSecNum();
    await safeStep('5. Explore BOM & Retailer Links ($149 -> $24.85, Save 83%)', async () => {
      await smoothScrollTo(page, 620, 500);
      const bomTab = page.getByRole('button', { name: /^BOM/i }).first();
      if (await bomTab.isVisible({ timeout: 2500 }).catch(() => false)) {
        await bomTab.click();
        await pause(page, 1200);
      }

      await smoothScrollTo(page, 780, 1100);

      // Hover retailer links (Amazon, Home Depot, Walmart, McMaster)
      const retailerLinks = page
        .locator('a')
        .filter({ hasText: /Amazon|Home Depot|Walmart|McMaster|AliExpress/i });
      const linkCount = await retailerLinks.count().catch(() => 0);
      for (let i = 0; i < Math.min(3, linkCount); i++) {
        await retailerLinks.nth(i).hover().catch(() => {});
        await pause(page, 500);
      }

      await smoothScrollTo(page, 1080, 1000);
      await saveStepScreenshot(page, '06-bom-savings-tab');
    });

    await safeStep('6. Explore Print Files: 3MF Plates, Printer Switch & Print Service', async () => {
      await smoothScrollTo(page, 620, 500);
      const printTab = page.getByRole('button', { name: /^Print Files/i }).first();
      if (await printTab.isVisible({ timeout: 2500 }).catch(() => false)) {
        await printTab.click();
        await pause(page, 1200);
      }

      await smoothScrollTo(page, 920, 900);

      const printerSelect = page
        .getByTestId('printer-select')
        .or(page.locator('#printer-select'))
        .first();

      if (await printerSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await printerSelect.scrollIntoViewIfNeeded().catch(() => {});
        await pause(page, 400);
        await printerSelect.selectOption('bambu-a1-mini').catch(() => {});
        await pause(page, 1000);
        await printerSelect.selectOption('prusa-mk4s').catch(() => {});
        await pause(page, 1000);
        await printerSelect.selectOption('bambu-a1').catch(() => {});
        await pause(page, 900);
      }

      await smoothScrollTo(page, 1180, 1000);
      await saveStepScreenshot(page, '07-print-files-plates');

      // Show "No printer? Get it printed" quote handoff
      const inlineNoPrinterCard = page
        .getByTestId('no-printer-card')
        .or(page.getByText(/No printer\? Get it printed/i))
        .first();

      if (await inlineNoPrinterCard.isVisible({ timeout: 2000 }).catch(() => false)) {
        await inlineNoPrinterCard.scrollIntoViewIfNeeded().catch(() => {});
        await pause(page, 800);

        const jlcBtn = page
          .getByTestId('service-option-jlc3dp')
          .or(page.getByRole('button', { name: /JLC3DP/i }))
          .first();
        if (await jlcBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
          await jlcBtn.click().catch(() => {});
          await pause(page, 800);
        }

        const craftcloudBtn = page
          .getByTestId('service-option-craftcloud')
          .or(page.getByRole('button', { name: /Craftcloud/i }))
          .first();
        if (await craftcloudBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
          await craftcloudBtn.click().catch(() => {});
          await pause(page, 800);
        }
        await saveStepScreenshot(page, '08-print-service-quote');
      }
    });

    // =========================================================================
    // SEGMENT 4 (32s - 41s in video): THREE.JS IKEA ASSEMBLY PLAYER & EXPLODED 3D VIEW
    // =========================================================================
    markers.tThreeStart = elapsedSecNum();
    await safeStep('7. Play Three.js IKEA-Style Animated Assembly Player', async () => {
      await smoothScrollTo(page, 620, 500);
      const instructionsTab = page
        .getByRole('button', { name: /^Instructions/i })
        .first();
      if (await instructionsTab.isVisible({ timeout: 2500 }).catch(() => false)) {
        await instructionsTab.click();
        await pause(page, 1400);
      }

      const assemblyPlayer = page.getByTestId('assembly-player').first();
      if (await assemblyPlayer.isVisible({ timeout: 2000 }).catch(() => false)) {
        await assemblyPlayer.scrollIntoViewIfNeeded().catch(() => {});
      } else {
        await smoothScrollTo(page, 780, 700);
      }

      const playPauseBtn = page
        .getByTestId('play-pause-btn')
        .or(page.getByRole('button', { name: /▶ Play|⏸ Pause/i }))
        .first();

      if (await playPauseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        const txt = (await playPauseBtn.textContent()) || '';
        if (txt.includes('Play')) {
          await playPauseBtn.click().catch(() => {});
        }
        await pause(page, 2000);

        const nextStepBtn = page.getByTestId('next-step-btn').first();
        if (await nextStepBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
          for (let s = 0; s < 3; s++) {
            await nextStepBtn.click().catch(() => {});
            await pause(page, 1000);
          }
        }
      }
      await saveStepScreenshot(page, '09-instructions-ikea-player');
    });

    await safeStep('8. Explore Interactive Three.js Exploded 3D View', async () => {
      await smoothScrollTo(page, 620, 500);
      const explodedTab = page
        .getByRole('button', { name: /^Exploded View/i })
        .first();
      if (await explodedTab.isVisible({ timeout: 2500 }).catch(() => false)) {
        await explodedTab.click();
        await pause(page, 1400);
      }

      const explodedView = page.getByTestId('exploded-view').first();
      if (await explodedView.isVisible({ timeout: 2000 }).catch(() => false)) {
        await explodedView.scrollIntoViewIfNeeded().catch(() => {});
      } else {
        await smoothScrollTo(page, 780, 700);
      }

      const explodeSlider = page
        .getByTestId('explode-slider')
        .or(page.locator('input[type="range"][aria-label*="Explode" i]'))
        .first();

      if (await explodeSlider.isVisible({ timeout: 2000 }).catch(() => false)) {
        for (const val of ['0.35', '0.80', '1', '0.55']) {
          await explodeSlider.fill(val).catch(async () => {
            await explodeSlider.evaluate((el, v) => {
              const input = el as HTMLInputElement;
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              )?.set;
              nativeInputValueSetter?.call(input, v);
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }, val);
          });
          await pause(page, 700);
        }
      }

      // Orbit 3D canvas
      const canvas = page.locator('canvas').first();
      if (await canvas.isVisible({ timeout: 1500 }).catch(() => false)) {
        const box = await canvas.boundingBox();
        if (box && box.width > 100 && box.height > 100) {
          const startX = box.x + box.width * 0.45;
          const startY = box.y + box.height * 0.45;
          await page.mouse.move(startX, startY);
          await page.mouse.down();
          for (let step = 1; step <= 12; step++) {
            await page.mouse.move(startX + step * 14, startY - step * 4);
            await page.waitForTimeout(40);
          }
          await page.mouse.up();
          await pause(page, 900);
        }
      }

      // Click part chips to highlight 3D mesh & inspect BOM
      const partChips = page.locator('[data-testid^="part-chip-"]');
      const chipCount = await partChips.count().catch(() => 0);
      for (const idx of [0, 2]) {
        if (idx < chipCount) {
          await partChips.nth(idx).click().catch(() => {});
          await pause(page, 850);
        }
      }

      await saveStepScreenshot(page, '10-exploded-3d-view');
    });

    // =========================================================================
    // SEGMENT 5 (41s - 50s in video): ASK ARGON TO MODIFY ("make it 20% taller")
    // =========================================================================
    markers.tModifyStart = elapsedSecNum();
    await safeStep('9. Ask Argon to Modify: "make it 20% taller"', async () => {
      const modifySection = page
        .locator('section[aria-label*="Ask Argon to Modify"]')
        .first();

      if (await modifySection.isVisible({ timeout: 3000 }).catch(() => false)) {
        await modifySection.scrollIntoViewIfNeeded().catch(() => {});
        await pause(page, 800);

        const modifyInput = modifySection
          .locator('input[aria-label="Ask Argon to modify this project"]')
          .or(modifySection.locator('input[type="text"]'))
          .first();

        if (await modifyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await modifyInput.fill('make it 20% taller');
          await pause(page, 900);

          const askBtn = modifySection
            .getByRole('button', { name: /Ask Argon/i })
            .first();
          if (await askBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
            await askBtn.click();
          }

          // Wait for selective agent routing stream and Modification Diff Summary card
          await page
            .getByText(/Modification Diff Summary/i)
            .first()
            .waitFor({ state: 'visible', timeout: 15000 })
            .catch(() => {});

          await pause(page, 2600);
          await saveStepScreenshot(page, '11-ask-argon-modify-diff');
        }
      }
    });

    markers.tEnd = elapsedSecNum();
    try {
      fs.writeFileSync(MARKERS_FILE, JSON.stringify(markers, null, 2));
      console.log('[demo.spec] Wrote timing markers:', JSON.stringify(markers));
    } catch (err) {
      console.warn('[demo.spec] Could not write markers.json:', err);
    }
  });
});
