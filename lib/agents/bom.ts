import fs from 'fs';
import path from 'path';
import {
  AgentLogEntry,
  BomData,
  BomItem,
  DesignSpec,
  ObjectAnalysis,
  RetailerLink,
} from '../types';
import { SAMPLE_BOM } from '../sample-data';
import { runGeminiAgent, RunAgentResult } from './runner';

export interface BomAgentInput {
  analysis: ObjectAnalysis;
  design: DesignSpec;
  cwd: string;
  onLog?: (entry: AgentLogEntry) => void;
}

function buildSearchLinks(query: string, basePrice: number): RetailerLink[] {
  const q = encodeURIComponent(query);
  return [
    {
      retailer: 'Amazon',
      url: `https://www.amazon.com/s?k=${q}`,
      estPrice: Math.round(basePrice * 100) / 100,
      inStock: true,
    },
    {
      retailer: 'Walmart',
      url: `https://www.walmart.com/search?q=${q}`,
      estPrice: Math.round(basePrice * 1.08 * 100) / 100,
      inStock: true,
    },
    {
      retailer: 'Home Depot',
      url: `https://www.homedepot.com/s/${q}`,
      estPrice: Math.round(basePrice * 1.12 * 100) / 100,
      inStock: true,
    },
    {
      retailer: 'McMaster-Carr',
      url: `https://www.mcmaster.com/#${q}`,
      estPrice: Math.round(basePrice * 1.2 * 100) / 100,
      inStock: true,
    },
    {
      retailer: 'AliExpress',
      url: `https://www.aliexpress.com/w/wholesale-${query
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}.html`,
      estPrice: Math.round(basePrice * 0.52 * 100) / 100,
      inStock: true,
    },
  ];
}

