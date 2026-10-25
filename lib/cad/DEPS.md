# CAD & Plate Packer Module Dependencies

The modules in `lib/printers.ts` and `lib/cad/*` (`parts.ts`, `geometry.ts`, `stl.ts`, `packer.ts`) are **100% self-contained, zero-dependency TypeScript** using standard ECMAScript `Float32Array`, `Uint32Array`, `Uint8Array`, and `DataView`. They run identically in Node.js (API routes / CLI scripts) and the browser (Next.js client components / Web Workers).

## Required Runtime Dependencies
- **None** for `lib/printers.ts`, `lib/cad/parts.ts`, `lib/cad/geometry.ts`, `lib/cad/stl.ts`, and `lib/cad/packer.ts`.

## Development / CLI Script Dependencies
Include these in `devDependencies` of the root `package.json`:
- `typescript` (`^5.6.0` or newer) — for `npx tsc --noEmit -p cad.tsconfig.json`
- `tsx` (`^4.19.0` or newer) — for executing `npx tsx scripts/gen-demo-prints.ts`
- `@types/node` (`^22.0.0`) — Node.js types used by `scripts/gen-demo-prints.ts` (`node:fs`, `node:path`)

## Optional 3D Viewer Dependencies (for Next.js UI integration)
When rendering `TriangleMesh` buffers (`positions`, `indices`, `normals`) in the Exploded View and IKEA Assembly Player:
- `three` (`^0.170.0`)
- `@types/three` (`^0.170.0`)
- `@react-three/fiber` (`^8.17.0` or `^9.0.0`)
- `@react-three/drei` (`^9.114.0` or `^10.0.0`)
