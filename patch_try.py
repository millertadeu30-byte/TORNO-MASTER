import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

# Try to find parseGCode
code = code.replace("  const parseGCode = (): { plotList: SimulationPlotItem[]; activeLineIndexes: number[] } => {\n    const lines = gcodeText.split(\"\\n\");", "  const parseGCode = (): { plotList: SimulationPlotItem[]; activeLineIndexes: number[]; error?: string } => {\n    try {\n    const lines = gcodeText.split(\"\\n\");")

with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
