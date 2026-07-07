import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

# 1. Insert isSingleLineG75 definition
old_retract = """          } else if (cmd.r !== null) {
             retractR = cmd.r;
          }
          const originalX = cx;
          const originalZ = cz;"""

new_retract = """          } else if (cmd.r !== null) {
             retractR = cmd.r;
          }
          const isSingleLineG75 = !(prevCmd && prevCmd.mode === 75 && prevCmd.r !== null && prevCmd.x === null && prevCmd.z === null) && cmd.r !== null;
          const originalX = cx;
          const originalZ = cz;"""

code = code.replace(old_retract, new_retract)

# 2. Replace the peck loop and return logic
old_loop = """              // Micro-retract
              if ((plungeXDir < 0 && currentX > targetX) || (plungeXDir > 0 && currentX < targetX)) {
                plotList.push({
                  type: "line",
                  x1: currentX,
                  z1: currentZ,
                  x2: currentX + (plungeXDir < 0 ? retractR : -retractR),
                  z2: currentZ,
                  color: "#ff2a2a",
                  linhaId: stepId + 0.00005,
                });
                currentX += (plungeXDir < 0 ? retractR : -retractR);
              }
              peckCount++;
            }

            // Return plunge tool to outer clearance
            plotList.push({
              type: "line",
              x1: targetX,
              z1: currentZ,
              x2: originalX,
              z2: currentZ,
              color: "#ff2a2a",
              linhaId: cmd.linhaOriginal + passCount * 0.01 + 0.009,
            });"""

new_loop = """              // Micro-retract
              if ((plungeXDir < 0 && currentX > targetX) || (plungeXDir > 0 && currentX < targetX)) {
                if (isSingleLineG75) {
                    plotList.push({
                      type: "line",
                      x1: currentX,
                      z1: currentZ,
                      x2: currentX,
                      z2: currentZ + Math.abs(retractR),
                      color: "#ff2a2a",
                      linhaId: stepId + 0.00002,
                    });
                    plotList.push({
                      type: "line",
                      x1: currentX,
                      z1: currentZ + Math.abs(retractR),
                      x2: originalX,
                      z2: currentZ + Math.abs(retractR),
                      color: "#ff2a2a",
                      linhaId: stepId + 0.00004,
                    });
                    plotList.push({
                      type: "line",
                      x1: originalX,
                      z1: currentZ + Math.abs(retractR),
                      x2: originalX,
                      z2: currentZ,
                      color: "#ff2a2a",
                      linhaId: stepId + 0.00006,
                    });
                    plotList.push({
                      type: "line",
                      x1: originalX,
                      z1: currentZ,
                      x2: currentX,
                      z2: currentZ,
                      color: "#ff2a2a",
                      linhaId: stepId + 0.00008,
                    });
                } else {
                    plotList.push({
                      type: "line",
                      x1: currentX,
                      z1: currentZ,
                      x2: currentX + (plungeXDir < 0 ? retractR : -retractR),
                      z2: currentZ,
                      color: "#ff2a2a",
                      linhaId: stepId + 0.00005,
                    });
                    currentX += (plungeXDir < 0 ? retractR : -retractR);
                }
              }
              peckCount++;
            }

            // Return plunge tool to outer clearance
            if (isSingleLineG75) {
                plotList.push({
                  type: "line",
                  x1: targetX,
                  z1: currentZ,
                  x2: targetX,
                  z2: currentZ + Math.abs(retractR),
                  color: "#ff2a2a",
                  linhaId: cmd.linhaOriginal + passCount * 0.01 + 0.008,
                });
                plotList.push({
                  type: "line",
                  x1: targetX,
                  z1: currentZ + Math.abs(retractR),
                  x2: originalX,
                  z2: currentZ + Math.abs(retractR),
                  color: "#ff2a2a",
                  linhaId: cmd.linhaOriginal + passCount * 0.01 + 0.009,
                });
                plotList.push({
                  type: "line",
                  x1: originalX,
                  z1: currentZ + Math.abs(retractR),
                  x2: originalX,
                  z2: currentZ,
                  color: "#ff2a2a",
                  linhaId: cmd.linhaOriginal + passCount * 0.01 + 0.010,
                });
            } else {
                plotList.push({
                  type: "line",
                  x1: targetX,
                  z1: currentZ,
                  x2: originalX,
                  z2: currentZ,
                  color: "#ff2a2a",
                  linhaId: cmd.linhaOriginal + passCount * 0.01 + 0.009,
                });
            }"""

code = code.replace(old_loop, new_loop)

with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
