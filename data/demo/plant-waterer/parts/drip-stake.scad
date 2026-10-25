// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-08 — Root-Zone Soil Emitter Stake (drip-stake)
// Function: Anchors delivery tube in plant soil and directs water to roots.
// Target Bounding Box (mm): [23.2, 106.6, 8]
// Print Material: PLA | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 23.2;
part_depth = 106.6;
part_height = 8;
wall_thickness = 3.6;
floor_thickness = 3.6;
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

module part_drip_stake() {
  t = 3.6;
  r_outer = part_width / 2;
  r_inner = max(1.5, r_outer - t);
  shank_len = part_depth - r_outer;
  translate([0, part_depth / 2 - r_outer, 0])
  linear_extrude(height = part_height)
    union() {
      // Top J-hook arch
      difference() {
        circle(r = r_outer);
        circle(r = r_inner);
        translate([0, -r_outer]) square([r_outer * 2 + 2, r_outer * 2], center = true);
      }
      // Tapered soil stake shank
      polygon(points = [
        [-r_outer, 0],
        [-r_inner, 0],
        [-r_outer + t * 0.65, -shank_len * 0.88],
        [-r_outer + t * 0.25, -shank_len],
        [-r_outer, -shank_len * 0.92]
      ]);
      // Hook retention tip
      translate([r_inner, -10])
        square([t, 10]);
    }
}

part_drip_stake();
