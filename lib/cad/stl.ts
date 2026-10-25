import { TriangleMesh } from "./geometry";

export interface ZipEntry {
  /** Path inside archive using forward slashes, e.g. "3D/3dmodel.model" */
  path: string;
  /** File content as UTF-8 string or raw bytes */
  data: string | Uint8Array;
}

export interface Plate3mfItem {
  partId: string;
  name?: string;
  copy?: number;
  mesh: TriangleMesh;
  /** Min-corner X position on bed in mm (or center X if isCenteredOffset is true) */
  x: number;
  /** Min-corner Y position on bed in mm (or center Y if isCenteredOffset is true) */
  y: number;
  /** Optional explicit center X on bed in mm */
  centerX?: number;
  /** Optional explicit center Y on bed in mm */
  centerY?: number;
  /** Optional Z offset in mm (default 0) */
  z?: number;
  /** Whether rotated 90 degrees in XY on the print plate */
  rotated?: boolean;
  /** Optional hex color for metadata */
  color?: string;
}

export interface Plate3mfOptions {
  title?: string;
  printerName?: string;
  plateIndex?: number;
  /** If true, item.x and item.y are already center coordinates rather than min-corner coordinates */
  isCenteredOffset?: boolean;
}

// Precomputed IEEE 802.3 CRC-32 lookup table
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const textEncoder = new TextEncoder();

function toBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === "string" ? textEncoder.encode(input) : input;
}

/**
 * Tiny zero-dependency store-only (compression method 0) PKZIP writer.
 * Used to package 3MF archives without external zip libraries.
 */
export function createStoreZip(entries: ZipEntry[]): Uint8Array {
  const prepared = entries.map((entry) => {
    const cleanPath = entry.path.replace(/^\/+/, "");
    const nameBytes = textEncoder.encode(cleanPath);
    const dataBytes = toBytes(entry.data);
    const crc = computeCrc32(dataBytes);
    return {
      nameBytes,
      dataBytes,
      crc,
      localHeaderOffset: 0,
    };
  });

  // Calculate total byte size
  let localSectionSize = 0;
  let centralDirSize = 0;
  for (const item of prepared) {
    item.localHeaderOffset = localSectionSize;
    localSectionSize += 30 + item.nameBytes.length + item.dataBytes.length;
    centralDirSize += 46 + item.nameBytes.length;
  }
  const eocdSize = 22;
  const totalSize = localSectionSize + centralDirSize + eocdSize;

  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);
  let offset = 0;

  // DOS timestamp (fixed clean date: 2026-10-25 12:00:00)
  const dosTime = (12 << 11) | (0 << 5) | 0;
  const dosDate = ((2026 - 1980) << 9) | (10 << 5) | 25;

  // 1. Write Local File Headers + file payloads
  for (const item of prepared) {
    view.setUint32(offset, 0x04034b50, true); // Local file header signature
    view.setUint16(offset + 4, 20, true); // Version needed to extract (2.0)
    view.setUint16(offset + 6, 0x0800, true); // General purpose bit flag (UTF-8)
    view.setUint16(offset + 8, 0, true); // Compression method: 0 (STORE)
    view.setUint16(offset + 10, dosTime, true);
    view.setUint16(offset + 12, dosDate, true);
    view.setUint32(offset + 14, item.crc, true);
    view.setUint32(offset + 18, item.dataBytes.length, true); // Compressed size
    view.setUint32(offset + 22, item.dataBytes.length, true); // Uncompressed size
    view.setUint16(offset + 26, item.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true); // Extra field length
    offset += 30;

    out.set(item.nameBytes, offset);
    offset += item.nameBytes.length;

    out.set(item.dataBytes, offset);
    offset += item.dataBytes.length;
  }

  const centralDirOffset = offset;

  // 2. Write Central Directory File Headers
  for (const item of prepared) {
    view.setUint32(offset, 0x02014b50, true); // Central directory file header signature
    view.setUint16(offset + 4, 20, true); // Version made by
    view.setUint16(offset + 6, 20, true); // Version needed to extract
    view.setUint16(offset + 8, 0x0800, true); // UTF-8 flag
    view.setUint16(offset + 10, 0, true); // Compression method: 0 (STORE)
    view.setUint16(offset + 12, dosTime, true);
    view.setUint16(offset + 14, dosDate, true);
    view.setUint32(offset + 16, item.crc, true);
    view.setUint32(offset + 20, item.dataBytes.length, true);
    view.setUint32(offset + 24, item.dataBytes.length, true);
    view.setUint16(offset + 28, item.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // Extra field length
    view.setUint16(offset + 32, 0, true); // File comment length
    view.setUint16(offset + 34, 0, true); // Disk number start
    view.setUint16(offset + 36, 0, true); // Internal file attributes
    view.setUint32(offset + 38, 0, true); // External file attributes
    view.setUint32(offset + 42, item.localHeaderOffset, true);
    offset += 46;

    out.set(item.nameBytes, offset);
    offset += item.nameBytes.length;
  }

  // 3. Write End of Central Directory Record (EOCD)
  view.setUint32(offset, 0x06054b50, true); // EOCD signature
  view.setUint16(offset + 4, 0, true); // Number of this disk
  view.setUint16(offset + 6, 0, true); // Disk where central directory starts
  view.setUint16(offset + 8, prepared.length, true); // Entries on this disk
  view.setUint16(offset + 10, prepared.length, true); // Total entries
  view.setUint32(offset + 12, centralDirSize, true); // Size of central directory
  view.setUint32(offset + 16, centralDirOffset, true); // Offset of central directory
  view.setUint16(offset + 20, 0, true); // Comment length

  return out;
}

