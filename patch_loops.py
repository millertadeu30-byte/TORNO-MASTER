import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

# Fix G71
old_g71 = """            while ((!isInternal && passX >= limitX) || (isInternal && passX <= limitX)) {
              // Find Z boundary for this depth pass"""
new_g71 = """            while ((!isInternal && passX >= limitX) || (isInternal && passX <= limitX)) {
              if (absDepth <= 0.0001) break; // SAFETY
              if (passCount > 1000) break; // SAFETY
              // Find Z boundary for this depth pass"""
code = code.replace(old_g71, new_g71)

# Fix G75 - 1
old_g75_1 = """          while (true) {
            let currentX = originalX;"""
new_g75_1 = """          while (true) {
            if (passCount > 1000) break; // SAFETY
            let currentX = originalX;"""
code = code.replace(old_g75_1, new_g75_1)

# Fix G75 - 2
old_g75_2 = """            while ((plungeXDir < 0 && currentX > targetX) || (plungeXDir > 0 && currentX < targetX)) {
              const nextX = plungeXDir < 0 """
new_g75_2 = """            while ((plungeXDir < 0 && currentX > targetX) || (plungeXDir > 0 && currentX < targetX)) {
              if (peckCount > 2000) break; // SAFETY
              const nextX = plungeXDir < 0 """
code = code.replace(old_g75_2, new_g75_2)

with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
