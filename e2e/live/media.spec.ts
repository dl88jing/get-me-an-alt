import { test, expect, Page, CDPSession } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = (
  process.env.BASE_URL || 'https://get-me-an-alt.vercel.app'
).replace(/\/+$/, '');

const OUT_ROOT = '/workspace/work/out/e2e';
const FIXTURE_IMAGE = path.join(__dirname, '..', 'fixtures', 'desk-lamp.jpg');
const YOUTUBE_TEARDOWN_URL = 'https://www.youtube.com/watch?v=kYj2zRVrfLg';

test.use({
  video: {
    mode: 'on',
    size: { width: 1920, height: 1080 },
  },
  viewport: { width: 1920, height: 1080 },
});

interface StepRecord {
  step: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  durationMs: number;
  screenshot?: string;
  notes: string;
}

interface AgentTimingRecord {
  id: string;
  name: string;
  status: string;
  runner?: string;
  durationMs?: number;
  tokensTotal?: number;
  summary?: string;
}

interface CaseTelemetry {
  caseId: string;
  title: string;
  inputDescription: string;
  projectId: string;
  projectUrl: string;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  pipelineWaitMs: number;
  quota429Retries: number;
  steps: StepRecord[];
  agentTimings: AgentTimingRecord[];
  artifactsQuality: {
    objectName?: string;
    inputType?: string;
    retailPrice?: number;
    diyCost?: number;
    savingsDollars?: number;
    savingsPercent?: number;
    bomItemsCount?: number;
    bomSampleItems?: Array<{
      partNumber: string;
      name: string;
      price: number;
      retailers: string[];
    }>;
    printedPartsCount?: number;
    purchasedPartsCount?: number;
    totalDesignParts?: number;
    platesCount?: number;
    totalWeightGrams?: number;
    totalPrintTimeMinutes?: number;
    instructionsStepsCount?: number;
    sourcesCount?: number;
    teardownVideosCount?: number;
    teardownFramesCount?: number;
    criticScore?: number;
    criticPassed?: boolean;
  };
  consoleErrors: string[];
  pageErrors: string[];
  failedNetworkRequests: string[];
  screenshots: string[];
  bugsDetected: Array<{
    severity: 'high' | 'medium' | 'low';
    title: string;
    suspectedFile: string;
    details: string;
  }>;
}

const pageCdpMap = new WeakMap<Page, CDPSession>();

async function getCdpSession(page: Page): Promise<CDPSession> {
  let session = pageCdpMap.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    pageCdpMap.set(page, session);
  }
  return session;
}

async function captureShot(
  page: Page,
  shotDir: string,
  name: string,
  screenshotsList: string[]
): Promise<string> {
  fs.mkdirSync(shotDir, { recursive: true });
  const filename = `${name}.png`;
  const fullPath = path.join(shotDir, filename);
  try {
    const cdp = await getCdpSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png',
    });
    fs.writeFileSync(fullPath, Buffer.from(data, 'base64'));
    screenshotsList.push(fullPath);
  } catch (err) {
    console.warn(`[media.spec] Failed screenshot ${name}:`, err);
  }
  return fullPath;
}

