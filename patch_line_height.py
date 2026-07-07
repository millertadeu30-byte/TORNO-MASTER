import re

with open("src/components/CNCEditor.tsx", "r") as f:
    code = f.read()

old_div = """              <div
                key={i}
                className={`h-6 min-w-max ${
                  i === Math.floor(activeLine) && isActive ? "bg-cyan-950/20" : ""
                }`}
              >"""

new_div = """              <div
                key={i}
                className={`min-w-max ${
                  i === Math.floor(activeLine) && isActive ? "bg-cyan-950/20" : ""
                }`}
              >"""

code = code.replace(old_div, new_div)

with open("src/components/CNCEditor.tsx", "w") as f:
    f.write(code)
