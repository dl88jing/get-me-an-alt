// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-06 — 60-Tooth GT2 Pan Reduction Ring Gear (3:1 Ratio) (pan-ring-gear)
// Function: Multiplies pan torque 3× and rotates the upper tilt gimbal.
// Target Bounding Box (mm): [92, 92, 16]
// Print Material: PLA+ | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 92;
part_depth = 92;
part_height = 16;
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

module part_pan_ring_gear() {
  teeth = 24;
  outer_r = 46;
  root_r = 36.8;
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
      circle(r = 20 + tolerance);
    }
}

part_pan_ring_gear();
