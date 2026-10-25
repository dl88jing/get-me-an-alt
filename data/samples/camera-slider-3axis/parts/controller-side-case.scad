// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-09 — Snap-Fit TMC2209 + ESP32 Motion Controller Side Case (controller-side-case)
// Function: Houses ESP32 controller, 3× TMC2209 drivers, and USB-C PD board.
// Target Bounding Box (mm): [92, 62, 34]
// Print Material: PLA+ | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 92;
part_depth = 62;
part_height = 34;
wall_thickness = 2.8;
floor_thickness = 3;
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

module part_controller_side_case() {
  union() {
    difference() {
      rounded_rect_prism(part_width, part_depth, part_height, corner_radius);
      translate([0, 0, floor_thickness])
        rounded_rect_prism(
          part_width - 2 * wall_thickness,
          part_depth - 2 * wall_thickness,
          part_height,
          max(1.0, corner_radius - wall_thickness)
        );
    translate([-part_width * 0.28, 0, -1]) cylinder(h = floor_thickness + 2, d = m3_clearance_d);
    translate([part_width * 0.28, 0, -1]) cylinder(h = floor_thickness + 2, d = m3_clearance_d);
      // Cable / USB-C pass-through slot on side wall
      translate([part_width / 2 - wall_thickness - 1, 0, part_height * 0.55])
        cube([wall_thickness + 3, 12, 7], center = true);
    }
    // Internal M3 PCB standoff bosses
    for (sx = [-part_width * 0.28, part_width * 0.28]) {
      translate([sx, 0, floor_thickness])
        difference() {
          cylinder(h = 4.0, d = 7.0);
          translate([0, 0, -0.5]) cylinder(h = 5.0, d = m3_clearance_d);
        }
    }
  }
}

part_controller_side_case();
