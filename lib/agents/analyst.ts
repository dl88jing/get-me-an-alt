import { AgentLogEntry, ObjectAnalysis } from '../types';
import { SAMPLE_ANALYSIS } from '../sample-data';
import { runGeminiAgent, RunAgentResult } from './runner';

export interface AnalystInput {
  prompt?: string;
  url?: string;
  imageName?: string;
  inlineImage?: {
    mimeType: string;
    base64Data: string;
  };
  cwd: string;
  onLog?: (entry: AgentLogEntry) => void;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 36) || 'diy-gadget'
  );
}

export async function runAnalystAgent(
  input: AnalystInput
): Promise<RunAgentResult<ObjectAnalysis>> {
  const userSubject =
    input.prompt?.trim() ||
    input.url?.trim() ||
    input.imageName ||
    'Smart Plant Auto-Waterer';

  const inputType: ObjectAnalysis['inputType'] = input.inlineImage
    ? 'image'
    : input.url
    ? input.url.includes('youtube.com') || input.url.includes('youtu.be') || input.url.includes('tiktok.com')
      ? 'video'
      : 'url'
    : 'prompt';

  const prompt = `You are the Analyst Agent (Stage 1 of 6) in "Get Me An Alt", an AI hardware reverse-engineering pipeline powered by Gemini 4 Argon.
The user wants a DIY 3D-printed + off-the-shelf alternative to the following pricey commercial gadget:
Input Subject / URL / Description: "${userSubject}"
${input.url ? `Source URL: ${input.url}` : ''}
${input.inlineImage ? 'An image of the target object is attached. Inspect its geometry, mechanisms, and commercial price.' : ''}

Analyze this product and return a JSON object matching this exact TypeScript interface:
{
  "objectName": "Concise DIY project name (e.g. 'StudioPro Articulated Tabletop Art Easel' or 'HydroPulse Smart Plant Auto-Waterer')",
  "slug": "kebab-case-slug",
  "category": "Product category",
  "tagline": "One-sentence compelling engineering summary",
  "description": "2-3 sentence explanation of why the commercial version is overpriced and how the 3D-printed + off-the-shelf DIY version replicates its function at a fraction of the cost",
  "functionSummary": "How the mechanical/electronic system works",
  "inputType": "${inputType}",
  "originalProduct": {
    "name": "Commercial product name",
    "brand": "Commercial brand",
    "retailPrice": 149.0,
    "currency": "USD",
    "url": "${input.url || 'https://www.amazon.com/s?k=' + encodeURIComponent(userSubject)}",
    "whyExpensive": "Why the commercial gadget costs so much"
  },
  "targetDiyCost": 26.5,
  "estimatedSavings": 122.5,
  "estimatedPrintTimeHours": 3.5,
  "estimatedAssemblyMinutes": 25,
  "difficulty": "Beginner",
  "overallDimensionsMm": [150, 140, 120],
  "keyMechanisms": ["3 to 4 key mechanical or electronic mechanisms"],
  "engineeringNotes": ["3 practical 3D printing & structural engineering notes (infill, perimeters, tolerances)"],
  "materialsNeeded": ["Recommended filament types and off-the-shelf hardware summary"],
  "whatGetsPrinted": ["5 to 7 specific 3D printed parts with PRT-01..PRT-07 prefixes"],
  "whatGetsBought": ["4 to 5 specific off-the-shelf parts with OTS-01..OTS-05 prefixes"]
}`;

  const result = await runGeminiAgent<ObjectAnalysis>({
    stageName: 'Analyst',
    prompt,
    cwd: input.cwd,
    artifactFilename: 'analysis.json',
    inlineImage: input.inlineImage,
    onLog: input.onLog,
    fallbackGenerator: () => {
      if (
        userSubject.toLowerCase().includes('water') ||
        userSubject.toLowerCase().includes('plant')
      ) {
        return SAMPLE_ANALYSIS;
      }
      const cleanTitle = userSubject
        .replace(/^https?:\/\/(www\.)?/i, '')
        .replace(/\.[a-z]{2,4}\/.*$/i, '')
        .slice(0, 48);
      return {
        ...SAMPLE_ANALYSIS,
        objectName: `DIY ${cleanTitle} Alternative`,
        slug: slugify(cleanTitle),
        inputUrl: input.url,
        inputType,
      };
    },
  });

  // Normalize fields
  const d = result.data;
  const retail = Number(d?.originalProduct?.retailPrice) || 149;
  const diy = Number(d?.targetDiyCost) || 25;
  const normalized: ObjectAnalysis = {
    objectName: d?.objectName || SAMPLE_ANALYSIS.objectName,
    slug: slugify(d?.slug || d?.objectName || userSubject),
    category: d?.category || 'Hardware & Gadgets',
    tagline: d?.tagline || SAMPLE_ANALYSIS.tagline,
    description: d?.description || SAMPLE_ANALYSIS.description,
    functionSummary: d?.functionSummary || SAMPLE_ANALYSIS.functionSummary,
    inputUrl: input.url || d?.inputUrl,
    inputType,
    originalProduct: {
      name: d?.originalProduct?.name || `${d?.objectName || userSubject} Commercial Pro`,
      brand: d?.originalProduct?.brand || 'Commercial OEM',
      retailPrice: retail,
      currency: 'USD',
      url:
        input.url ||
        d?.originalProduct?.url ||
        `https://www.amazon.com/s?k=${encodeURIComponent(d?.objectName || userSubject)}`,
      whyExpensive:
        d?.originalProduct?.whyExpensive || SAMPLE_ANALYSIS.originalProduct.whyExpensive,
    },
    targetDiyCost: diy,
    estimatedSavings: Math.max(0, Math.round((retail - diy) * 100) / 100),
    estimatedPrintTimeHours: Number(d?.estimatedPrintTimeHours) || 3.5,
    estimatedAssemblyMinutes: Number(d?.estimatedAssemblyMinutes) || 25,
    difficulty:
      d?.difficulty === 'Beginner' ||
      d?.difficulty === 'Intermediate' ||
      d?.difficulty === 'Advanced'
        ? d.difficulty
        : 'Beginner',
    overallDimensionsMm:
      Array.isArray(d?.overallDimensionsMm) && d.overallDimensionsMm.length === 3
        ? [
            Number(d.overallDimensionsMm[0]) || 145,
            Number(d.overallDimensionsMm[1]) || 148,
            Number(d.overallDimensionsMm[2]) || 120,
          ]
        : [145, 148, 120],
    keyMechanisms:
      Array.isArray(d?.keyMechanisms) && d.keyMechanisms.length > 0
        ? d.keyMechanisms
        : SAMPLE_ANALYSIS.keyMechanisms,
    engineeringNotes:
      Array.isArray(d?.engineeringNotes) && d.engineeringNotes.length > 0
        ? d.engineeringNotes
        : SAMPLE_ANALYSIS.engineeringNotes,
    materialsNeeded:
      Array.isArray(d?.materialsNeeded) && d.materialsNeeded.length > 0
        ? d.materialsNeeded
        : SAMPLE_ANALYSIS.materialsNeeded,
    whatGetsPrinted:
      Array.isArray(d?.whatGetsPrinted) && d.whatGetsPrinted.length > 0
        ? d.whatGetsPrinted
        : SAMPLE_ANALYSIS.whatGetsPrinted,
    whatGetsBought:
      Array.isArray(d?.whatGetsBought) && d.whatGetsBought.length > 0
        ? d.whatGetsBought
        : SAMPLE_ANALYSIS.whatGetsBought,
  };

  return {
    ...result,
    data: normalized,
  };
}
