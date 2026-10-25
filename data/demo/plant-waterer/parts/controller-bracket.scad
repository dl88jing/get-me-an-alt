// PRT-06: Reservoir Side-Mount L-Bracket
// Mounts controller enclosure to the side wall of the reservoir.

$fn = 40;

// Top-level parametric parameters
legA_length = 42.0;      // X dimension (mm)
legB_length = 38.0;      // Y dimension (mm)
bracket_width = 30.0;    // Z dimension (mm)
wall_thickness = 4.0;    // Structural thickness >= 1.6mm
fillet_radius = 4.0;     // Inner corner fillet radius
m3_hole_d = 3.4;         // M3 screw clearance hole diameter
m3_head_d = 6.2;         // M3 socket head counterbore
tolerance = 0.2;         // Mating interface clearance
gusset_thickness = 3.2;  // Side reinforcement rib thickness

module part_controller_bracket(
    legA = legA_length,
    legB = legB_length,
    width = bracket_width,
    thickness = wall_thickness,
    filletR = fillet_radius,
    hole_d = m3_hole_d,
    gusset_t = gusset_thickness,
    tol = tolerance
) {
    difference() {
        union() {
            // Main L-Bracket body extruded along Z (width = 30mm)
            linear_extrude(height = width) {
                // Rounded L-profile using 2D offset for fast CGAL rendering
                offset(r = 1.2) offset(r = -1.2) {
                    union() {
                        // Leg A along X
                        square([legA, thickness]);
                        // Leg B along Y
                        square([thickness, legB]);
                        // Inner corner fillet reinforcement
                        translate([thickness, thickness])
                            difference() {
                                square([filletR, filletR]);
                                translate([filletR, filletR])
                                    circle(r = filletR);
                            }
                    }
                }
            }

            // Dual edge stiffening gussets along Z = 0 and Z = width - gusset_t
            for (z_pos = [0, width - gusset_t]) {
                translate([0, 0, z_pos])
                    linear_extrude(height = gusset_t)
                        polygon(points = [
                            [thickness - 0.1, thickness - 0.1],
                            [legA * 0.55, thickness - 0.1],
                            [thickness - 0.1, legB * 0.55]
                        ]);
            }
        }

        // Leg A Mounting Slots (M3 clearance for controller enclosure adjustment)
        for (z_pos = [width * 0.28, width * 0.72]) {
            translate([0, 0, z_pos])
                rotate([-90, 0, 0])
                    hull() {
                        translate([legA * 0.62, 0, -1])
                            cylinder(d = hole_d, h = thickness + 2);
                        translate([legA * 0.82, 0, -1])
                            cylinder(d = hole_d, h = thickness + 2);
                    }
        }

        // Leg B Mounting Holes (M3 clearance + counterbore for reservoir side wall)
        for (z_pos = [width * 0.28, width * 0.72]) {
            translate([0, legB * 0.70, z_pos])
                rotate([0, 90, 0]) {
                    // Through hole
                    translate([0, 0, -1])
                        cylinder(d = hole_d + tol, h = thickness + 2);
                    // Shallow recess on inside face
                    translate([0, 0, thickness - 1.2])
                        cylinder(d = m3_head_d, h = 2.0);
                }
        }

        // Center cable/zip-tie pass-through slot on Leg B
        translate([-1, legB * 0.35, width * 0.5])
            rotate([0, 90, 0])
                hull() {
                    translate([-2.5, 0, 0])
                        cylinder(d = 3.6, h = thickness + 2);
                    translate([2.5, 0, 0])
                        cylinder(d = 3.6, h = thickness + 2);
                }
    }
}

// Render the part
part_controller_bracket();