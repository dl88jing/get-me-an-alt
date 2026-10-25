import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const BASE_URL = (process.env.BASE_URL || 'https://get-me-an-alt.vercel.app').replace(
  /\/+$/,
  ''
);

const OUT_ROOT = '/workspace/work/out/e2e';

export interface AnyObjectCase {
  slug: string;
  label: string;
  inputType: 'url' | 'text';
  input: string;
  modifyPrompt: string;
}

export const ANYOBJECT_CASES: AnyObjectCase[] = [
  {
    slug: 'oxo-organizer',
    label: 'OXO Large Expandable Kitchen Tool Drawer Organizer (URL)',
    inputType: 'url',
    input: 'https://www.oxo.com/large-expandable-kitchen-tool-drawer-organizer.html',
    modifyPrompt: 'make it 20% taller',
  },
  {
    slug: 'peak-design-mount',
    label: 'Peak Design Out Front Bike Phone Mount (URL)',
    inputType: 'url',
    input: 'https://www.peakdesign.com/products/out-front-bike-mount',
    modifyPrompt: 'make it 20% taller',
  },
  {
    slug: 'herman-miller-flo',
    label: 'Herman Miller Flo Monitor Arm Support (URL)',
    inputType: 'url',
    input: 'https://store.hermanmiller.com/home-desk-accessories/flo-monitor-support/4545.html?lang=en_US',
    modifyPrompt: 'make it 20% taller',
  },
  {
    slug: 'lego-storage-box',
    label: 'LEGO 4-Stud Black Storage Brick Drawer Box (URL)',
    inputType: 'url',
    input: 'https://www.lego.com/en-us/product/lego-4-stud-black-storage-brick-drawer-5005711',
    modifyPrompt: 'make it 20% taller',
  },
  {
    slug: 'dyson-pure-cool',
    label: 'Dyson Pure Cool fan (Plain Product Name Text)',
    inputType: 'text',
    input: 'Dyson Pure Cool fan',
    modifyPrompt: 'make it 20% taller',
  },
];

interface StepResult {
  step: string;
  status: 'PASS' | 'FAIL';
  durationMs: number;
  screenshot?: string;
  notes?: string;
}

interface AgentTimingRecord {
  id: string;
  name: string;
  status: string;
  durationMs: number;
  runner?: string;
  tokensTotal?: number;
  summary?: string;
}

export interface CaseRunReport {
  slug: string;
  label: string;
  inputType: string;
  input: string;
  projectId: string;
  objectName: string;
  status: 'PASS' | 'FAIL';
  totalPipelineSec: number;
  totalTestSec: number;
  flaggedOver3Min: boolean;
  quota429Retried: boolean;
  steps: StepResult[];
  agentTimings: AgentTimingRecord[];
  artifactsQuality: {
    bomItemsCount: number;
    bomSampleNames: string[];
    retailPrice: number;
    diyCost: number;
    savingsDollars: number;
    savingsPercent: number;
    priceHunterLinksCount: number;
    printedPartsCount: number;
    purchasedPartsCount: number;
    totalPartsCount: number;
    platesCount: number;
    instructionsStepsCount: number;
    sourcesCount: number;
    teardownVideosCount: number;
    teardownFramesCount: number;
    modifySummaryText: string;
  };
  consoleErrors: string[];
  failedNetworkRequests: string[];
  screenshots: string[];
  videoWebmPath: string;
  videoMp4Path: string;
}

test.use({
  video: {
    mode: 'on',
    size: { width: 1920, height: 1080 },
  },
  viewport: { width: 1920, height: 1080 },
});

async function captureShot(
  page: Page,
  shotDir: string,
  name: string,
  list: string[]
): Promise<string> {
  fs.mkdirSync(shotDir, { recursive: true });
  const filename = `${name}.png`;
  const fullPath = path.join(shotDir, filename);
  await page.screenshot({
    path: fullPath,
    fullPage: false,
    animations: 'allow',
    timeout: 5000,
  });
  list.push(fullPath);
  return fullPath;
}

async function assertCleanVisibleText(page: Page, contextLabel: string): Promise<void> {
  const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
  expect(bodyText.trim().length, `${contextLabel}: body should not be empty`).toBeGreaterThan(40);
  expect(
    /\bNaN\b/.test(bodyText),
    `${contextLabel}: visible text must not contain NaN`
  ).toBe(false);
  expect(
    /\bundefined\b/.test(bodyText),
    `${contextLabel}: visible text must not contain undefined`
  ).toBe(false);
}

