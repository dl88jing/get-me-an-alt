// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-01 — Acoustic Weighted Base Pan & Vibration Ring (weighted-base-pan)
// Function: Anchors the tower and seals the bottom of the HEPA cartridge.
// Target Bounding Box (mm): [168, 168, 32]
// Print Material: PETG | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 168;
part_depth = 168;
part_height = 32;
wall_thickness = 3.6;
floor_thickness = 4.5;
corner_radius = 28;
tolerance = 0.2;
m3_clearance_d = 3.4; // M3 screw clearance hole (3.0mm + 2*0.2mm)

module rounded_rect_prism(w, d, h, r) {
  cr = max(0.5, min(r, min(w, d) / 2 - 0.1));
  linear_extrude(height = h)
    offset(r = cr)
      offset(r = -cr)
        square([w, d], center = true);
}

module part_weighted_base_pan() {
  difference() {
    // Outer watertight vessel with rounded corners
    rounded_rect_prism(part_width, part_depth, part_height, corner_radius);
    // Inner cavity (walls >= 1.6mm, reinforced floor)
    translate([0, 0, floor_thickness])
      rounded_rect_prism(
        part_width - 2 * wall_thickness,
        part_depth - 2 * wall_thickness,
        part_height,
        max(1.0, corner_radius - wall_thickness)
      );
    // Top snap-fit lid rabbet lip (0.2mm clearance)
    translate([0, 0, part_height - 3.0])
      rounded_rect_prism(
        part_width - wall_thickness + 2 * tolerance,
        part_depth - wall_thickness + 2 * tolerance,
        4.0,
        max(1.0, corner_radius - wall_thickness * 0.5)
      );
  }
}

part_weighted_base_pan();