/**
 * Serializes a TriangleMesh into standard binary STL format (80-byte header + uint32 count + 50B/tri).
 */
export function meshToBinaryStl(
  mesh: TriangleMesh,
  headerLabel = "GetMeAnAlt Binary STL (mm)"
): Uint8Array {
  const { positions, indices } = mesh;
  const triCount = Math.floor(indices.length / 3);
  const byteLength = 84 + triCount * 50;
  const buffer = new Uint8Array(byteLength);
  const view = new DataView(buffer.buffer);

  // 80-byte header (ensure it never starts with "solid" to avoid ASCII STL misdetection)
  const safeHeader = headerLabel.replace(/^solid/i, "binary").slice(0, 79);
  const headerBytes = textEncoder.encode(safeHeader);
  buffer.set(headerBytes, 0);

  // Triangle count at byte 80
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const x0 = positions[i0];
    const y0 = positions[i0 + 1];
    const z0 = positions[i0 + 2];

    const x1 = positions[i1];
    const y1 = positions[i1 + 1];
    const z1 = positions[i1 + 2];

    const x2 = positions[i2];
    const y2 = positions[i2 + 1];
    const z2 = positions[i2 + 2];

    // Compute outward face normal from cross product (v1 - v0) x (v2 - v0)
    const ux = x1 - x0;
    const uy = y1 - y0;
    const uz = z1 - z0;
    const vx = x2 - x0;
    const vy = y2 - y0;
    const vz = z2 - z0;

    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = 0;
      ny = 0;
      nz = 1;
    }

    // Normal vector (3x float32)
    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);

    // Vertex 1
    view.setFloat32(offset + 12, x0, true);
    view.setFloat32(offset + 16, y0, true);
    view.setFloat32(offset + 20, z0, true);

    // Vertex 2
    view.setFloat32(offset + 24, x1, true);
    view.setFloat32(offset + 28, y1, true);
    view.setFloat32(offset + 32, z1, true);

    // Vertex 3
    view.setFloat32(offset + 36, x2, true);
    view.setFloat32(offset + 40, y2, true);
    view.setFloat32(offset + 44, z2, true);

    // Attribute byte count (uint16 = 0)
    view.setUint16(offset + 48, 0, true);

    offset += 50;
  }

  return buffer;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(n: number): string {
  return Number(n.toFixed(4)).toString();
}

