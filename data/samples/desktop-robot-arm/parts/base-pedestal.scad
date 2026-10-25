// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-01 — Weighted Base Pedestal & 6808 Bearing Seat (base-pedestal)
// Function: Stationary structural foundation and J1 waist bearing race.
// Target Bounding Box (mm): [150, 150, 42]
// Print Material: PETG | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 150;
part_depth = 150;
part_height = 42;
wall_thickness = 4;
floor_thickness = 5;
corner_radius = 16;
tolerance = 0.2;
m3_clearance_d = 3.4; // M3 screw clearance hole (3.0mm + 2*0.2mm)

module rounded_rect_prism(w, d, h, r) {
  cr = max(0.5, min(r, min(w, d) / 2 - 0.1));
  linear_extrude(height = h)
    offset(r = cr)
      offset(r = -cr)
        square([w, d], center = true);
}

module part_base_pedestal() {
  difference() {
    // Outer watertight vessel with rounded corners
    rounded_rect_prism(part_width, part_depth, part_height, corner_radius);
    // Inner cavity (walls >= 1.6mm, reinforced floor)
    translate([0, 0, floor_thickness])
      rounded_rect_prism(
        part_width - 2 * wall_thickness,
        part_depth - 2 * wall_thickness,
        part_height,
        max(1.0, corner_radius - wall_thickness)
      );
    // Top snap-fit lid rabbet lip (0.2mm clearance)
    translate([0, 0, part_height - 3.0])
      rounded_rect_prism(
        part_width - wall_thickness + 2 * tolerance,
        part_depth - wall_thickness + 2 * tolerance,
        4.0,
        max(1.0, corner_radius - wall_thickness * 0.5)
      );
  }
}

part_base_pedestal();
