// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-06 — J4 Hollow Wrist-Roll Forearm Barrel (120mm) (forearm-tube)
// Function: Provides J4 axial roll motion between elbow and wrist clevis.
// Target Bounding Box (mm): [48, 48, 120]
// Print Material: PLA+ | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 48;
part_depth = 48;
part_height = 120;
wall_thickness = 3.2;
floor_thickness = 3.2;
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

module part_forearm_tube() {
  difference() {
    union() {
      // Base mounting flange
      cylinder(h = 5, r = 24);
      // Cylindrical isolation collar
      cylinder(h = part_height, r = 22);
    }
    // Central bore with 0.2mm fit tolerance
    translate([0, 0, -1])
      cylinder(h = part_height + 2, r = 16 + tolerance);
    // Side water intake relief slots
    for (ang = [0, 90, 180, 270]) {
      rotate([0, 0, ang])
        translate([0, 0, part_height * 0.55])
          cube([52.8, 5.0, part_height * 0.45], center = true);
      // Flange M3 anchor holes
      rotate([0, 0, ang + 45])
        translate([19.5, 0, -1])
          cylinder(h = 7, d = m3_clearance_d);
    }
  }
}

part_forearm_tube();
