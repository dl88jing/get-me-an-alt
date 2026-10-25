// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-05 — Axis-2 Rotary Pan Turntable Housing & 6808 Bearing Seat (pan-turntable-housing)
// Function: Supports and drives 360° continuous horizontal camera panning.
// Target Bounding Box (mm): [102, 102, 46]
// Print Material: PLA+ | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 102;
part_depth = 102;
part_height = 46;
wall_thickness = 3.5;
floor_thickness = 3.5;
corner_radius = 4;
tolerance = 0.2;
m3_clearance_d = 3.4; // M3 screw clearance hole (3.0mm + 2*0.2mm)

module rounded_rect_prism(w, d, h, r) {
  cr = max(0.5, min(r, min(w, d) / 2 - 0.1));
  linear_extrude(height = h)
    offset(r = cr)
      offset(r = -cr)
        square([w, d], center = true);
}

module part_pan_turntable_housing() {
  difference() {
    union() {
      // Base mounting flange
      cylinder(h = 5, r = 51);
      // Cylindrical isolation collar
      cylinder(h = part_height, r = 51);
    }
    // Central bore with 0.2mm fit tolerance
    translate([0, 0, -1])
      cylinder(h = part_height + 2, r = 38 + tolerance);
    // Side water intake relief slots
    for (ang = [0, 90, 180, 270]) {
      rotate([0, 0, ang])
        translate([0, 0, part_height * 0.55])
          cube([112.2, 5.0, part_height * 0.45], center = true);
      // Flange M3 anchor holes
      rotate([0, 0, ang + 45])
        translate([46.5, 0, -1])
          cylinder(h = 7, d = m3_clearance_d);
    }
  }
}

part_pan_turntable_housing();
