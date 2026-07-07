import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

# Fix driverTick reset on code change
code = code.replace("setDriverTick(-2);", "setDriverTick(-1);")
code = code.replace("if (driverTick === -2) {\n        return;\n      }", "if (driverTick === -2) {\n        return;\n      }") # wait, we can just remove this block or leave it since it's unreachable now.

# Fix drawing filter logic
old_filter = """      // If we are executing step by step, filter future strokes
      if (isDriverActive && driverTick !== -1 && item.linhaId > driverTick) {
        return;
      }"""
new_filter = """      // If we are executing step by step (even paused), filter future strokes
      if (driverTick !== -1 && item.linhaId > driverTick) {
        return;
      }"""
code = code.replace(old_filter, new_filter)

# Fix G70 linhaId logic to use its own line number
old_g70 = """        if (pIdx !== -1 && qIdx !== -1 && qIdx >= pIdx) {
          const startX = cx;
          const startZ = cz;
          
          let profStartX = cx;
          let profStartZ = cz;

          for (let k = pIdx; k <= qIdx; k++) {
            const profileCmd = commands[k];
            if (k === pIdx && (profileCmd.x !== null || profileCmd.z !== null)) {
               profStartX = profileCmd.x !== null ? profileCmd.x / 2 : cx;
               profStartZ = profileCmd.z !== null ? profileCmd.z : cz;
            }
            renderStandardMove(profileCmd, "#39ff14", 0.01 * (k - pIdx));
          }"""
          
new_g70 = """        if (pIdx !== -1 && qIdx !== -1 && qIdx >= pIdx) {
          const startX = cx;
          const startZ = cz;
          
          let profStartX = cx;
          let profStartZ = cz;

          for (let k = pIdx; k <= qIdx; k++) {
            const profileCmd = { ...commands[k], linhaOriginal: cmd.linhaOriginal };
            if (k === pIdx && (profileCmd.x !== null || profileCmd.z !== null)) {
               profStartX = profileCmd.x !== null ? profileCmd.x / 2 : cx;
               profStartZ = profileCmd.z !== null ? profileCmd.z : cz;
            }
            renderStandardMove(profileCmd, "#39ff14", 0.001 * (k - pIdx));
          }"""
code = code.replace(old_g70, new_g70)

# Fix G75 infinite loop and step logic
old_g75 = """            while (true) {
              const nextX = plungeXDir < 0 
                 ? Math.max(currentX - peckInc, targetX) 
                 : Math.min(currentX + peckInc, targetX);
              const stepId = cmd.linhaOriginal + passCount * 0.01 + peckCount * 0.0001;

              // Plunge Cut (solid green for active feed)
              plotList.push({
                type: "line",
                x1: currentX,
                z1: currentZ,
                x2: nextX,
                z2: currentZ,
                color: "#39ff14",
                linhaId: stepId,
              });

              if (peckInc < 999 && nextX !== targetX) {
                // Micro-retract (red for rapid)
                plotList.push({
                  type: "line",
                  x1: nextX,
                  z1: currentZ,
                  x2: nextX + (plungeXDir < 0 ? retractR : -retractR),
                  z2: currentZ,
                  color: "#ff2a2a",
                  linhaId: stepId + 0.00005,
                });
                currentX += (plungeXDir < 0 ? retractR : -retractR);
              } else {
                currentX = nextX;
              }
              
              peckCount++;
              
              if ((plungeXDir < 0 && currentX <= targetX) || (plungeXDir > 0 && currentX >= targetX)) {
                break;
              }
              if (peckCount > 2000) break; // Infinite loop fail-safe
            }"""

new_g75 = """            if (peckInc <= 0) peckInc = 999;
            while (true) {
              const nextX = plungeXDir < 0 
                 ? Math.max(currentX - peckInc, targetX) 
                 : Math.min(currentX + peckInc, targetX);
              const stepId = cmd.linhaOriginal + passCount * 0.01 + peckCount * 0.0001;

              // Plunge Cut (solid green for active feed)
              plotList.push({
                type: "line",
                x1: currentX,
                z1: currentZ,
                x2: nextX,
                z2: currentZ,
                color: "#39ff14",
                linhaId: stepId,
              });

              currentX = nextX;

              if (peckInc < 999 && currentX !== targetX) {
                // Micro-retract (red for rapid)
                plotList.push({
                  type: "line",
                  x1: currentX,
                  z1: currentZ,
                  x2: currentX + (plungeXDir < 0 ? retractR : -retractR),
                  z2: currentZ,
                  color: "#ff2a2a",
                  linhaId: stepId + 0.00003,
                });
                // Return to cut position
                plotList.push({
                  type: "line",
                  x1: currentX + (plungeXDir < 0 ? retractR : -retractR),
                  z1: currentZ,
                  x2: currentX,
                  z2: currentZ,
                  color: "#ff2a2a",
                  linhaId: stepId + 0.00006,
                });
              }
              
              peckCount++;
              
              if ((plungeXDir < 0 && currentX <= targetX) || (plungeXDir > 0 && currentX >= targetX)) {
                break;
              }
              if (peckCount > 2000) break; // Infinite loop fail-safe
            }"""
code = code.replace(old_g75, new_g75)

# Fix G75 Z step loop which also had an infinite loop bug
old_g75_z = """            while (true) {
              currentX = originalX;
              let peckCount = 1;

              // X Plunge passes
              while (true) {"""

new_g75_z = """            if (stepZ < 0) stepZ = Math.abs(stepZ);
            while (true) {
              currentX = originalX;
              let peckCount = 1;

              // X Plunge passes
              while (true) {"""
code = code.replace(old_g75_z, new_g75_z)

# G75 Z Step logic
old_g75_z_step = """            if (stepZ === 0 || currentZ <= targetZ) break;
            
            // Move lateral Z (rapid)
            currentZ = Math.max(currentZ - stepZ, targetZ);"""

new_g75_z_step = """            if (stepZ === 0 || Math.abs(currentZ - targetZ) < 0.001) break;
            
            // Move lateral Z (rapid)
            const dirZ = targetZ < originalZ ? -1 : 1;
            currentZ = dirZ < 0 ? Math.max(currentZ - stepZ, targetZ) : Math.min(currentZ + stepZ, targetZ);"""
code = code.replace(old_g75_z_step, new_g75_z_step)


with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
