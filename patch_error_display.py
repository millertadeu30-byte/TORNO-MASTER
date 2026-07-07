import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

old_canvas_block = """      {/* Actual Graphics Canvas */}
      <div className="flex-1 relative overflow-hidden bg-black cursor-crosshair select-none">
        <canvas"""

new_canvas_block = """      {/* Actual Graphics Canvas */}
      <div className="flex-1 relative overflow-hidden bg-black cursor-crosshair select-none">
        {parseError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-950/80 border border-red-500/50 text-red-400 px-4 py-2 rounded shadow-lg text-xs pointer-events-none z-20 flex items-center gap-2">
             <AlertTriangle size={14} />
             {parseError}
          </div>
        )}
        <canvas"""

code = code.replace(old_canvas_block, new_canvas_block)

if "AlertTriangle" not in code:
    code = code.replace("import {", "import { AlertTriangle,", 1)

with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
