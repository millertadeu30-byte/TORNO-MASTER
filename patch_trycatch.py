import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

# Add try-catch inside parseGCode
old_parse = """  // Dynamic G-Code parsing & Rendering
  const parseGCode = (): { plotList: SimulationPlotItem[]; activeLineIndexes: number[] } => {
    const lines = gcodeText.split("\\n");"""

new_parse = """  // Dynamic G-Code parsing & Rendering
  const parseGCode = (): { plotList: SimulationPlotItem[]; activeLineIndexes: number[]; error?: string } => {
    try {
      const lines = gcodeText.split("\\n");"""

code = code.replace(old_parse, new_parse)

# Now we need to close the try block at the end of parseGCode.
# We need to find the end of parseGCode.
