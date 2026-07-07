import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

old_header = """          <button
            onClick={handleResetView}
            className="text-[10px] font-semibold border border-zinc-700 hover:border-zinc-500 px-2 py-1 rounded text-zinc-400"
          >
            Enquadrar
          </button>
        </div>
      </div>"""

new_header = """          <button
            onClick={() => {
              setZoom(z => Math.min(300, z * 1.25));
            }}
            className="text-[12px] font-bold border border-zinc-700 hover:border-zinc-400 hover:bg-zinc-800 px-2 py-0.5 rounded text-zinc-300"
            title="Mais Zoom"
          >
            +
          </button>
          <button
            onClick={() => {
              setZoom(z => Math.max(0.2, z / 1.25));
            }}
            className="text-[12px] font-bold border border-zinc-700 hover:border-zinc-400 hover:bg-zinc-800 px-2 py-0.5 rounded text-zinc-300"
            title="Menos Zoom"
          >
            -
          </button>
          <button
            onClick={handleResetView}
            className="text-[10px] font-semibold border border-zinc-700 hover:border-zinc-500 px-2 py-1 rounded text-zinc-400"
          >
            Enquadrar
          </button>
        </div>
      </div>"""

code = code.replace(old_header, new_header)

with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
