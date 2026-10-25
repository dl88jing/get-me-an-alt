# Get Me An Alt — Parametric CAD, STL/3MF Exporter & Plate Packer

Zero-dependency TypeScript CAD engine for generating watertight 3D-printable meshes, packing parts onto the minimum number of build plates, and exporting binary `.stl` and multi-object `.3mf` files.

## Module Overview

- `lib/printers.ts` — `PRINTERS`, `DEFAULT_PRINTER_ID` (`"bambu-a1"`), `DEFAULT_PRINTER`, `getPrinterById(id)`.
- `lib/cad/parts.ts` — `PrintedPart`, `PurchasedPart`, `AssemblyNode`, `DesignSpec`, `PrintedPartShape`.
- `lib/cad/geometry.ts` — `generatePartMesh(part)`, `validateManifold(mesh)`, `transformMesh(mesh, opts)`, `TriangleMesh`.
- `lib/cad/stl.ts` — `meshToBinaryStl(mesh, label)`, `writePlate3mf(items, opts)`, `createStoreZip(entries)`.
- `lib/cad/packer.ts` — `packParts(parts, bed, opts)`, `packPrintedParts(printedParts, bed, opts)`.

## Usage in API Routes & UI Components

### 1. Select Printer & Generate Meshes

```ts
import { getPrinterById, DEFAULT_PRINTER_ID } from "@/lib/printers";
import { generatePartMesh, validateManifold } from "@/lib/cad/geometry";
import type { DesignSpec } from "@/lib/cad/parts";

const printer = getPrinterById(printerId ?? DEFAULT_PRINTER_ID);
const mesh = generatePartMesh(design.printedParts[0]); // { positions, indices, normals, bbox }
const check = validateManifold(mesh); // { isManifold: true, triangleCount, volumeMm3, ... }
```

### 2. Render `TriangleMesh` in `@react-three/fiber` (Exploded View / IKEA Player)

```tsx
import * as THREE from "three";
import { generatePartMesh } from "@/lib/cad/geometry";

function PartGeometry({ part }: { part: { shape: any; params: Record<string, any> } }) {
  const mesh = generatePartMesh(part);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return <primitive object={geometry} attach="geometry" />;
}
```

### 3. Pack Parts onto Fewest Build Plates & Export STL / 3MF

```ts
import { packPrintedParts } from "@/lib/cad/packer";
import { meshToBinaryStl, writePlate3mf } from "@/lib/cad/stl";

// 1. Pack all printed parts (with quantities, 90° rotation, 5mm margin, 5mm spacing)
const packed = packPrintedParts(design.printedParts, printer.bed);
// packed.plates => [{ index, items: [{ partId, copy, x, y, rotated, width, depth, height }], utilization }]
// packed.rejected => oversized parts with splitting suggestions

// 2. Export individual part binary STL
const stlBytes: Uint8Array = meshToBinaryStl(mesh, part.id);

// 3. Export full build plate as a slicer-ready .3mf archive
const plate3mfBytes: Uint8Array = writePlate3mf(
  packed.plates[0].items.map((item) => ({
    partId: item.partId,
    copy: item.copy,
    mesh: meshesById.get(item.partId)!,
    x: item.x,
    y: item.y,
    centerX: item.centerX,
    centerY: item.centerY,
    rotated: item.rotated,
  })),
  { printerName: printer.name, plateIndex: 0 }
);
```
