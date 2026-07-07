import re

with open("src/App.tsx", "r") as f:
    code = f.read()

old_tut = """                <motion.div
                  initial={{ opacity: 0, y: -20, x: "-50%" }}
                  animate={{ opacity: 1, y: 0, x: "-50%" }}
                  exit={{ opacity: 0, y: -20, x: "-50%" }}
                  className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#17171e]/96 border border-cyan-400 rounded-xl p-4 z-50 shadow-2xl shadow-black max-w-xl w-[90%] pointer-events-none"
                >"""

new_tut = """                <motion.div
                  drag
                  dragMomentum={false}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  style={{ touchAction: "none" }}
                  className="absolute top-10 left-10 bg-[#17171e]/96 border border-cyan-400 rounded-xl p-4 z-50 shadow-2xl shadow-black max-w-xl w-[90%] md:w-[500px] cursor-grab active:cursor-grabbing overflow-y-auto max-h-[80vh]"
                >
                  <div className="flex justify-between items-start mb-1 cursor-grab">
                    <h4 className="text-orange-500 font-display font-bold text-xs uppercase tracking-wider">
                      {tutTitle}
                    </h4>
                    <button 
                      onClick={() => setShowTut(false)}
                      className="text-zinc-500 hover:text-white transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>"""

# Need to import X if not already imported
code = code.replace(old_tut, new_tut)

# Fix missing closing tags if we just added a div structure for the header
old_tut_content = """                  <h4 className="text-orange-500 font-display font-bold text-xs mb-1 uppercase tracking-wider">
                    {tutTitle}
                  </h4>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                    {tutBody}
                  </p>
                </motion.div>"""

new_tut_content = """                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono pointer-events-auto">
                    {tutBody}
                  </p>
                </motion.div>"""
code = code.replace(old_tut_content, new_tut_content)

with open("src/App.tsx", "w") as f:
    f.write(code)
