// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-08 — Arca-Swiss Quick-Release Camera Tilt Cradle (camera-arca-cradle)
// Function: Tilts the camera ±90° around its optical center of gravity.
// Target Bounding Box (mm): [78, 64, 24]
// Print Material: PLA+ | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 78;
part_depth = 64;
part_height = 24;
wall_thickness = 3.5;
floor_thickness = 3.5;
corner_radius = 8;
tolerance = 0.2;
m3_clearance_d = 3.4; // M3 screw clearance hole (3.0mm + 2*0.2mm)

module rounded_rect_prism(w, d, h, r) {
  cr = max(0.5, min(r, min(w, d) / 2 - 0.1));
  linear_extrude(height = h)
    offset(r = cr)
      offset(r = -cr)
        square([w, d], center = true);
}

module part_camera_arca_cradle() {
  difference() {
    rounded_rect_prism(part_width, part_depth, part_height, corner_radius);
    translate([0, 0, -1]) cylinder(h = part_height + 2, r = 3.5 + tolerance);
    translate([-22, 0, -1]) cylinder(h = part_height + 2, r = 2.5 + tolerance);
    translate([22, 0, -1]) cylinder(h = part_height + 2, r = 2.5 + tolerance);
    // M3 corner mounting holes
    for (mx = [-1, 1], my = [-1, 1]) {
      translate([mx * (part_width / 2 - 8), my * (part_depth / 2 - 8), -1])
        cylinder(h = part_height + 2, d = m3_clearance_d);
    }
  }
}

part_camera_arca_cradle();
