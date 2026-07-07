import re

with open("src/components/CNCEditor.tsx", "r") as f:
    code = f.read()

# Replace font-bold and font-medium with just color classes to avoid width differences
code = code.replace("font-bold", "")
code = code.replace("font-medium", "")
code = code.replace("italic", "") # Italic might also change width on some fonts

with open("src/components/CNCEditor.tsx", "w") as f:
    f.write(code)