const CASE_FILTER = process.env.CASE_SLUG?.trim();
const SELECTED_CASES = CASE_FILTER
  ? ANYOBJECT_CASES.filter((c) => c.slug === CASE_FILTER)
  : ANYOBJECT_CASES;

test.describe('Get Me An Alt — Live Prod Any-Object E2E Suite', () => {
  test.setTimeout(360_000); // 6 min generous timeout per pipeline run

  for (const testCase of SELECTED_CASES) {
    test(`Case [${testCase.slug}]: ${testCase.label}`, async ({ page }, testInfo) => {
      const caseStartMs = Date.now();
      const shotDir = path.join(OUT_ROOT, `anyobject-${testCase.slug}`);
      fs.mkdirSync(shotDir, { recursive: true });

      const consoleErrors: string[] = [];
      const failedNetworkRequests: string[] = [];
      const screenshots: string[] = [];
      const steps: StepResult[] = [];
      let quota429Detected = false;
      let quota429Retried = false;

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          consoleErrors.push(text);
          if (/429|RESOURCE_EXHAUSTED|quota/i.test(text)) {
            quota429Detected = true;
          }
        }
      });

      page.on('requestfailed', (req) => {
        const url = req.url();
        const errText = req.failure()?.errorText || 'failed';
        // Ignore aborted video/SSE streams when navigating or closing EventSource
        if (
          url.includes('/media/hero.mp4') ||
          (url.includes('/stream') && errText.includes('ERR_ABORTED'))
        ) {
          return;
        }
        failedNetworkRequests.push(`${req.method()} ${url} -> ${errText}`);
      });

      page.on('response', (res) => {
        if (res.status() === 429) {
          quota429Detected = true;
        }
        if (res.status() >= 500) {
          failedNetworkRequests.push(`${res.request().method()} ${res.url()} -> HTTP ${res.status()}`);
        }
      });

      async function runStep(
        stepName: string,
        shotName: string,
        fn: () => Promise<string | void>
      ): Promise<void> {
        const t0 = Date.now();
        try {
          const notes = await fn();
          const shot = await captureShot(page, shotDir, shotName, screenshots);
          steps.push({
            step: stepName,
            status: 'PASS',
            durationMs: Date.now() - t0,
            screenshot: shot,
            notes: typeof notes === 'string' ? notes : undefined,
          });
        } catch (err) {
          const shot = await captureShot(page, shotDir, `${shotName}-fail`, screenshots).catch(
            () => undefined
          );
          steps.push({
            step: stepName,
            status: 'FAIL',
            durationMs: Date.now() - t0,
            screenshot: shot,
            notes: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      }

      let projectId = '';
      let pipelineDurationSec = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let finalManifest: any = null;

      // =========================================================================
      // STEP 1: Submit input on landing page exactly as a user would
      // =========================================================================
      const submitAndWaitForPipeline = async (isRetry = false) => {
        await runStep(
          isRetry ? '1b. Retry Submit on Landing Page after 429 backoff' : '1. Submit Input on Landing Page',
          isRetry ? '01b-landing-retry-submit' : '01-landing-submit',
          async () => {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            await expect(page.locator('body')).toBeVisible();
            await page.waitForTimeout(800);

            const heroInput = page
              .getByPlaceholder(/Paste product link|describe a gadget/i)
              .first()
              .or(page.locator('form input[type="text"]').first());

            await expect(heroInput).toBeVisible({ timeout: 10_000 });
            await heroInput.fill(testCase.input);
            await page.waitForTimeout(500);

            // Capture screenshot with input filled right before clicking submit
            await captureShot(page, shotDir, '01a-input-filled', screenshots);

            const submitBtn = page
              .getByRole('button', { name: /Build My DIY Alt/i })
              .first();
            await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
            await submitBtn.click();

            await page.waitForURL(/\/projects\/[^/?#]+/, { timeout: 30_000 });
            const urlObj = new URL(page.url());
            projectId = urlObj.pathname.split('/projects/')[1]?.split('/')[0] || '';
            expect(projectId.length).toBeGreaterThan(2);
            return `Navigated to /projects/${projectId}`;
          }
        );

        // =========================================================================
        // STEP 2: Watch Mission Control / SSE progress until done or error
        // =========================================================================
        await runStep(
          '2. Watch Mission Control Until Pipeline Completes',
          '02-mission-control-done',
          async () => {
            const pollStart = Date.now();
            const maxWaitMs = 300_000; // up to 5 min for pipeline completion
            const missionSection = page
              .locator('section[aria-label*="Mission Control"]')
              .first();
            await expect(missionSection).toBeVisible({ timeout: 15_000 });

            let midShotTaken = false;
            while (Date.now() - pollStart < maxWaitMs) {
              const res = await page.request
                .get(`${BASE_URL}/api/objects/${encodeURIComponent(projectId)}`, {
                  timeout: 10_000,
                })
                .catch(() => null);

              if (res && res.ok()) {
                const data = await res.json().catch(() => null);
                if (data?.manifest) {
                  finalManifest = data.manifest;
                  const completedStages = (finalManifest.stages || []).filter(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (s: any) => s.status === 'completed'
                  ).length;

                  if (!midShotTaken && completedStages >= 2) {
                    midShotTaken = true;
                    await captureShot(
                      page,
                      shotDir,
                      '02a-mission-control-streaming',
                      screenshots
                    );
                  }

                  if (
                    finalManifest.status === 'completed' ||
                    finalManifest.status === 'error'
                  ) {
                    break;
                  }
                }
              }
              await page.waitForTimeout(1500);
            }

            pipelineDurationSec = Number(
              ((Date.now() - pollStart) / 1000).toFixed(1)
            );
            expect(
              finalManifest,
              'Manifest should be returned by /api/objects/[id]'
            ).toBeTruthy();
            expect(
              finalManifest.status,
              `Pipeline status should be completed (got ${finalManifest?.status})`
            ).toBe('completed');

            // Give React UI 1.2s to settle final SSE state
            await page.waitForTimeout(1200);
            await assertCleanVisibleText(page, 'Mission Control Done');
            return `Completed in ${pipelineDurationSec}s (${finalManifest.title})`;
          }
        );
      };

      try {
        await submitAndWaitForPipeline(false);
      } catch (err) {
        if (quota429Detected && !quota429Retried) {
          console.warn(
            `[${testCase.slug}] Gemini 429/quota detected; waiting 60s and retrying once...`
          );
          quota429Retried = true;
          await page.waitForTimeout(60_000);
          await submitAndWaitForPipeline(true);
        } else {
          throw err;
        }
      }

      // =========================================================================
      // STEP 3: Visit Overview Tab (check printed vs bought split + Critic)
      // =========================================================================
      await runStep('3. Overview Tab & Printability Critic', '03-overview-tab', async () => {
        const overviewTab = page.getByRole('button', { name: /^Overview/i }).first();
        await expect(overviewTab).toBeVisible({ timeout: 8_000 });
        await overviewTab.click();
        await page.waitForTimeout(900);

        await expect(page.getByText(/3D-Printed Parts/i).first()).toBeVisible();
        await expect(page.getByText(/Off-The-Shelf Hardware/i).first()).toBeVisible();
        await assertCleanVisibleText(page, 'Overview Tab');

        const printedCount = finalManifest?.analysis?.whatGetsPrinted?.length || 0;
        const boughtCount = finalManifest?.analysis?.whatGetsBought?.length || 0;
        expect(printedCount).toBeGreaterThan(0);
        expect(boughtCount).toBeGreaterThan(0);
        return `Overview rendered: ${printedCount} printed, ${boughtCount} off-the-shelf, Critic score ${finalManifest?.critique?.finalScore ?? 'N/A'}/100`;
      });

      // =========================================================================
      // STEP 4: Visit Sources Tab (including Video Teardown section)
      // =========================================================================
      await runStep('4. Sources & Video Teardown Tab', '04-sources-teardown-tab', async () => {
        const sourcesTab = page.getByRole('button', { name: /^Sources/i }).first();
        await expect(sourcesTab).toBeVisible({ timeout: 8_000 });
        await sourcesTab.click();
        await page.waitForTimeout(1100);

        await assertCleanVisibleText(page, 'Sources Tab');
        const srcCount = finalManifest?.sources?.sources?.length || 0;
        expect(srcCount).toBeGreaterThan(0);

        // Scroll down to Teardown section if present
        await page.evaluate(() => window.scrollTo({ top: 520, behavior: 'smooth' }));
        await page.waitForTimeout(700);
        return `Sources rendered: ${srcCount} grounded/honest sources, teardown note: ${finalManifest?.teardown?.note ? 'present' : 'frames present'}`;
      });

      // =========================================================================
      // STEP 5: Visit BOM Tab (Price Hunter links + savings)
      // =========================================================================
      await runStep('5. BOM Tab (Price Hunter Links & Savings)', '05-bom-savings-tab', async () => {
        await page.evaluate(() => window.scrollTo({ top: 320, behavior: 'smooth' }));
        const bomTab = page.getByRole('button', { name: /^BOM/i }).first();
        await expect(bomTab).toBeVisible({ timeout: 8_000 });
        await bomTab.click();
        await page.waitForTimeout(1100);

        await assertCleanVisibleText(page, 'BOM Tab');
        const bomItems = finalManifest?.bom?.items || [];
        expect(bomItems.length).toBeGreaterThan(0);

        const retailerLinks = page
          .locator('a')
          .filter({ hasText: /Amazon|Walmart|Home Depot|McMaster|AliExpress/i });
        const linkCount = await retailerLinks.count();
        expect(linkCount).toBeGreaterThan(0);

        const summary = finalManifest?.bom?.summary;
        return `BOM items: ${bomItems.length}, retailer links in DOM: ${linkCount}, DIY $${summary?.totalDiyCost} vs Retail $${summary?.originalRetailPrice} (Save $${summary?.totalSavings} / ${summary?.savingsPercent}%)`;
      });

      // =========================================================================
      // STEP 6: Visit Print Files Tab (switch printer to Prusa MK4S and back + open print-service card)
      // =========================================================================
      await runStep(
        '6. Print Files Tab (Switch Printer to Prusa MK4S & Back + Print Service Card)',
        '06-print-files-tab',
        async () => {
          await page.evaluate(() => window.scrollTo({ top: 320, behavior: 'smooth' }));
          const printTab = page.getByRole('button', { name: /^Print Files/i }).first();
          await expect(printTab).toBeVisible({ timeout: 8_000 });
          await printTab.click();
          await page.waitForTimeout(1200);

          await assertCleanVisibleText(page, 'Print Files Tab');

          const printerSelect = page
            .getByTestId('printer-select')
            .or(page.locator('#printer-select'))
            .first();
          await expect(printerSelect).toBeVisible({ timeout: 8_000 });
          await printerSelect.scrollIntoViewIfNeeded();

          // Switch printer to Prusa MK4S
          await printerSelect.selectOption('prusa-mk4s');
          await page.waitForTimeout(900);
          await captureShot(page, shotDir, '06a-print-files-prusa-mk4s', screenshots);

          // Switch back to Bambu Lab A1
          await printerSelect.selectOption('bambu-a1');
          await page.waitForTimeout(900);

          // Open / interact with Print-Service Card ("No printer?")
          const noPrinterCard = page
            .getByTestId('no-printer-card')
            .or(page.getByText(/No printer\? Get it printed/i))
            .first();
          await expect(noPrinterCard).toBeVisible({ timeout: 8_000 });
          await noPrinterCard.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);

          const jlcBtn = page
            .getByTestId('service-option-jlc3dp')
            .or(page.getByRole('button', { name: /JLC3DP/i }))
            .first();
          if (await jlcBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await jlcBtn.click();
            await page.waitForTimeout(600);
          }

          const quoteBtn = page
            .getByTestId('request-quote-submit')
            .or(page.getByRole('button', { name: /Request Quote|Send to/i }))
            .first();
          if (await quoteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await quoteBtn.click().catch(() => {});
            await page.waitForTimeout(600);
          }

          const platesCount = finalManifest?.plates?.totalPlates || 0;
          const stlPartsCount = finalManifest?.plates?.parts?.length || 0;
          expect(platesCount).toBeGreaterThan(0);
          expect(stlPartsCount).toBeGreaterThan(0);
          return `Switched Bambu A1 -> Prusa MK4S -> Bambu A1; ${stlPartsCount} STL parts packed onto ${platesCount} plate(s); Print Service card verified`;
        }
      );

      // =========================================================================
      // STEP 7: Visit Instructions Tab (IKEA-style 3D player + Play)
      // =========================================================================
      await runStep(
        '7. Instructions Tab (Three.js IKEA Assembly Player + Play)',
        '07-instructions-play',
        async () => {
          await page.evaluate(() => window.scrollTo({ top: 320, behavior: 'smooth' }));
          const instructionsTab = page
            .getByRole('button', { name: /^Instructions/i })
            .first();
          await expect(instructionsTab).toBeVisible({ timeout: 8_000 });
          await instructionsTab.click();
          await page.waitForTimeout(1400);

          await assertCleanVisibleText(page, 'Instructions Tab');

          const playPauseBtn = page
            .getByTestId('play-pause-btn')
            .or(page.getByRole('button', { name: /Play|Pause/i }))
            .first();
          await expect(playPauseBtn).toBeVisible({ timeout: 8_000 });
          await playPauseBtn.scrollIntoViewIfNeeded();
          await playPauseBtn.click();
          await page.waitForTimeout(1600);

          const nextStepBtn = page.getByTestId('next-step-btn').first();
          if (await nextStepBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await nextStepBtn.click().catch(() => {});
            await page.waitForTimeout(800);
          }

          const stepsCount = finalManifest?.instructions?.steps?.length || 0;
          expect(stepsCount).toBeGreaterThan(0);
          return `Played IKEA 3D AssemblyPlayer (${stepsCount} steps)`;
        }
      );

      // =========================================================================
      // STEP 8: Visit Exploded View Tab (explode slider + click a part)
      // =========================================================================
      await runStep(
        '8. Exploded View Tab (Explode Slider + Click Part)',
        '08-exploded-view',
        async () => {
          await page.evaluate(() => window.scrollTo({ top: 320, behavior: 'smooth' }));
          const explodedTab = page
            .getByRole('button', { name: /^Exploded View/i })
            .first();
          await expect(explodedTab).toBeVisible({ timeout: 8_000 });
          await explodedTab.click();
          await page.waitForTimeout(1400);

          await assertCleanVisibleText(page, 'Exploded View Tab');

          const explodeSlider = page
            .getByTestId('explode-slider')
            .or(page.locator('input[type="range"][aria-label*="Explode" i]'))
            .first();
          await expect(explodeSlider).toBeVisible({ timeout: 8_000 });
          await explodeSlider.scrollIntoViewIfNeeded();

          for (const val of ['0.45', '0.85']) {
            await explodeSlider.fill(val).catch(async () => {
              await explodeSlider.evaluate((el, v) => {
                const input = el as HTMLInputElement;
                const setter = Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype,
                  'value'
                )?.set;
                setter?.call(input, v);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }, val);
            });
            await page.waitForTimeout(600);
          }

          // Click a part chip to inspect BOM & dimensions
          const partChips = page.locator('[data-testid^="part-chip-"]');
          const chipCount = await partChips.count();
          expect(chipCount).toBeGreaterThan(0);
          await partChips.first().click();
          await page.waitForTimeout(800);

          if (chipCount > 1) {
            await partChips.nth(1).click();
            await page.waitForTimeout(700);
          }

          return `Exploded view slider set to 85%; clicked part chips (${chipCount} interactive parts)`;
        }
      );

      // =========================================================================
      // STEP 9: Ask Argon to Modify Chat ("make it 20% taller")
      // =========================================================================
      let modifySummaryText = '';
      await runStep(
        `9. Modify Chat ("${testCase.modifyPrompt}")`,
        '09-modify-chat',
        async () => {
          const modifySection = page
            .locator('section[aria-label*="Ask Argon to Modify"]')
            .first();
          await expect(modifySection).toBeVisible({ timeout: 8_000 });
          await modifySection.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);

          const modifyInput = modifySection
            .locator('input[type="text"]')
            .first();
          await expect(modifyInput).toBeVisible({ timeout: 5_000 });
          await modifyInput.fill(testCase.modifyPrompt);
          await page.waitForTimeout(300);

          const askBtn = modifySection
            .getByRole('button', { name: /Ask Argon/i })
            .first();
          await expect(askBtn).toBeEnabled({ timeout: 5_000 });
          await askBtn.click();

          // Wait for "Modification Diff Summary" badge to appear
          await expect(
            modifySection.getByText(/Modification Diff Summary/i).first()
          ).toBeVisible({ timeout: 90_000 });
          await page.waitForTimeout(800);

          await assertCleanVisibleText(page, 'After Modify Chat');
          modifySummaryText =
            (await modifySection.innerText().catch(() => ''))
              .replace(/\s+/g, ' ')
              .slice(0, 260) || 'Modification Diff Summary rendered';
          return `Modify completed for "${testCase.modifyPrompt}"`;
        }
      );

      // Collect per-agent timings from finalManifest
      const agentTimings: AgentTimingRecord[] = (finalManifest?.stages || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (st: any) => ({
          id: st.id,
          name: st.name,
          status: st.status,
          durationMs: st.durationMs || 0,
          runner: st.runner,
          tokensTotal: st.tokensUsed?.total,
          summary: st.summary,
        })
      );

      const totalTestSec = Number(((Date.now() - caseStartMs) / 1000).toFixed(1));
      const videoObj = page.video();

      // Close page so Playwright flushes video to disk
      await page.close();

      const destWebm = path.join(OUT_ROOT, `anyobject-${testCase.slug}.webm`);
      const destMp4 = path.join(OUT_ROOT, `anyobject-${testCase.slug}.mp4`);
      if (videoObj) {
        const rawVideoPath = await videoObj.path().catch(() => '');
        if (rawVideoPath && fs.existsSync(rawVideoPath)) {
          fs.copyFileSync(rawVideoPath, destWebm);
          try {
            execFileSync(
              'ffmpeg',
              [
                '-y',
                '-i',
                destWebm,
                '-c:v',
                'libx264',
                '-preset',
                'fast',
                '-crf',
                '23',
                '-pix_fmt',
                'yuv420p',
                destMp4,
              ],
              { stdio: 'ignore' }
            );
          } catch (ffErr) {
            console.warn(`[${testCase.slug}] ffmpeg mp4 conversion warning:`, ffErr);
          }
        }
      }

      const bomItems = finalManifest?.bom?.items || [];
      const priceHunterLinksCount = bomItems.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc: number, it: any) => acc + (it.retailerLinks?.length || 0),
        0
      );

      const report: CaseRunReport = {
        slug: testCase.slug,
        label: testCase.label,
        inputType: testCase.inputType,
        input: testCase.input,
        projectId,
        objectName: finalManifest?.analysis?.objectName || finalManifest?.title || '',
        status: steps.every((s) => s.status === 'PASS') ? 'PASS' : 'FAIL',
        totalPipelineSec: pipelineDurationSec,
        totalTestSec,
        flaggedOver3Min: pipelineDurationSec > 180,
        quota429Retried,
        steps,
        agentTimings,
        artifactsQuality: {
          bomItemsCount: bomItems.length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          bomSampleNames: bomItems.slice(0, 5).map((i: any) => `${i.partNumber}: ${i.name} ($${i.totalPrice})`),
          retailPrice: finalManifest?.bom?.summary?.originalRetailPrice || 0,
          diyCost: finalManifest?.bom?.summary?.totalDiyCost || 0,
          savingsDollars: finalManifest?.bom?.summary?.totalSavings || 0,
          savingsPercent: finalManifest?.bom?.summary?.savingsPercent || 0,
          priceHunterLinksCount,
          printedPartsCount:
            finalManifest?.design?.printedPartsCount ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (finalManifest?.design?.parts || []).filter((p: any) => p.kind === 'printed').length,
          purchasedPartsCount:
            finalManifest?.design?.purchasedPartsCount ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (finalManifest?.design?.parts || []).filter((p: any) => p.kind === 'purchased').length,
          totalPartsCount: finalManifest?.design?.parts?.length || 0,
          platesCount: finalManifest?.plates?.totalPlates || 0,
          instructionsStepsCount: finalManifest?.instructions?.steps?.length || 0,
          sourcesCount: finalManifest?.sources?.sources?.length || 0,
          teardownVideosCount: finalManifest?.teardown?.videos?.length || 0,
          teardownFramesCount: finalManifest?.teardown?.frames?.length || 0,
          modifySummaryText,
        },
        consoleErrors,
        failedNetworkRequests,
        screenshots,
        videoWebmPath: destWebm,
        videoMp4Path: destMp4,
      };

      fs.writeFileSync(
        path.join(shotDir, 'report.json'),
        JSON.stringify(report, null, 2)
      );
      console.log(
        `[anyobject] Case ${testCase.slug} PASS in ${totalTestSec}s (pipeline ${pipelineDurationSec}s) -> ${report.objectName}`
      );
      void testInfo;
    });
  }
});
