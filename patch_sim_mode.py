with open("src/App.tsx", "r") as f:
    code = f.read()

# Replace toggle logic
old_toggle = "onClick={() => setIsSimFloating(!isSimFloating)}"
new_toggle = "onClick={() => setSimMode(prev => prev === 'tv' ? 'fixed' : prev === 'fixed' ? 'off' : 'tv')}"
code = code.replace(old_toggle, new_toggle)

# Replace conditional classes
old_class = "isSimFloating\n                    ? \"bg-[#00f3ff]/15 text-[#00f3ff] border-[#00f3ff]/40 shadow-[0_0_10px_rgba(0,243,255,0.15)] animate-pulse\"\n                    : \"bg-[#121216] border-zinc-800 text-zinc-400 hover:text-zinc-200\""
new_class = "simMode === 'tv'\n                    ? \"bg-[#00f3ff]/15 text-[#00f3ff] border-[#00f3ff]/40 shadow-[0_0_10px_rgba(0,243,255,0.15)] animate-pulse\"\n                    : simMode === 'fixed' ? \"bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]\" : \"bg-[#121216] border-zinc-800 text-zinc-400 hover:text-zinc-200\""
code = code.replace(old_class, new_class)

# Replace button text
old_text = "{isSimFloating ? \"📺 Mini-TV Ativa\" : \"🖥️ Simulador Fixo\"}"
new_text = "{simMode === 'tv' ? \"📺 Mini-TV Ativa\" : simMode === 'fixed' ? \"🖥️ Simulador Fixo\" : \"👁️ Simulador Off\"}"
code = code.replace(old_text, new_text)

# Replace rendering conditions
code = code.replace("{isSimFloating && (", "{simMode === 'tv' && (")
code = code.replace("{!isSimFloating && (", "{simMode === 'fixed' && (")
code = code.replace("onClick={() => setIsSimFloating(false)}", "onClick={() => setSimMode('off')}")

with open("src/App.tsx", "w") as f:
    f.write(code)

