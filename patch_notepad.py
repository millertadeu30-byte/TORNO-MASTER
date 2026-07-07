import re

with open("src/components/CNCEditor.tsx", "r") as f:
    code = f.read()

old_grid = """        {/* Textarea & Highlighter Grid */}
        <div className="flex-1 relative h-full overflow-hidden grid">
          {/* Highlight Layer */}
          <div
            ref={highlightRef}
            className="grid-area-[1/1/2/2] pointer-events-none absolute inset-0 font-mono text-sm leading-6 p-4 overflow-hidden whitespace-pre select-none z-10 text-left align-top m-0 border-0"
            aria-hidden="true"
          >
            {lines.map((line, i) => (
              <div
                key={i}
                className={`min-w-max h-[24px] ${
                  i === Math.floor(activeLine) && isActive ? "bg-cyan-950/20" : ""
                }`}
              >
                {highlightLineText(line, i === Math.floor(activeLine))}
              </div>
            ))}
          </div>

          {/* Actual Editable Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onClick={handleLineClick}
            onKeyUp={handleKeyUp}
            wrap="off"
            spellCheck="false"
            placeholder="Digite ou carregue seu código G-Code aqui..."
            className="grid-area-[1/1/2/2] absolute inset-0 w-full h-full bg-transparent border-none outline-none resize-none p-4 font-mono text-sm leading-6 text-transparent caret-zinc-200 overflow-auto z-20 whitespace-pre text-left align-top m-0"
            style={{
              wordBreak: 'normal',
              overflowWrap: 'normal'
            }}
          />
        </div>"""

new_grid = """        {/* Textarea & Highlighter Grid */}
        <div className="flex-1 relative h-full overflow-hidden grid">
          {/* Active Line Highlight Layer */}
          <div
            ref={highlightRef}
            className="grid-area-[1/1/2/2] pointer-events-none absolute inset-0 font-mono text-sm leading-6 p-4 overflow-hidden whitespace-pre select-none z-10 text-left align-top m-0 border-0 text-transparent"
            aria-hidden="true"
          >
            {lines.map((line, i) => (
              <div
                key={i}
                className={`min-w-max h-[24px] ${
                  i === Math.floor(activeLine) && isActive ? "bg-cyan-950/40" : ""
                }`}
              >
                {line}
              </div>
            ))}
          </div>

          {/* Actual Editable Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleScroll}
            onClick={handleLineClick}
            onKeyUp={handleKeyUp}
            wrap="off"
            spellCheck="false"
            placeholder="Digite ou carregue seu código G-Code aqui..."
            className="grid-area-[1/1/2/2] absolute inset-0 w-full h-full bg-transparent border-none outline-none resize-none p-4 font-mono text-sm leading-6 text-emerald-400 caret-zinc-200 overflow-auto z-20 whitespace-pre text-left align-top m-0"
            style={{
              wordBreak: 'normal',
              overflowWrap: 'normal'
            }}
          />
        </div>"""

code = code.replace(old_grid, new_grid)

with open("src/components/CNCEditor.tsx", "w") as f:
    f.write(code)
