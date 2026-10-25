// ============================================================================
// Get Me An Alt — Parametric OpenSCAD Module
// Part: PRT-02 — 360° Perforated HEPA Intake Lower Shell (hepa-intake-shell)
// Function: Protects HEPA cartridge and carries upper tower loads.
// Target Bounding Box (mm): [164, 164, 125]
// Print Material: PETG | Min Wall: >= 1.6mm | Tolerance: 0.2mm
// ============================================================================
$fn = 48;
part_width = 164;
part_depth = 164;
part_height = 125;
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

module part_hepa_intake_shell() {
  difference() {
    union() {
      // Base mounting flange
      cylinder(h = 6, r = 82);
      // Cylindrical isolation collar
      cylinder(h = part_height, r = 82);
    }
    // Central bore with 0.2mm fit tolerance
    translate([0, 0, -1])
      cylinder(h = part_height + 2, r = 78 + tolerance);
    // Side water intake relief slots
    for (ang = [0, 90, 180, 270]) {
      rotate([0, 0, ang])
        translate([0, 0, part_height * 0.55])
          cube([180.4, 5.0, part_height * 0.45], center = true);
      // Flange M3 anchor holes
      rotate([0, 0, ang + 45])
        translate([77.5, 0, -1])
          cylinder(h = 8, d = m3_clearance_d);
    }
  }
}

part_hepa_intake_shell();