export async function runBomAgent(
  input: BomAgentInput
): Promise<RunAgentResult<BomData>> {
  const { analysis, design } = input;
  const purchasedParts = design.parts.filter((p) => p.kind === 'purchased');
  const printedParts = design.parts.filter((p) => p.kind === 'printed');

  const isPlantWaterer =
    /\b(plant|waterer|auto-waterer|blumat|sustee|hydropulse|terracotta)\b/i.test(
      `${analysis.objectName} ${analysis.slug}`
    );

  const retailRef =
    Number(analysis.originalProduct.retailPrice) ||
    (isPlantWaterer ? 149.0 : 89.0);
  const diyRef = Number(analysis.targetDiyCost) || 18.5;
  const estFilamentRef = 3.2;
  const estPurchasedRef = Math.max(4.0, Math.round((diyRef - estFilamentRef) * 100) / 100);
  const estSavingsRef = Math.max(0, Math.round((retailRef - diyRef) * 100) / 100);
  const estSavingsPctRef =
    retailRef > 0 ? Math.round((estSavingsRef / retailRef) * 1000) / 10 : 78.0;

  const synthesizedFallbackItems: BomItem[] = [
    ...(purchasedParts.length > 0
      ? purchasedParts.map((p, idx) => ({
          id: `bom-${idx + 1}`,
          partNumber: p.partNumber || `OTS-0${idx + 1}`,
          name: p.name,
          category: 'hardware' as const,
          specification:
            p.description || `${p.material || 'Standard'} off-the-shelf module`,
          qty: p.quantity || 1,
          unit: 'pc',
          unitPrice: 3.75 + idx * 1.15,
          totalPrice:
            Math.round((p.quantity || 1) * (3.75 + idx * 1.15) * 100) / 100,
          primaryRetailer: 'Amazon' as const,
          primaryUrl: `https://www.amazon.com/s?k=${encodeURIComponent(p.name)}`,
          retailerLinks: buildSearchLinks(p.name, 3.75 + idx * 1.15),
          linkedPartIds: [p.id],
          notes: `Sourced off-the-shelf component for ${analysis.objectName}.`,
        }))
      : [
          {
            id: 'bom-1',
            partNumber: 'OTS-01',
            name: 'M3×12mm Stainless Socket Head Cap Screws & Brass Heat-Set Inserts',
            category: 'hardware' as const,
            specification: '304 Stainless M3 fasteners + knurled brass inserts',
            qty: 1,
            unit: 'kit',
            unitPrice: 4.25,
            totalPrice: 4.25,
            primaryRetailer: 'Amazon' as const,
            primaryUrl:
              'https://www.amazon.com/s?k=M3+socket+head+screws+brass+heat+set+inserts',
            retailerLinks: buildSearchLinks(
              'M3 socket head screws brass heat set inserts',
              4.25
            ),
            linkedPartIds: [],
            notes: `Primary structural fastener kit for ${analysis.objectName}.`,
          },
          {
            id: 'bom-2',
            partNumber: 'OTS-02',
            name: 'N52 Neodymium Disc Magnets (10×3mm, 12-Pack)',
            category: 'hardware' as const,
            specification: 'Ni-Cu-Ni plated N52 rare-earth magnets',
            qty: 1,
            unit: 'pack',
            unitPrice: 5.4,
            totalPrice: 5.4,
            primaryRetailer: 'Amazon' as const,
            primaryUrl:
              'https://www.amazon.com/s?k=N52+neodymium+disc+magnets+10x3mm',
            retailerLinks: buildSearchLinks(
              'N52 neodymium disc magnets 10x3mm',
              5.4
            ),
            linkedPartIds: [],
            notes: `Quick-release magnetic retention array for ${analysis.objectName}.`,
          },
          {
            id: 'bom-3',
            partNumber: 'OTS-03',
            name: 'High-Friction 2mm Adhesive EPDM Rubber Grip Pads',
            category: 'hardware' as const,
            specification: '2mm Shore 60A non-slip vibration-damping sheet',
            qty: 1,
            unit: 'pack',
            unitPrice: 3.9,
            totalPrice: 3.9,
            primaryRetailer: 'Amazon' as const,
            primaryUrl:
              'https://www.amazon.com/s?k=2mm+adhesive+EPDM+rubber+grip+pads',
            retailerLinks: buildSearchLinks(
              '2mm adhesive EPDM rubber grip pads',
              3.9
            ),
            linkedPartIds: [],
            notes: `Anti-slip clamping and surface protection pads for ${analysis.objectName}.`,
          },
        ]),
    {
      id: 'bom-filament',
      partNumber: 'FIL-01',
      name: `PETG / PLA+ 3D Printer Filament (${printedParts.length} printed parts)`,
      category: 'printed-filament' as const,
      specification: '1.75mm ±0.02mm PETG/PLA+ spool (~145g used)',
      qty: 1,
      unit: 'spool-fraction',
      unitPrice: 3.2,
      totalPrice: 3.2,
      primaryRetailer: 'Amazon' as const,
      primaryUrl: 'https://www.amazon.com/s?k=PETG+1.75mm+filament+1kg',
      retailerLinks: buildSearchLinks('PETG 1.75mm filament', 3.2),
      linkedPartIds: printedParts.map((p) => p.id),
      notes: `Covers all ${printedParts.length} 3D-printed structural parts for ${analysis.objectName}.`,
    },
  ];

  const fallbackPurchasedTotal =
    Math.round(
      synthesizedFallbackItems
        .filter((i) => i.category !== 'printed-filament')
        .reduce((s, i) => s + i.totalPrice, 0) * 100
    ) / 100;
  const fallbackDiyTotal =
    Math.round((fallbackPurchasedTotal + 3.2) * 100) / 100;
  const fallbackSavings = Math.max(
    0,
    Math.round((retailRef - fallbackDiyTotal) * 100) / 100
  );
  const fallbackSavingsPct =
    retailRef > 0
      ? Math.round((fallbackSavings / retailRef) * 1000) / 10
      : 78.0;

  const synthesizedFallbackBom: BomData = {
    currency: 'USD',
    items: synthesizedFallbackItems,
    summary: {
      purchasedPartsTotal: fallbackPurchasedTotal,
      filamentCostTotal: 3.2,
      totalDiyCost: fallbackDiyTotal,
      originalRetailPrice: retailRef,
      totalSavings: fallbackSavings,
      savingsPercent: fallbackSavingsPct,
    },
  };

  const prompt = `You are the BOM Agent (Stage 4 of 6) in "Get Me An Alt", powered by Gemini 4 Argon.
Generate the Bill of Materials (BOM) for "${analysis.objectName}".
Original commercial price: $${retailRef} USD.
Target DIY cost: ~$${diyRef} USD.

Purchased parts from Designer:
${JSON.stringify(
  purchasedParts.map((p) => ({
    id: p.id,
    partNumber: p.partNumber,
    name: p.name,
    material: p.material,
    qty: p.quantity || 1,
  }))
)}

Printed parts from Designer (${printedParts.length} parts):
${JSON.stringify(
  printedParts.map((p) => ({
    id: p.id,
    name: p.name,
    material: p.material,
    dims_mm: p.dims_mm,
  }))
)}

Use real retailer search URLs (e.g. https://www.amazon.com/s?k=..., https://www.homedepot.com/s/..., https://www.walmart.com/search?q=..., https://www.mcmaster.com/#..., https://www.aliexpress.com/w/wholesale-...).
Include 1 item per off-the-shelf component, 1 hardware/fastener pack item, and 1 "printed-filament" item covering the 3D print filament.

Return ONLY valid JSON matching this schema:
{
  "currency": "USD",
  "items": [
    {
      "id": "bom-1",
      "partNumber": "OTS-01",
      "name": "Component Name",
      "category": "hardware",
      "specification": "Key specs",
      "qty": 1,
      "unit": "pc",
      "unitPrice": 4.50,
      "totalPrice": 4.50,
      "primaryRetailer": "Amazon",
      "primaryUrl": "https://www.amazon.com/s?k=...",
      "retailerLinks": [
        { "retailer": "Amazon", "url": "https://www.amazon.com/s?k=...", "estPrice": 4.50, "inStock": true },
        { "retailer": "Walmart", "url": "https://www.walmart.com/search?q=...", "estPrice": 4.85, "inStock": true }
      ],
      "linkedPartIds": ["part-id"],
      "notes": "Assembly or sourcing note"
    }
  ],
  "summary": {
    "purchasedPartsTotal": ${estPurchasedRef},
    "filamentCostTotal": ${estFilamentRef},
    "totalDiyCost": ${diyRef},
    "originalRetailPrice": ${retailRef},
    "totalSavings": ${estSavingsRef},
    "savingsPercent": ${estSavingsPctRef}
  }
}`;

  const retryPrompt = `Generate the Bill of Materials (BOM) for "${analysis.objectName}" (retail $${retailRef}, target DIY ~$${diyRef}). Purchased parts: ${JSON.stringify(purchasedParts.map((p) => ({ id: p.id, partNumber: p.partNumber, name: p.name })))}. Include 1 item per purchased part plus 1 "printed-filament" item. Return ONLY valid JSON with keys: currency ("USD"), items (id, partNumber, name, category, specification, qty, unit, unitPrice, totalPrice, primaryRetailer, primaryUrl, retailerLinks, linkedPartIds, notes), summary (purchasedPartsTotal, filamentCostTotal, totalDiyCost, originalRetailPrice, totalSavings, savingsPercent).`;

  const result = await runGeminiAgent<BomData>({
    stageName: 'BOM',
    prompt,
    retryPrompt,
    cwd: input.cwd,
    artifactFilename: 'bom.json',
    preferRestForSpeed: true,
    timeoutMs: 30000,
    onLog: input.onLog,
    fallbackGenerator: () =>
      isPlantWaterer ? SAMPLE_BOM : synthesizedFallbackBom,
  });

  const d = result.data;
  const rawItems =
    Array.isArray(d?.items) && d.items.length >= 2
      ? d.items
      : isPlantWaterer
      ? SAMPLE_BOM.items
      : synthesizedFallbackItems;

  const normalizedItems: BomItem[] = rawItems.map((item, idx) => {
    const qty = Math.max(1, Number(item.qty) || 1);
    const unitPrice = Math.max(0.01, Number(item.unitPrice) || 4.5);
    const totalPrice =
      Math.round((Number(item.totalPrice) || qty * unitPrice) * 100) / 100;
    const links =
      Array.isArray(item.retailerLinks) && item.retailerLinks.length > 0
        ? item.retailerLinks.map((l) => ({
            retailer: l.retailer || 'Amazon',
            url:
              l.url && l.url.startsWith('http')
                ? l.url
                : `https://www.amazon.com/s?k=${encodeURIComponent(item.name || analysis.objectName)}`,
            estPrice: Number(l.estPrice) || totalPrice,
            inStock: true,
          }))
        : buildSearchLinks(item.name || analysis.objectName, unitPrice);

    return {
      id: item.id || `bom-${idx + 1}`,
      partNumber: item.partNumber || `OTS-0${idx + 1}`,
      name: item.name || `Component ${idx + 1}`,
      category:
        item.category === 'electronics' ||
        item.category === 'hardware' ||
        item.category === 'plumbing' ||
        item.category === 'power' ||
        item.category === 'consumable' ||
        item.category === 'printed-filament'
          ? item.category
          : 'hardware',
      specification: item.specification || 'Standard Maker Specification',
      qty,
      unit: item.unit || 'pc',
      unitPrice,
      totalPrice,
      primaryRetailer: item.primaryRetailer || links[0].retailer,
      primaryUrl:
        item.primaryUrl && item.primaryUrl.startsWith('http')
          ? item.primaryUrl
          : links[0].url,
      retailerLinks: links as RetailerLink[],
      linkedPartIds: Array.isArray(item.linkedPartIds)
        ? item.linkedPartIds
        : [],
      notes: item.notes || 'Readily available off-the-shelf component.',
    };
  });

  const filamentCostTotal =
    Math.round(
      normalizedItems
        .filter((i) => i.category === 'printed-filament')
        .reduce((acc, i) => acc + i.totalPrice, 0) * 100
    ) / 100 || 3.55;

  const purchasedPartsTotal =
    Math.round(
      normalizedItems
        .filter((i) => i.category !== 'printed-filament')
        .reduce((acc, i) => acc + i.totalPrice, 0) * 100
    ) / 100;

  const totalDiyCost =
    Math.round((purchasedPartsTotal + filamentCostTotal) * 100) / 100;
  const originalRetailPrice = retailRef;
  const totalSavings = Math.max(
    0,
    Math.round((originalRetailPrice - totalDiyCost) * 100) / 100
  );
  const savingsPercent =
    originalRetailPrice > 0
      ? Math.round((totalSavings / originalRetailPrice) * 1000) / 10
      : 75;

  const normalized: BomData = {
    currency: 'USD',
    items: normalizedItems,
    summary: {
      purchasedPartsTotal,
      filamentCostTotal,
      totalDiyCost,
      originalRetailPrice,
      totalSavings,
      savingsPercent,
    },
  };

  fs.writeFileSync(
    path.join(input.cwd, 'bom.json'),
    JSON.stringify(normalized, null, 2)
  );

  return {
    ...result,
    data: normalized,
  };
}
