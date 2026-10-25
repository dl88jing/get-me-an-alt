// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-04 — J2–J3 Triangulated Truss Lower Arm Link (145mm) (lower-arm-link)
// Function: Primary vertical lifting link between J2 and J3.
// Target Bounding Box (mm): [52, 44, 145]
// Print Material: PETG | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 52;
part_depth = 44;
part_height = 145;
wall_thickness = 3.6;
floor_thickness = 3.6;
corner_radius = 6;
tolerance = 0.2;
m3_clearance_d = 3.4; // M3 screw clearance hole (3.0mm + 2*0.2mm)

module rounded_rect_prism(w, d, h, r) {
  cr = max(0.5, min(r, min(w, d) / 2 - 0.1));
  linear_extrude(height = h)
    offset(r = cr)
      offset(r = -cr)
        square([w, d], center = true);
}

module part_lower_arm_link() {
  difference() {
    rounded_rect_prism(part_width, part_depth, part_height, corner_radius);
    translate([0, 0, -1])
      cylinder(h = part_height + 2, d = m3_clearance_d);
  }
}

part_lower_arm_link();