async function setReactInputValue(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  await page.evaluate(
    ({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) throw new Error(`Input not found: ${sel}`);
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      setter?.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { sel: selector, val: value }
  );
}

async function assertCleanVisibleText(
  page: Page,
  stepLabel: string,
  bugs: CaseTelemetry['bugsDetected']
): Promise<{ hasNaN: boolean; hasUndefined: boolean; bodyLen: number }> {
  const check = await page.evaluate(() => {
    const text =
      document.querySelector('main')?.innerText ||
      document.body?.innerText ||
      '';
    const hasNaN = /\bNaN\b/.test(text);
    const hasUndefined = /\bundefined\b/i.test(text);
    const errorToast = Boolean(
      document.querySelector('[role="alert"][data-type="error"]')
    );
    return {
      hasNaN,
      hasUndefined,
      errorToast,
      bodyLen: text.trim().length,
    };
  });

  expect(
    check.bodyLen,
    `${stepLabel}: body text should be non-empty`
  ).toBeGreaterThan(25);
  if (check.hasNaN) {
    bugs.push({
      severity: 'medium',
      title: `"NaN" rendered in visible text during ${stepLabel}`,
      suspectedFile: 'app/projects/[id]/page.tsx',
      details: `Visible page text matched /\\bNaN\\b/ at step ${stepLabel}`,
    });
  }
  if (check.hasUndefined) {
    bugs.push({
      severity: 'medium',
      title: `"undefined" rendered in visible text during ${stepLabel}`,
      suspectedFile: 'app/projects/[id]/page.tsx',
      details: `Visible page text matched /\\bundefined\\b/ at step ${stepLabel}`,
    });
  }
  expect(check.hasNaN, `${stepLabel}: should not display NaN`).toBe(false);
  return check;
}

async function runFullProjectFlow(
  page: Page,
  caseId: 'image' | 'video',
  title: string,
  inputDesc: string,
  submitFn: (page: Page, shotDir: string, shots: string[]) => Promise<void>
): Promise<CaseTelemetry> {
  const caseStart = Date.now();
  const shotDir = path.join(OUT_ROOT, `media-${caseId}`);
  fs.mkdirSync(shotDir, { recursive: true });

  for (const existing of fs.readdirSync(shotDir)) {
    if (existing.endsWith('.png')) {
      fs.unlinkSync(path.join(shotDir, existing));
    }
  }

  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    w.__gmaLatestManifest = null;
    w.__gmaSseEvents = [];
    const OrigEventSource = window.EventSource;
    if (OrigEventSource) {
      window.EventSource = class extends OrigEventSource {
        constructor(url: string | URL, init?: EventSourceInit) {
          super(url, init);
          this.addEventListener('message', (evt: MessageEvent) => {
            try {
              const parsed = JSON.parse(evt.data);
              w.__gmaSseEvents.push(parsed);
              if (parsed?.data?.manifest) {
                w.__gmaLatestManifest = parsed.data.manifest;
              } else if (parsed?.stages) {
                w.__gmaLatestManifest = parsed;
              }
            } catch {
              // ignore
            }
          });
        }
      } as typeof EventSource;
    }
  });

  await page.route('**/media/hero.mp4', (r) => r.abort()).catch(() => {});

  const telemetry: CaseTelemetry = {
    caseId,
    title,
    inputDescription: inputDesc,
    projectId: '',
    projectUrl: '',
    startedAt: new Date().toISOString(),
    completedAt: '',
    totalDurationMs: 0,
    pipelineWaitMs: 0,
    quota429Retries: 0,
    steps: [],
    agentTimings: [],
    artifactsQuality: {},
    consoleErrors: [],
    pageErrors: [],
    failedNetworkRequests: [],
    screenshots: [],
    bugsDetected: [],
  };

  let saw429Quota = false;

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      telemetry.consoleErrors.push(txt.slice(0, 300));
      if (/429|quota|rate.?limit/i.test(txt)) {
        saw429Quota = true;
      }
    }
  });

  page.on('pageerror', (err) => {
    telemetry.pageErrors.push(err.message.slice(0, 300));
  });

  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('/media/hero.mp4')) return;
    const failure = req.failure()?.errorText || 'failed';
    if (failure.includes('ERR_ABORTED')) return;
    telemetry.failedNetworkRequests.push(
      `${req.method()} ${url} -> ${failure}`
    );
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status === 429) {
      saw429Quota = true;
    }
    if (status >= 400 && !res.url().includes('favicon')) {
      telemetry.failedNetworkRequests.push(
        `HTTP ${status} ${res.request().method()} ${res.url()}`
      );
    }
  });

  async function recordStep(
    stepName: string,
    shotName: string,
    fn: () => Promise<string>
  ) {
    const t0 = Date.now();
    let status: StepRecord['status'] = 'PASS';
    let notes = '';
    try {
      notes = await fn();
    } catch (err) {
      status = 'FAIL';
      notes = err instanceof Error ? err.message : String(err);
      console.error(`[media.spec][${caseId}] FAIL in ${stepName}:`, notes);
    }
    const shot = await captureShot(
      page,
      shotDir,
      shotName,
      telemetry.screenshots
    );
    telemetry.steps.push({
      step: stepName,
      status,
      durationMs: Date.now() - t0,
      screenshot: shot,
      notes,
    });
  }

  // ---------------------------------------------------------------------------
  // STEP 1: Landing Page Input & Submit
  // ---------------------------------------------------------------------------
  await recordStep(
    '1. Landing Page Input & Submit',
    '01-landing-submit',
    async () => {
      await page.goto(BASE_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await expect(page.locator('#hero-command')).toBeVisible({
        timeout: 15_000,
      });
      await page.waitForTimeout(700);

      await submitFn(page, shotDir, telemetry.screenshots);

      try {
        await page.waitForURL(/\/projects\/[^/?#]+/, { timeout: 25_000 });
      } catch (navErr) {
        if (saw429Quota && telemetry.quota429Retries === 0) {
          telemetry.quota429Retries++;
          console.warn(
            '[media.spec] 429/quota detected on submit; waiting 60s and retrying once...'
          );
          await page.waitForTimeout(60_000);
          await submitFn(page, shotDir, telemetry.screenshots);
          await page.waitForURL(/\/projects\/[^/?#]+/, { timeout: 25_000 });
        } else {
          throw navErr;
        }
      }

      telemetry.projectUrl = page.url();
      const match = telemetry.projectUrl.match(/\/projects\/([^/?#]+)/);
      telemetry.projectId = match ? decodeURIComponent(match[1]) : 'unknown';
      await page.waitForTimeout(700);
      await assertCleanVisibleText(
        page,
        'Landing Submit -> Project Page',
        telemetry.bugsDetected
      );
      return `Submitted on landing page; navigated to /projects/${telemetry.projectId}`;
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 2: Mission Control Live Orchestration Wait (up to 6 min)
  // ---------------------------------------------------------------------------
  await recordStep(
    '2. Watch Mission Control Until Pipeline Finishes',
    '02-mission-control-done',
    async () => {
      const missionSection = page
        .locator('section[aria-label*="Mission Control"]')
        .first();
      await expect(missionSection).toBeVisible({ timeout: 25_000 });

      const waitStart = Date.now();
      const maxWaitMs = 120_000;
      let capturedRunningShot = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let latestManifest: any = null;
      let lastCompletedStagesCount = 0;

      while (Date.now() - waitStart < maxWaitMs) {
        await page.waitForTimeout(1500);

        if (!capturedRunningShot && Date.now() - waitStart > 2500) {
          await captureShot(
            page,
            shotDir,
            '02a-mission-control-running',
            telemetry.screenshots
          );
          capturedRunningShot = true;
        }

        const liveState = await page
          .evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const w = window as any;
            const m = w.__gmaLatestManifest || w.__GMA_MANIFEST__ || null;
            const events = Array.isArray(w.__gmaSseEvents)
              ? w.__gmaSseEvents
              : [];
            const buttons = Array.from(document.querySelectorAll('button'));
            const printBtn = buttons.find((b) =>
              /Print Files/i.test(b.textContent || '')
            );
            const instrBtn = buttons.find((b) =>
              /Instructions/i.test(b.textContent || '')
            );
            return {
              manifest: m,
              eventsCount: events.length,
              printText: printBtn?.textContent || '',
              instrText: instrBtn?.textContent || '',
            };
          })
          .catch(() => null);

        if (liveState?.manifest) {
          latestManifest = liveState.manifest;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stages: any[] = latestManifest.stages || [];
          const doneCount = stages.filter(
            (s) => s.status === 'completed'
          ).length;
          if (doneCount > lastCompletedStagesCount) {
            lastCompletedStagesCount = doneCount;
            console.log(
              `[media.spec][${caseId}] Pipeline progress: ${doneCount}/${stages.length} stages completed (status=${latestManifest.status}, events=${liveState.eventsCount})`
            );
          }

          if (
            latestManifest.status === 'completed' ||
            (stages.length > 0 && doneCount === stages.length) ||
            (liveState.printText.includes('plate') &&
              liveState.instrText.includes('step'))
          ) {
            break;
          }

          if (latestManifest.status === 'error') {
            if (saw429Quota && telemetry.quota429Retries === 0) {
              telemetry.quota429Retries++;
              console.warn(
                '[media.spec] Pipeline hit 429 quota error; waiting 60s and retrying once...'
              );
              await page.waitForTimeout(60_000);
              await page.reload({ waitUntil: 'domcontentloaded' });
              continue;
            }
            break;
          }
        } else if (
          liveState &&
          liveState.printText.includes('plate') &&
          liveState.instrText.includes('step')
        ) {
          break;
        }
      }

      telemetry.pipelineWaitMs = Date.now() - waitStart;

      // Also check window.__GMA_MANIFEST__ if exposed by page.tsx
      const domManifest = await page
        .evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = window as any;
          return w.__GMA_MANIFEST__ || w.__gmaLatestManifest || null;
        })
        .catch(() => null);
      if (domManifest) {
        latestManifest = domManifest;
      }

      if (!latestManifest || latestManifest.status !== 'completed') {
        const fallbackPoll = await page
          .evaluate(async (projId) => {
            try {
              const r = await fetch(
                `/api/objects/${encodeURIComponent(projId)}`
              );
              if (!r.ok) return null;
              const d = await r.json();
              return d.manifest || null;
            } catch {
              return null;
            }
          }, telemetry.projectId)
          .catch(() => null);

        if (
          fallbackPoll &&
          (!latestManifest ||
            (fallbackPoll.stages || []).filter(
              (s: { status: string }) => s.status === 'completed'
            ).length >=
              (latestManifest.stages || []).filter(
                (s: { status: string }) => s.status === 'completed'
              ).length)
        ) {
          latestManifest = fallbackPoll;
        }
      }

      if (await missionSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        for (const nodePattern of [
          /01\s*Analyst|Analyst/i,
          /03\s*Teardown|Teardown/i,
          /05\s*Critic|Critic/i,
          /08\s*CAD|CAD/i,
          /09\s*Instructions|Instructions/i,
        ]) {
          const btn = missionSection
            .getByRole('button', { name: nodePattern })
            .first();
          if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
            await btn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(250);
          }
        }
      }

      if (latestManifest) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        telemetry.agentTimings = (latestManifest.stages || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          runner: s.runner,
          durationMs: s.durationMs,
          tokensTotal: s.tokensUsed?.total,
          summary: s.summary,
        }));

        const a = latestManifest.analysis;
        const b = latestManifest.bom;
        const d = latestManifest.design;
        const p = latestManifest.plates;
        const inst = latestManifest.instructions;
        const src = latestManifest.sources;
        const td = latestManifest.teardown;
        const crit = latestManifest.critique;

        telemetry.artifactsQuality = {
          objectName: a?.objectName || latestManifest.title,
          inputType: a?.inputType,
          retailPrice:
            b?.summary?.originalRetailPrice ?? a?.originalProduct?.retailPrice,
          diyCost: b?.summary?.totalDiyCost ?? a?.targetDiyCost,
          savingsDollars: b?.summary?.totalSavings ?? a?.estimatedSavings,
          savingsPercent: b?.summary?.savingsPercent,
          bomItemsCount: b?.items?.length ?? 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          bomSampleItems: (b?.items || []).slice(0, 5).map((item: any) => ({
            partNumber: item.partNumber,
            name: item.name,
            price: item.totalPrice,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            retailers: (item.retailerLinks || []).map((l: any) => l.retailer),
          })),
          printedPartsCount: d?.printedPartsCount,
          purchasedPartsCount: d?.purchasedPartsCount,
          totalDesignParts: d?.parts?.length ?? 0,
          platesCount: p?.totalPlates,
          totalWeightGrams: p?.totalWeightGrams,
          totalPrintTimeMinutes: p?.totalPrintTimeMinutes,
          instructionsStepsCount: inst?.steps?.length ?? 0,
          sourcesCount: src?.sources?.length ?? 0,
          teardownVideosCount: td?.videos?.length ?? 0,
          teardownFramesCount: td?.frames?.length ?? 0,
          criticScore: crit?.finalScore,
          criticPassed: crit?.passed,
        };
      }

      await assertCleanVisibleText(
        page,
        'Mission Control Done',
        telemetry.bugsDetected
      );
      const doneStages = telemetry.agentTimings.filter(
        (s) => s.status === 'completed'
      ).length;
      expect(
        doneStages,
        'All 6 core stages should complete'
      ).toBeGreaterThanOrEqual(6);
      return `Pipeline finished in ${(telemetry.pipelineWaitMs / 1000).toFixed(1)}s (${doneStages}/${telemetry.agentTimings.length} stages completed, object="${telemetry.artifactsQuality.objectName}")`;
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 3: Overview Tab (incl. CritiquePanel)
  // ---------------------------------------------------------------------------
  await recordStep(
    '3. Overview Tab & Printability Critic',
    '03-overview-tab',
    async () => {
      const overviewBtn = page
        .getByRole('button', { name: /^Overview/i })
        .first();
      await expect(overviewBtn).toBeVisible({ timeout: 10_000 });
      await overviewBtn.click({ force: true });
      await page.waitForTimeout(600);

      await page.evaluate(() =>
        window.scrollTo({ top: 550, behavior: 'smooth' })
      );
      await page.waitForTimeout(400);

      const round1Btn = page.getByRole('button', { name: /Round 1/i }).first();
      const round2Btn = page.getByRole('button', { name: /Round 2/i }).first();
      if (await round1Btn.isVisible({ timeout: 800 }).catch(() => false)) {
        await round1Btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
      if (await round2Btn.isVisible({ timeout: 800 }).catch(() => false)) {
        await round2Btn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }

      await assertCleanVisibleText(
        page,
        'Overview Tab',
        telemetry.bugsDetected
      );
      const printedHeading = await page
        .evaluate(() => /3D-Printed Parts|Printed Parts/i.test(document.body?.innerText || ''))
        .catch(() => false);
      expect(
        printedHeading,
        'Overview should display 3D-Printed Parts section'
      ).toBe(true);
      return `Overview tab rendered with Printed (${telemetry.artifactsQuality.printedPartsCount}) vs Purchased (${telemetry.artifactsQuality.purchasedPartsCount}) split and Critic score ${telemetry.artifactsQuality.criticScore ?? 'N/A'}/100`;
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 4: Sources Tab (incl. Video Teardown Gallery)
  // ---------------------------------------------------------------------------
  await recordStep(
    '4. Sources Tab (incl. Video Teardown)',
    '04-sources-teardown-tab',
    async () => {
      const sourcesBtn = page
        .getByRole('button', { name: /^Sources/i })
        .first();
      await expect(sourcesBtn).toBeVisible({ timeout: 10_000 });
      await sourcesBtn.click({ force: true });
      await page.waitForTimeout(700);

      await page.evaluate(() =>
        window.scrollTo({ top: 520, behavior: 'smooth' })
      );
      await page.waitForTimeout(400);

      const filterBar = page.locator(
        '[aria-label="Filter sources by category"]'
      );
      if (await filterBar.isVisible({ timeout: 800 }).catch(() => false)) {
        for (const label of [/Videos/i, /Teardowns/i, /All/i]) {
          const btn = filterBar.getByRole('button', { name: label }).first();
          if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
            await btn.click({ force: true }).catch(() => {});
            await page.waitForTimeout(250);
          }
        }
      }

      await page.evaluate(() =>
        window.scrollTo({ top: 950, behavior: 'smooth' })
      );
      await page.waitForTimeout(500);

      const teardownGallery = page.getByTestId('teardown-gallery').first();
      const teardownVisible = await teardownGallery
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (teardownVisible) {
        const frameButtons = teardownGallery.locator('button');
        const frameBtnCount = await frameButtons.count();
        if (frameBtnCount > 1) {
          await frameButtons.nth(1).click({ force: true }).catch(() => {});
          await page.waitForTimeout(350);
        }
      } else {
        telemetry.bugsDetected.push({
          severity: 'low',
          title: `TeardownGallery had 0 frames on ${caseId} case`,
          suspectedFile: 'lib/agents/teardown.ts',
          details: `teardownVideos=${telemetry.artifactsQuality.teardownVideosCount}, teardownFrames=${telemetry.artifactsQuality.teardownFramesCount}`,
        });
      }

      await assertCleanVisibleText(
        page,
        'Sources & Teardown Tab',
        telemetry.bugsDetected
      );
      return `Sources tab rendered (${telemetry.artifactsQuality.sourcesCount} sources, teardownVisible=${teardownVisible}, teardownVideos=${telemetry.artifactsQuality.teardownVideosCount}, teardownFrames=${telemetry.artifactsQuality.teardownFramesCount})`;
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 5: BOM Tab (incl. Price Hunter Links & Savings)
  // ---------------------------------------------------------------------------
  await recordStep(
    '5. BOM Tab (Price Hunter Links & Savings)',
    '05-bom-price-hunter-tab',
    async () => {
      const bomBtn = page
        .locator('div.sticky button')
        .filter({ hasText: /^BOM/i })
        .first()
        .or(page.getByRole('button', { name: /^BOM/i }).first());
      await expect(bomBtn).toBeVisible({ timeout: 10_000 });
      await bomBtn.click({ force: true });
      await page.waitForTimeout(700);

      await page.evaluate(() =>
        window.scrollTo({ top: 550, behavior: 'smooth' })
      );
      await page.waitForTimeout(500);

      const retailerLinks = page
        .locator('a')
        .filter({
          hasText: /Amazon|Home Depot|Walmart|McMaster|AliExpress|Buy at/i,
        });
      const retailerLinkCount = await retailerLinks.count();

      expect(
        retailerLinkCount,
        'BOM tab should contain retailer purchase/search links'
      ).toBeGreaterThan(0);

      await assertCleanVisibleText(page, 'BOM Tab', telemetry.bugsDetected);
      return `BOM tab rendered ${telemetry.artifactsQuality.bomItemsCount} items, ${retailerLinkCount} retailer links, DIY $${telemetry.artifactsQuality.diyCost} vs Retail $${telemetry.artifactsQuality.retailPrice} (${telemetry.artifactsQuality.savingsPercent}% saved)`;
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 6: Print Files Tab (Switch Printer to Prusa MK4S & Back + Print Service Card)
  // ---------------------------------------------------------------------------
  await recordStep(
    '6. Print Files Tab (Switch to Prusa MK4S & Back + Print Service Card)',
    '06-print-files-tab',
    async () => {
      const printBtn = page
        .getByRole('button', { name: /^Print Files/i })
        .first();
      await expect(printBtn).toBeVisible({ timeout: 10_000 });
      await printBtn.click({ force: true });
      await page.waitForTimeout(800);

      await page.evaluate(() =>
        window.scrollTo({ top: 650, behavior: 'smooth' })
      );
      await page.waitForTimeout(400);

      const printerSelect = page
        .getByTestId('printer-select')
        .or(page.locator('#printer-select'))
        .first();

      let switchedPrinter = false;
      if (await printerSelect.isVisible({ timeout: 4000 }).catch(() => false)) {
        await printerSelect.selectOption('prusa-mk4s', { force: true });
        await page.waitForTimeout(600);
        await captureShot(
          page,
          shotDir,
          '06a-print-files-prusa-mk4s',
          telemetry.screenshots
        );
        await printerSelect.selectOption('bambu-a1', { force: true });
        await page.waitForTimeout(500);
        switchedPrinter = true;
      }

      const noPrinterCard = page
        .getByTestId('no-printer-card')
        .or(page.getByText(/No printer\? Get it printed/i))
        .first();

      let openedPrintService = false;
      if (await noPrinterCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        const jlcBtn = page
          .getByTestId('service-option-jlc3dp')
          .or(page.getByRole('button', { name: /JLC3DP/i }))
          .first();
        if (await jlcBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await jlcBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(350);
        }
        const craftBtn = page
          .getByTestId('service-option-craftcloud')
          .or(page.getByRole('button', { name: /Craftcloud/i }))
          .first();
        if (await craftBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await craftBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(350);
        }
        openedPrintService = true;
      }

      expect(
        switchedPrinter,
        'Should switch printer to Prusa MK4S and back'
      ).toBe(true);
      expect(
        openedPrintService,
        'Should display and interact with Print Service card'
      ).toBe(true);
      await assertCleanVisibleText(
        page,
        'Print Files Tab',
        telemetry.bugsDetected
      );
      return `Switched printer to prusa-mk4s and back to bambu-a1; interacted with print-service card (${telemetry.artifactsQuality.platesCount} plate(s), ${telemetry.artifactsQuality.totalWeightGrams}g)`;
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 7: Instructions Tab (Play IKEA-Style 3D Assembly Player)
  // ---------------------------------------------------------------------------
  await recordStep(
    '7. Instructions Tab (Play IKEA-Style 3D Assembly)',
    '07-instructions-play',
    async () => {
      const instBtn = page
        .getByRole('button', { name: /^Instructions/i })
        .first();
      await expect(instBtn).toBeVisible({ timeout: 10_000 });
      await instBtn.click({ force: true });
      await page.waitForTimeout(900);

      await page.evaluate(() =>
        window.scrollTo({ top: 550, behavior: 'smooth' })
      );
      await page.waitForTimeout(400);

      const playPauseBtn = page
        .getByTestId('play-pause-btn')
        .or(page.getByRole('button', { name: /Play|Pause/i }))
        .first();

      let played = false;
      if (await playPauseBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await playPauseBtn.click({ force: true }).catch(() => {});
        played = true;
        await page.waitForTimeout(1200);

        const nextStepBtn = page.getByTestId('next-step-btn').first();
        if (await nextStepBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await nextStepBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(500);
          await nextStepBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(500);
        }
      }

      expect(played, 'Should click Play on IKEA assembly player').toBe(true);
      await assertCleanVisibleText(
        page,
        'Instructions Tab',
        telemetry.bugsDetected
      );
      return `Played Three.js IKEA assembly player across ${telemetry.artifactsQuality.instructionsStepsCount} steps`;
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 8: Exploded View Tab (Explode Slider + Orbit + Click Part)
  // ---------------------------------------------------------------------------
  await recordStep(
    '8. Exploded View Tab (Explode Slider + Click Part)',
    '08-exploded-view',
    async () => {
      const explodedBtn = page
        .getByRole('button', { name: /^Exploded View/i })
        .first();
      await expect(explodedBtn).toBeVisible({ timeout: 10_000 });
      await explodedBtn.click({ force: true });
      await page.waitForTimeout(900);

      let movedSlider = false;
      for (const val of ['0.45', '0.85', '0.65']) {
        const updated = await page
          .evaluate((v) => {
            const input = (document.querySelector('[data-testid="explode-slider"]') ||
              document.querySelector('input[type="range"]')) as HTMLInputElement | null;
            if (!input) return false;
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            )?.set;
            setter?.call(input, v);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }, val)
          .catch(() => false);
        if (updated) movedSlider = true;
        await page.waitForTimeout(350);
      }

      const partChips = page.locator('[data-testid^="part-chip-"]');
      const chipCount = await partChips.count();
      let clickedPart = false;
      if (chipCount > 0) {
        await partChips.nth(0).click({ force: true }).catch(() => {});
        await page.waitForTimeout(450);
        if (chipCount > 2) {
          await partChips.nth(2).click({ force: true }).catch(() => {});
          await page.waitForTimeout(450);
        }
        clickedPart = true;
      }

      expect(movedSlider, 'Explode slider should be interactive').toBe(true);
      expect(clickedPart, 'Part chips should be clickable').toBe(true);
      await assertCleanVisibleText(
        page,
        'Exploded View Tab',
        telemetry.bugsDetected
      );
      return `Adjusted explode slider and clicked part chips (${chipCount} interactive part chips rendered)`;
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 9: Ask Argon to Modify Chat ("make it 20% taller")
  // ---------------------------------------------------------------------------
  await recordStep(
    '9. Modify Chat ("make it 20% taller")',
    '09-modify-chat',
    async () => {
      await setReactInputValue(
        page,
        'input[aria-label="Ask Argon to modify this project"]',
        'make it 20% taller'
      );
      await page.waitForTimeout(350);

      const askArgonBtn = page
        .getByRole('button', { name: /Ask Argon|Re-Orchestrating/i })
        .first();
      await expect(askArgonBtn).toBeEnabled();
      await askArgonBtn.click({ force: true });

      const diffBadge = page.getByText(/Modification Diff Summary/i).first();
      await expect(diffBadge).toBeVisible({ timeout: 75_000 });
      await page.waitForTimeout(700);

      await assertCleanVisibleText(
        page,
        'Modify Chat Complete',
        telemetry.bugsDetected
      );
      return `Submitted "make it 20% taller" in ModifyChat; selective re-orchestration completed and rendered Modification Diff Summary`;
    }
  );

  telemetry.completedAt = new Date().toISOString();
  telemetry.totalDurationMs = Date.now() - caseStart;

  const telemetryPath = path.join(OUT_ROOT, `media-${caseId}-telemetry.json`);
  fs.writeFileSync(telemetryPath, JSON.stringify(telemetry, null, 2));
  console.log(`[media.spec][${caseId}] Saved telemetry to ${telemetryPath}`);

  return telemetry;
}

test.describe('Get Me An Alt — Live Media E2E Suite (Image Upload & YouTube Video Teardown)', () => {
  test.setTimeout(360_000);

  test('Case 1: Image upload (Wikimedia Commons 3M desk lamp photo)', async ({
    page,
  }) => {
    const telemetry = await runFullProjectFlow(
      page,
      'image',
      'Case 1: Image Upload (3M Articulated Desk Lamp Photo)',
      `Uploaded local fixture photo ${FIXTURE_IMAGE} (Wikimedia Commons File:A_3M_Desk_Lamp.jpg, 960x1280 JPEG) via landing page image upload input`,
      async (p, shotDir, shots) => {
        const fileInput = p
          .locator('#hero-command input[type="file"][accept="image/*"]')
          .first();
        await fileInput.setInputFiles(FIXTURE_IMAGE);
        await p.waitForTimeout(800);

        await expect(p.getByText(/Photo:\s*desk-lamp\.jpg/i)).toBeVisible({
          timeout: 5000,
        });

        await captureShot(p, shotDir, '01a-landing-photo-attached', shots);

        await p.evaluate(() => {
          const btn = document.querySelector(
            '#hero-command button[type="submit"]'
          ) as HTMLButtonElement | null;
          btn?.click();
        });
      }
    );

    const video = page.video();
    await page.close().catch(() => {});
    if (video) {
      try {
        const destWebm = path.join(OUT_ROOT, 'media-image.webm');
        await video.saveAs(destWebm);
        console.log(`[media.spec][image] Saved video to ${destWebm}`);
      } catch (err) {
        console.warn('[media.spec][image] Failed to save video:', err);
      }
    }

    const failedSteps = telemetry.steps.filter((s) => s.status === 'FAIL');
    expect(
      failedSteps,
      `Case 1 failed steps: ${JSON.stringify(failedSteps)}`
    ).toHaveLength(0);
  });

  test('Case 2: YouTube video link (iFixit headphones teardown)', async ({
    page,
  }) => {
    const telemetry = await runFullProjectFlow(
      page,
      'video',
      'Case 2: YouTube Video Link (iFixit Repairable Headphones Teardown)',
      `Pasted real YouTube video teardown URL ${YOUTUBE_TEARDOWN_URL} ("iFixit Teardown Review: Best Repairable Headphones!") into landing page command bar`,
      async (p, shotDir, shots) => {
        await setReactInputValue(
          p,
          '#hero-command input[type="text"]',
          YOUTUBE_TEARDOWN_URL
        );
        await p.waitForTimeout(500);

        await captureShot(p, shotDir, '01a-landing-youtube-url', shots);

        await p.evaluate(() => {
          const btn = document.querySelector(
            '#hero-command button[type="submit"]'
          ) as HTMLButtonElement | null;
          btn?.click();
        });
      }
    );

    const video = page.video();
    await page.close().catch(() => {});
    if (video) {
      try {
        const destWebm = path.join(OUT_ROOT, 'media-video.webm');
        await video.saveAs(destWebm);
        console.log(`[media.spec][video] Saved video to ${destWebm}`);
      } catch (err) {
        console.warn('[media.spec][video] Failed to save video:', err);
      }
    }

    const failedSteps = telemetry.steps.filter((s) => s.status === 'FAIL');
    expect(
      failedSteps,
      `Case 2 failed steps: ${JSON.stringify(failedSteps)}`
    ).toHaveLength(0);
  });
});
