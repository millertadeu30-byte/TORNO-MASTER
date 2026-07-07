import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

old_end = """      // STANDARD G00/G01/G02/G03 LINEAR & CIRCULAR ACTIONS
      renderStandardMove(cmd);
    }

    return { plotList, activeLineIndexes };
  };"""

new_end = """      // STANDARD G00/G01/G02/G03 LINEAR & CIRCULAR ACTIONS
      renderStandardMove(cmd);
    }

    return { plotList, activeLineIndexes };
    } catch (err: any) {
      console.warn("GCode Parser Error: ", err);
      return { plotList: [], activeLineIndexes: [], error: "Erro ao compilar o ciclo atual. Continue digitando." };
    }
  };"""

code = code.replace(old_end, new_end)

# Also update the type of `parseGCode` call if needed, and handle error display
old_call = """  const { plotList, activeLineIndexes } = parseGCode();

  // Draw simulation loop
  const drawSimulation = () => {"""

new_call = """  const { plotList, activeLineIndexes, error: parseError } = parseGCode();

  // Draw simulation loop
  const drawSimulation = () => {"""

code = code.replace(old_call, new_call)

with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
