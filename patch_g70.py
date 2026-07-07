import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

old_g70 = """          // Trace profile
          for (let k = pIdx; k <= qIdx; k++) {
            renderStandardMove(commands[k], "#39ff14", cmd.linhaOriginal + 0.01 * (k - pIdx));
          }"""

new_g70 = """          // Trace profile
          for (let k = pIdx; k <= qIdx; k++) {
            const profileCmd = { ...commands[k], linhaOriginal: cmd.linhaOriginal };
            renderStandardMove(profileCmd, "#39ff14", 0.01 * (k - pIdx));
          }"""

code = code.replace(old_g70, new_g70)

with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
