import re

with open("src/App.tsx", "r") as f:
    code = f.read()

old_lib = """          {/* Preset templates bar */}
          <div className="bg-[#0e0e12] border-b border-zinc-900 px-6 py-2.5 flex flex-wrap items-center gap-2 z-10 text-xs overflow-x-auto select-none">
            <span className="text-zinc-500 font-bold uppercase tracking-wider text-[9px] mr-1">
              Bibliotecas Rápidas:
            </span>
            {CNC_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => loadPresetTemplate(t.code)}
                className="bg-zinc-800/40 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 rounded-md border border-zinc-800 transition text-[11px]"
                title={t.description}
              >
                ⚙️ {t.title}
              </button>
            ))}
          </div>"""

new_lib = """          {/* Preset templates bar - Collapsible */}
          <div className="bg-[#0e0e12] border-b border-zinc-900 px-6 py-2 flex flex-col z-10 select-none relative">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowLibraries(!showLibraries)}
                className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 hover:text-white transition"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                BIBLIOTECAS RÁPIDAS
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showLibraries ? 'rotate-180' : ''}`} />
              </button>
              
              {hasTut && (
                <button 
                  onClick={() => setShowTut(!showTut)}
                  className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded transition ${showTut ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-800 text-zinc-400 hover:text-orange-300'}`}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  {showTut ? 'Ocultar Dica' : 'Ver Dica do Ciclo'}
                </button>
              )}
            </div>
            
            <AnimatePresence>
              {showLibraries && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap items-center gap-2 pt-3 pb-1">
                    {CNC_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          loadPresetTemplate(t.code);
                          setShowLibraries(false);
                        }}
                        className="bg-zinc-800/40 hover:bg-zinc-800 text-zinc-300 hover:text-white px-2.5 py-1 rounded-md border border-zinc-800 transition text-[11px]"
                        title={t.description}
                      >
                        ⚙️ {t.title}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>"""

code = code.replace(old_lib, new_lib)

with open("src/App.tsx", "w") as f:
    f.write(code)
