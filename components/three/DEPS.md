# 3D Viewer Components — Dependencies (`components/three`)

Drop-in React client components (`"use client"`) built for **Next.js App Router + Tailwind CSS + Three.js (`@react-three/fiber` & `@react-three/drei`)**.

## Required Runtime Dependencies

Install in the root Next.js project:

```bash
npm install three @react-three/fiber @react-three/drei
```

### Recommended Versions (`package.json`)

```json
{
  "dependencies": {
    "@react-three/drei": "^9.117.0",
    "@react-three/fiber": "^8.17.10",
    "three": "^0.170.0"
  },
  "devDependencies": {
    "@types/three": "^0.170.0"
  }
}
```

> **Note for React 19 / Next.js 15:** If using React 19, install with `--legacy-peer-deps` or use `@react-three/fiber@^9.0.0` + `@react-three/drei@^10.0.0`. All components in `components/three/` use standard R3F primitives (`<Canvas>`, `useFrame`, `useThree`) and Drei helpers (`OrbitControls`, `Html`, `ContactShadows`, `Line`, `RoundedBox`) compatible with both R3F v8 and v9.

## Zero External Icon / CAD Dependencies

- **Standalone Geometry (`components/three/shapes.tsx`)**: All 10 parametric shapes (`box`, `cylinder`, `tube`, `bracketL`, `plate_with_holes`, `hook`, `clip`, `funnel`, `gear_simple`, `custom_csg`) are generated purely with `three` (`BufferGeometry`, `ExtrudeGeometry`, `LatheGeometry`, `CylinderGeometry`, `BoxGeometry`). Does **not** require `lib/cad` to be present.
- **Self-Contained Icons**: All UI controls and IKEA tool icons (`screwdriver`, `hex key`, `hand/snap`, `tube`) use inline SVGs — no external icon library required.

## Exported Components

- `components/three/ExplodedView.tsx` — `<ExplodedView design={design} bom={bom} instructions={instructions} />`
- `components/three/AssemblyPlayer.tsx` — `<AssemblyPlayer design={design} instructions={instructions} externalStep={...} onStepDone={...} />` + `driveAssemblyPlayer(...)`
- `components/three/PlatePreview.tsx` — `<PlatePreview plates={plates} design={design} />`
- `components/three/demo.tsx` — `<DemoViewer design={...} instructions={...} bom={...} plates={...} />` (includes full inline 10-part Self-Watering Plant System fallback)
- `components/three/shapes.tsx` — `buildPartGeometry(shape, params)` and `<PartGeometry />`
- `components/three/types.ts` — Full TypeScript interfaces and data normalization helpers
