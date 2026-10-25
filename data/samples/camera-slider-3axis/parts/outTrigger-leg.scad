// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-03 — Fold-Out Articulated All-Terrain Outrigger Legs (×4) (outTrigger-leg)
// Function: Stabilizes the slider track against tipping during telephoto tilts.
// Target Bounding Box (mm): [115, 36, 24]
// Print Material: PETG | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 115;
part_depth = 36;
part_height = 24;
wall_thickness = 3.6;
floor_thickness = 3.6;
corner_radius = 5;
tolerance = 0.2;
m3_clearance_d = 3.4; // M3 screw clearance hole (3.0mm + 2*0.2mm)

module rounded_rect_prism(w, d, h, r) {
  cr = max(0.5, min(r, min(w, d) / 2 - 0.1));
  linear_extrude(height = h)
    offset(r = cr)
      offset(r = -cr)
        square([w, d], center = true);
}

module part_outTrigger_leg() {
  t = 5;
  translate([-part_width / 2, -part_depth / 2, 0])
  difference() {
    union() {
      // Horizontal leg A
      cube([part_width, t, part_height]);
      // Vertical leg B
      cube([t, part_depth, part_height]);
      // Corner gusset rib
      translate([0, 0, part_height * 0.5 - t * 0.5])
        linear_extrude(height = t)
          polygon(points = [[t, t], [min(part_width * 0.55, 20), t], [t, min(part_depth * 0.55, 20)]]);
    }
    // M3 mounting holes on leg A
    translate([part_width * 0.65, t + 1, part_height * 0.35])
      rotate([90, 0, 0]) cylinder(h = t + 2, d = m3_clearance_d);
    translate([part_width * 0.65, t + 1, part_height * 0.65])
      rotate([90, 0, 0]) cylinder(h = t + 2, d = m3_clearance_d);
    // M3 mounting holes on leg B
    translate([-1, part_depth * 0.65, part_height * 0.35])
      rotate([0, 90, 0]) cylinder(h = t + 2, d = m3_clearance_d);
    translate([-1, part_depth * 0.65, part_height * 0.65])
      rotate([0, 90, 0]) cylinder(h = t + 2, d = m3_clearance_d);
  }
}

part_outTrigger_leg();
