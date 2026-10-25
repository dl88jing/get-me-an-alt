$fn = 40;

// Top-level parameters
width = 120;
depth = 120;
thickness = 7;
corner_radius = 12;

wall_thickness = 2.4;
lip_thickness = 3.5;
top_thickness = thickness - lip_thickness;
tolerance = 0.2;
m3_hole_d = 3.4;

// Port dimensions
center_tube_r = 5;
refill_port_x = -32;
refill_port_y = -32;
refill_port_r = 11;
cable_port_x = 32;
cable_port_y = 0;
cable_port_r = 4;

module rounded_rect_2d(w, d, r) {
    offset(r = r)
        square([w - 2 * r, d - 2 * r], center = true);
}

module part_reservoir_lid(
    w = width,
    d = depth,
    t = thickness,
    r = corner_radius,
    wall = wall_thickness,
    lip_t = lip_thickness,
    tol = tolerance,
    m3_d = m3_hole_d
) {
    top_t = t - lip_t;
    lip_outer_offset = wall + tol;
    
    difference() {
        union() {
            // Main top flange (Z from lip_t to t)
            translate([0, 0, lip_t])
                linear_extrude(height = top_t)
                    rounded_rect_2d(w, d, r);
            
            // Inner snap-fit / alignment rim (Z from 0 to lip_t)
            linear_extrude(height = lip_t)
                difference() {
                    rounded_rect_2d(w - 2 * lip_outer_offset, d - 2 * lip_outer_offset, max(1, r - lip_outer_offset));
                    rounded_rect_2d(w - 2 * (lip_outer_offset + wall), d - 2 * (lip_outer_offset + wall), max(1, r - lip_outer_offset - wall));
                }
                
            // Reinforced bosses for ports extending down to Z = 0
            cylinder(h = t, r = center_tube_r + wall);
            
            translate([refill_port_x, refill_port_y, 0])
                cylinder(h = t, r = refill_port_r + wall);
                
            translate([cable_port_x, cable_port_y, 0])
                cylinder(h = t, r = cable_port_r + wall);
                
            // Corner M3 mounting bosses
            for (dx = [-1, 1], dy = [-1, 1]) {
                translate([dx * (w / 2 - r), dy * (d / 2 - r), 0])
                    cylinder(h = t, r = m3_d / 2 + wall);
            }
        }
        
        // Center 10mm outlet tube port (r = 5)
        translate([0, 0, -1])
            cylinder(h = t + 2, r = center_tube_r + tol / 2);
            
        // Refill funnel port (22mm diameter, r = 11) with top lead-in chamfer
        translate([refill_port_x, refill_port_y, -1])
            cylinder(h = t + 2, r = refill_port_r + tol / 2);
        translate([refill_port_x, refill_port_y, t - 1.5])
            cylinder(h = 2.0, r1 = refill_port_r + tol / 2, r2 = refill_port_r + 1.5);
            
        // Pump cable grommet port (8mm diameter, r = 4) with strain-relief chamfer
        translate([cable_port_x, cable_port_y, -1])
            cylinder(h = t + 2, r = cable_port_r + tol / 2);
        translate([cable_port_x, cable_port_y, t - 1.2])
            cylinder(h = 1.5, r1 = cable_port_r + tol / 2, r2 = cable_port_r + 1.2);
            
        // 4x Corner M3 screw clearance holes with countersink
        for (dx = [-1, 1], dy = [-1, 1]) {
            translate([dx * (w / 2 - r), dy * (d / 2 - r), -1])
                cylinder(h = t + 2, d = m3_d);
            translate([dx * (w / 2 - r), dy * (d / 2 - r), t - 1.6])
                cylinder(h = 2.0, d1 = m3_d, d2 = m3_d + 3.0);
        }
    }
}

part_reservoir_lid();