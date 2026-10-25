// PRT-01: Water Reservoir Base (1.4L)
// Parametric OpenSCAD Script

$fn = 40;

// Top-level parameters
width = 115;
depth = 115;
height = 100;
wall_thickness = 3.5;
floor_thickness = 4.0;
corner_radius = 12;
m3_hole_d = 3.4;
tolerance = 0.2;

module rounded_rect_2d(w, d, r) {
    offset(r = r)
        square([w - 2*r, d - 2*r], center = true);
}

module part_reservoir_tank(
    w = width,
    d = depth,
    h = height,
    wall_t = wall_thickness,
    floor_t = floor_thickness,
    r_ext = corner_radius,
    m3_d = m3_hole_d,
    tol = tolerance
) {
    r_int = max(2.0, r_ext - wall_t);
    inner_w = w - 2 * wall_t;
    inner_d = d - 2 * wall_t;
    
    // Corner mounting boss positions
    boss_offset_x = w/2 - r_ext/2 - 2.5;
    boss_offset_y = d/2 - r_ext/2 - 2.5;

    difference() {
        union() {
            // Main outer shell
            linear_extrude(height = h)
                rounded_rect_2d(w, d, r_ext);
        }
        
        // Main interior cavity
        translate([0, 0, floor_t])
            linear_extrude(height = h)
                difference() {
                    rounded_rect_2d(inner_w, inner_d, r_int);
                    
                    // Internal corner bosses at top for M3 mounting
                    for (dx = [-1, 1], dy = [-1, 1]) {
                        translate([dx * (inner_w/2 - 4), dy * (inner_d/2 - 4)])
                            circle(r = 6);
                    }
                }
                
        // Step/lip at top rim for mating upper pot assembly (with tolerance)
        translate([0, 0, h - 4])
            linear_extrude(height = 5)
                rounded_rect_2d(inner_w + 2*tol + 2.0, inner_d + 2*tol + 2.0, r_int + 1.0);

        // Top M3 mounting holes in the corner bosses
        for (dx = [-1, 1], dy = [-1, 1]) {
            translate([dx * (inner_w/2 - 4), dy * (inner_d/2 - 4), h - 18])
                cylinder(d = m3_d, h = 20);
        }
        
        // Side tubing/cable pass-through notch near the top rim
        translate([0, d/2, h - 8])
            rotate([90, 0, 0])
                cylinder(d = 8, h = wall_t * 4, center = true);
    }
    
    // Add sloped support under the corner bosses so they print without supports
    intersection() {
        linear_extrude(height = h - 4)
            rounded_rect_2d(inner_w, inner_d, r_int);
            
        union() {
            for (dx = [-1, 1], dy = [-1, 1]) {
                translate([dx * (inner_w/2 - 4), dy * (inner_d/2 - 4), h - 24])
                    cylinder(r1 = 0.5, r2 = 6.5, h = 20);
            }
        }
    }
    
    // Internal water-level sight markers (1.0L and 1.4L max fill indicators)
    for (z_mark = [35, 65, 85]) {
        translate([0, -inner_d/2 + 0.5, z_mark])
            cube([16, 1.6, 2.0], center = true);
    }
}

part_reservoir_tank();