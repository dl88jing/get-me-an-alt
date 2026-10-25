// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-07 — Rim-Snap 6mm Silicone Tube Clip (tube-clip)
// Function: Guides and secures silicone delivery tubing along the rim.
// Target Bounding Box (mm): [10.49, 11.2, 12]
// Print Material: PETG | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 10.49;
part_depth = 11.2;
part_height = 12;
wall_thickness = 2.4;
floor_thickness = 2.4;
corner_radius = 2.62;
tolerance = 0.2;
m3_clearance_d = 3.4; // M3 screw clearance hole (3.0mm + 2*0.2mm)

module rounded_rect_prism(w, d, h, r) {
  cr = max(0.5, min(r, min(w, d) / 2 - 0.1));
  linear_extrude(height = h)
    offset(r = cr)
      offset(r = -cr)
        square([w, d], center = true);
}

module part_tube_clip() {
  linear_extrude(height = part_height)
    difference() {
      scale([1, part_depth / part_width])
        circle(d = part_width);
      scale([1, part_depth / part_width])
        circle(d = max(2.0, part_width - 2 * 2.4));
      // Snap-fit C-clip opening jaws
      translate([0, part_depth * 0.38])
        square([part_width * 0.58, part_depth * 0.5], center = true);
    }
}

part_tube_clip();
