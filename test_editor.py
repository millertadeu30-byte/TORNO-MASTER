with open("src/components/CNCEditor.tsx", "r") as f:
    code = f.read()
print("Contains lines.map inside highlightRef?", "lines.map(" in code)
