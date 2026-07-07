import re

with open("src/components/CNCEditor.tsx", "r") as f:
    code = f.read()

old_regex = """    // Split text by words/tokens using G-code style words
    const tokens = lineText.match(/([A-Za-z]+[-+]?\d*\.?\d*|[\(\)\;\,\.\+\-\*\/]|\s+)/g) || [lineText];"""

new_regex = """    // Split text by words/tokens using G-code style words
    const tokens = lineText.match(/([A-Za-z]+[-+]?\d*\.?\d*|[\(\)\;\,\.\+\-\*\/]|\s+|[^\sA-Za-z\(\)\;\,\.\+\-\*\/]+)/g) || [lineText];"""

code = code.replace(old_regex, new_regex)

with open("src/components/CNCEditor.tsx", "w") as f:
    f.write(code)
