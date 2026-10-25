// PRT-05: ESP32 & MOSFET Controller Enclosure
$fn = 40;

// Top-level parameters
width = 78.0;
depth = 54.0;
height = 28.0;
wall_thickness = 2.8;
floor_thickness = 3.0;
corner_radius = 6.0;
m3_hole_d = 3.4;
m3_pilot_d = 2.6;
tolerance = 0.2;

module part_controller_box(
    w = width,
    d = depth,
    h = height,
    wt = wall_thickness,
    ft = floor_thickness,
    cr = corner_radius
) {
    inner_w = w - 2 * wt;
    inner_d = d - 2 * wt;
    inner_cr = max(1.0, cr - wt);
    
    difference() {
        union() {
            // Main Outer Shell
            linear_extrude(height = h)
                offset(r = cr)
                square([w - 2 * cr, d - 2 * cr], center = true);
        }
        
        // Main Hollow Interior
        translate([0, 0, ft])
            linear_extrude(height = h)
            offset(r = inner_cr)
            square([inner_w - 2 * inner_cr, inner_d - 2 * inner_cr], center = true);
            
        // Top Lid Recessed Lip
        translate([0, 0, h - 2.0])
            linear_extrude(height = 2.5)
            offset(r = inner_cr + 1.0 + tolerance)
            square([inner_w - 2 * inner_cr, inner_d - 2 * inner_cr], center = true);

        // Bottom Mounting Holes (from spec: x = -22, 22; y = 0; r = 2 / M3 clearance)
        for (hx = [-22, 22]) {
            translate([hx, 0, -0.5])
                cylinder(d = 4.0, h = ft + 1.0);
            // Countersink inside
            translate([hx, 0, ft - 1.2])
                cylinder(d = 7.0, h = 2.0);
        }
        
        // USB Port Cutout for ESP32 (Left Wall -X)
        translate([-w/2 - 1, -8, ft + 6])
            cube([wt + 2, 12, 7.5], center = true);
            
        // Pump & Sensor Wire Grommet Holes (Right Wall +X)
        for (wy = [-10, 10]) {
            translate([w/2, wy, h/2 + 2])
                rotate([0, 90, 0])
                cylinder(d = 6.5, h = wt * 3, center = true);
        }
        
        // Side Ventilation Slots (Front & Back Walls)
        for (vx = [-16 : 8 : 16]) {
            translate([vx, 0, h - 7])
                cube([2.4, d + 2, 7], center = true);
        }
    }
    
    // Corner Lid Screw Bosses (M3 self-tapping)
    boss_x = w/2 - cr;
    boss_y = d/2 - cr;
    for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * boss_x, sy * boss_y, ft])
            difference() {
                cylinder(r = 4.2, h = h - ft - 2.0);
                translate([0, 0, (h - ft - 2.0) - 12])
                    cylinder(d = m3_pilot_d, h = 13);
            }
    }
    
    // Internal PCB Standoffs for ESP32 & MOSFET Module
    pcb_standoffs = [
        [-18, -17], [-18, 17],
        [8, -17],   [8, 17],
        [18, -12],  [18, 12],
        [30, -12],  [30, 12]
    ];
    for (pos = pcb_standoffs) {
        translate([pos[0], pos[1], ft])
            difference() {
                cylinder(d = 5.8, h = 4.0);
                translate([0, 0, 0.5])
                    cylinder(d = m3_pilot_d, h = 4.0);
            }
    }
}

part_controller_box();