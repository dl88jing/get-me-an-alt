// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-09 — Compliant Geared Parallel Gripper Jaws (×2) (gripper-jaw)
// Function: Grasps objects symmetrically when driven by J6 servo.
// Target Bounding Box (mm): [32, 32, 14]
// Print Material: PLA+ | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 32;
part_depth = 32;
part_height = 14;
wall_thickness = 2.4;
floor_thickness = 2.4;
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

module part_gripper_jaw() {
  teeth = 14;
  outer_r = 16;
  root_r = 12.8;
  tooth_w = (2 * 3.14159 * root_r) / (teeth * 2.1);
  linear_extrude(height = part_height)
    difference() {
      union() {
        circle(r = root_r);
        for (i = [0 : teeth - 1]) {
          rotate([0, 0, i * 360 / teeth])
            translate([root_r - 0.5, -tooth_w / 2])
              square([outer_r - root_r + 0.5, tooth_w]);
        }
      }
      circle(r = 2.5 + tolerance);
    }
}

part_gripper_jaw();
