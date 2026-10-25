// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-05 — Swirl-Recovery Acoustic Diffuser Transition Cone (diffuser-stator-cone)
// Function: Transitions circular blower outlet into the oval airfoil neck.
// Target Bounding Box (mm): [146, 146, 52]
// Print Material: PLA+ | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 146;
part_depth = 146;
part_height = 52;
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

module part_diffuser_stator_cone() {
  difference() {
    union() {
      // Lower insertion spout
      cylinder(h = 16, r = 34 - tolerance);
      // Upper conical funnel body
      translate([0, 0, 16])
        cylinder(h = 36, r1 = 34, r2 = 73);
    }
    // Hollow internal flow passage
    translate([0, 0, -0.5])
      cylinder(h = 17, r = 31);
    translate([0, 0, 15.8])
      cylinder(h = 37, r1 = 31, r2 = 70);
  }
}

part_diffuser_stator_cone();
