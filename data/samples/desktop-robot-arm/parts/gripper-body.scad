// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-08 — J6 Spur-Gear Parallel Gripper Chassis (gripper-body)
// Function: Mounts parallel gripper linkage to J5 wrist clevis.
// Target Bounding Box (mm): [64, 52, 28]
// Print Material: PLA+ | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 64;
part_depth = 52;
part_height = 28;
wall_thickness = 2.8;
floor_thickness = 2.8;
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

module part_gripper_body() {
  difference() {
    rounded_rect_prism(part_width, part_depth, part_height, corner_radius);
    translate([-16, 8, -1]) cylinder(h = part_height + 2, r = 2.5 + tolerance);
    translate([16, 8, -1]) cylinder(h = part_height + 2, r = 2.5 + tolerance);
    // M3 corner mounting holes
    for (mx = [-1, 1], my = [-1, 1]) {
      translate([mx * (part_width / 2 - 8), my * (part_depth / 2 - 8), -1])
        cylinder(h = part_height + 2, d = m3_clearance_d);
    }
  }
}

part_gripper_body();
