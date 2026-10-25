// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-03 — Twist-Lock HEPA H13 Filter Compression Retainer (hepa-filter-frame)
// Function: Prevents unfiltered air bypass between intake shell and blower.
// Target Bounding Box (mm): [160, 160, 16]
// Print Material: PETG | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 160;
part_depth = 160;
part_height = 16;
wall_thickness = 3.2;
floor_thickness = 3.2;
corner_radius = 24;
tolerance = 0.2;
m3_clearance_d = 3.4; // M3 screw clearance hole (3.0mm + 2*0.2mm)

module rounded_rect_prism(w, d, h, r) {
  cr = max(0.5, min(r, min(w, d) / 2 - 0.1));
  linear_extrude(height = h)
    offset(r = cr)
      offset(r = -cr)
        square([w, d], center = true);
}

module part_hepa_filter_frame() {
  difference() {
    rounded_rect_prism(part_width, part_depth, part_height, corner_radius);
    translate([0, 0, -1]) cylinder(h = part_height + 2, r = 48 + tolerance);
    // M3 corner mounting holes
    for (mx = [-1, 1], my = [-1, 1]) {
      translate([mx * (part_width / 2 - 8), my * (part_depth / 2 - 8), -1])
        cylinder(h = part_height + 2, d = m3_clearance_d);
    }
  }
}

part_hepa_filter_frame();