/**
 * Generates the ASCII 3MF `3D/3dmodel.model` XML document for a build plate with multiple placed objects.
 * Reuses mesh resource definitions when multiple copies of the same `partId` are placed on the plate.
 */
export function createPlate3mfModelXml(
  items: Plate3mfItem[],
  options: Plate3mfOptions = {}
): string {
  const title = options.title ?? `Print Plate ${options.plateIndex !== undefined ? options.plateIndex + 1 : 1}`;
  const uniqueObjects = new Map<string, { objectId: number; name: string; mesh: TriangleMesh }>();
  let nextObjId = 1;

  for (const item of items) {
    if (!uniqueObjects.has(item.partId)) {
      uniqueObjects.set(item.partId, {
        objectId: nextObjId++,
        name: item.name ?? item.partId,
        mesh: item.mesh,
      });
    }
  }

  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">`,
    `  <metadata name="Title">${escapeXml(title)}</metadata>`,
    `  <metadata name="Application">GetMeAnAlt-CAD</metadata>`,
  ];

  if (options.printerName) {
    lines.push(`  <metadata name="Printer">${escapeXml(options.printerName)}</metadata>`);
  }

  lines.push(`  <resources>`);

  for (const [partId, obj] of uniqueObjects.entries()) {
    const { positions, indices } = obj.mesh;
    lines.push(
      `    <object id="${obj.objectId}" name="${escapeXml(obj.name)} (${escapeXml(partId)})" type="model">`,
      `      <mesh>`,
      `        <vertices>`
    );

    for (let i = 0; i < positions.length; i += 3) {
      lines.push(
        `          <vertex x="${fmt(positions[i])}" y="${fmt(positions[i + 1])}" z="${fmt(positions[i + 2])}" />`
      );
    }

    lines.push(`        </vertices>`, `        <triangles>`);

    for (let i = 0; i < indices.length; i += 3) {
      lines.push(
        `          <triangle v1="${indices[i]}" v2="${indices[i + 1]}" v3="${indices[i + 2]}" />`
      );
    }

    lines.push(`        </triangles>`, `      </mesh>`, `    </object>`);
  }

  lines.push(`  </resources>`, `  <build>`);

  for (const item of items) {
    const obj = uniqueObjects.get(item.partId)!;
    const rotated = Boolean(item.rotated);
    const rawW = obj.mesh.bbox.size[0];
    const rawD = obj.mesh.bbox.size[1];
    const placedW = rotated ? rawD : rawW;
    const placedD = rotated ? rawW : rawD;

    const tx =
      item.centerX !== undefined
        ? item.centerX
        : options.isCenteredOffset
          ? item.x
          : item.x + placedW * 0.5;
    const ty =
      item.centerY !== undefined
        ? item.centerY
        : options.isCenteredOffset
          ? item.y
          : item.y + placedD * 0.5;
    const tz = item.z ?? 0;

    // 3MF 3x4 affine matrix: "m00 m01 m02 m10 m11 m12 m20 m21 m22 tx ty tz"
    // 90 deg CCW around Z: x' = -y + tx, y' = x + ty, z' = z + tz
    const matrix = rotated
      ? `0 1 0 -1 0 0 0 0 1 ${fmt(tx)} ${fmt(ty)} ${fmt(tz)}`
      : `1 0 0 0 1 0 0 0 1 ${fmt(tx)} ${fmt(ty)} ${fmt(tz)}`;

    lines.push(`    <item objectid="${obj.objectId}" transform="${matrix}" />`);
  }

  lines.push(`  </build>`, `</model>`, ``);
  return lines.join("\n");
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>
`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>
`;

/**
 * Writes a complete 3MF package (store-only ZIP buffer) for one build plate with multiple placed objects.
 */
export function writePlate3mf(
  items: Plate3mfItem[],
  options: Plate3mfOptions = {}
): Uint8Array {
  const modelXml = createPlate3mfModelXml(items, options);
  return createStoreZip([
    { path: "[Content_Types].xml", data: CONTENT_TYPES_XML },
    { path: "_rels/.rels", data: RELS_XML },
    { path: "3D/3dmodel.model", data: modelXml },
  ]);
}
