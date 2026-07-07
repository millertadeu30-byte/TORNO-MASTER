import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

sync_block = """  // Synchronize active line on driver clock tick safely outside state updater to avoid rendering conflicts
  useEffect(() => {
    if (isDriverActive && driverTick !== -1) {
      onLineChange(driverTick);
    }
  }, [driverTick, isDriverActive, onLineChange]);"""

new_sync_block = """  // Synchronize active line on driver clock tick safely outside state updater to avoid rendering conflicts
  useEffect(() => {
    if (isDriverActive && driverTick !== -1) {
      onLineChange(driverTick);
    }
  }, [driverTick, isDriverActive, onLineChange]);

  // Synchronize driverTick when activeLine changes externally (e.g. user clicked editor)
  useEffect(() => {
    if (!isDriverActive && activeLine >= 0 && Math.floor(activeLine) !== Math.floor(driverTick)) {
       // Find the closest line in linesWithDrawing
       const match = linesWithDrawing.find(l => Math.floor(l) === Math.floor(activeLine));
       if (match !== undefined) {
          setDriverTick(match);
       } else {
          setDriverTick(activeLine);
       }
    }
  }, [activeLine, isDriverActive, linesWithDrawing]);"""

code = code.replace(sync_block, new_sync_block)

with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
