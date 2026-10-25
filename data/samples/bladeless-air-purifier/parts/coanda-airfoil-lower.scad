// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-07 — Coanda Airfoil Loop — Lower Plenum Split Ring (coanda-airfoil-lower)
// Function: Forms the lower 180° arc of the Coanda air-multiplier nozzle.
// Target Bounding Box (mm): [190, 190, 115]
// Print Material: Matte PLA+ | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 190;
part_depth = 190;
part_height = 115;
wall_thickness = 3;
floor_thickness = 3;
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

module part_coanda_airfoil_lower() {
  difference() {
    union() {
      // Base mounting flange
      cylinder(h = 4, r = 95);
      // Cylindrical isolation collar
      cylinder(h = part_height, r = 95);
    }
    // Central bore with 0.2mm fit tolerance
    translate([0, 0, -1])
      cylinder(h = part_height + 2, r = 72 + tolerance);
    // Side water intake relief slots
    for (ang = [0, 90, 180, 270]) {
      rotate([0, 0, ang])
        translate([0, 0, part_height * 0.55])
          cube([209, 5.0, part_height * 0.45], center = true);
      // Flange M3 anchor holes
      rotate([0, 0, ang + 45])
        translate([90.5, 0, -1])
          cylinder(h = 6, d = m3_clearance_d);
    }
  }
}

part_coanda_airfoil_lower();
