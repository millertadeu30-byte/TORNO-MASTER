import re

with open("src/App.tsx", "r") as f:
    code = f.read()

old_buttons = """            <button
              onClick={() => document.getElementById("file-upload")?.click()}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm px-3 py-1.5 rounded transition"
            >
              <FolderOpen className="w-4 h-4" />
              Carregar
            </button>
            <button
              onClick={handleSaveLocal}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm px-3 py-1.5 rounded transition"
            >
              <Save className="w-4 h-4" />
              Salvar
            </button>"""

new_buttons = """            <button
              onClick={() => {
                if(confirm("Deseja apagar o programa atual e iniciar um novo?")) {
                  updateEditorText("", activePaneIdx);
                }
              }}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-3 py-1.5 rounded transition"
            >
              <FilePlus className="w-4 h-4" />
              Novo
            </button>
            <button
              onClick={handleSaveLocal}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm px-3 py-1.5 rounded transition"
            >
              <Save className="w-4 h-4" />
              Salvar
            </button>
            <button
              onClick={() => document.getElementById("file-upload")?.click()}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-sm px-3 py-1.5 rounded transition"
            >
              <FolderOpen className="w-4 h-4" />
              Carregar
            </button>"""

code = code.replace(old_buttons, new_buttons)

if "FilePlus" not in code:
    code = code.replace("import {", "import {\n  FilePlus,", 1)

with open("src/App.tsx", "w") as f:
    f.write(code)
