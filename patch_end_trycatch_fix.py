import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

old_err = """    return { plotList, activeLineIndexes };
    } catch (err: any) {"""

new_err = """    return { plotList, activeLineIndexes };
    } catch (err: any) {""" # Wait, no, we need to find it and replace with `} catch`

# Let's just use string replace carefully
code = code.replace("    return { plotList, activeLineIndexes };\n    } catch (err: any) {", "    return { plotList, activeLineIndexes };\n  } catch (err: any) {")

with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
