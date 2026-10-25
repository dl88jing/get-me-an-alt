// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-04 — 4-Wheel V-Slot Gantry Carriage Deck with Eccentric Bores (gantry-carriage-plate)
// Function: Travels linearly along the 2020 rails carrying the pan/tilt head.
// Target Bounding Box (mm): [124, 108, 14]
// Print Material: PETG | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 124;
part_depth = 108;
part_height = 14;
wall_thickness = 3.6;
floor_thickness = 3.6;
corner_radius = 12;
tolerance = 0.2;
m3_clearance_d = 3.4; // M3 screw clearance hole (3.0mm + 2*0.2mm)

module rounded_rect_prism(w, d, h, r) {
  cr = max(0.5, min(r, min(w, d) / 2 - 0.1));
  linear_extrude(height = h)
    offset(r = cr)
      offset(r = -cr)
        square([w, d], center = true);
}

module part_gantry_carriage_plate() {
  difference() {
    rounded_rect_prism(part_width, part_depth, part_height, corner_radius);
    translate([-42, -38, -1]) cylinder(h = part_height + 2, r = 2.6 + tolerance);
    translate([42, -38, -1]) cylinder(h = part_height + 2, r = 2.6 + tolerance);
    translate([-42, 38, -1]) cylinder(h = part_height + 2, r = 3.6 + tolerance);
    translate([42, 38, -1]) cylinder(h = part_height + 2, r = 3.6 + tolerance);
    // M3 corner mounting holes
    for (mx = [-1, 1], my = [-1, 1]) {
      translate([mx * (part_width / 2 - 8), my * (part_depth / 2 - 8), -1])
        cylinder(h = part_height + 2, d = m3_clearance_d);
    }
  }
}

part_gantry_carriage_plate();
