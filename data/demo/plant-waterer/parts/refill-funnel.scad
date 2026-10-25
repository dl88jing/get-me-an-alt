// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-04 — Wide-Mouth Top Refill Funnel (refill-funnel)
// Function: Fits into the 22mm corner port on the reservoir lid for easy refilling.
// Target Bounding Box (mm): [54, 54, 38]
// Print Material: PLA | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 54;
part_depth = 54;
part_height = 38;
wall_thickness = 2.2;
floor_thickness = 2.2;
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

module part_refill_funnel() {
  difference() {
    union() {
      // Lower insertion spout
      cylinder(h = 14, r = 9 - tolerance);
      // Upper conical funnel body
      translate([0, 0, 14])
        cylinder(h = 24, r1 = 9, r2 = 27);
    }
    // Hollow internal flow passage
    translate([0, 0, -0.5])
      cylinder(h = 15, r = 6.8);
    translate([0, 0, 13.8])
      cylinder(h = 25, r1 = 6.8, r2 = 24.8);
  }
}

part_refill_funnel();
