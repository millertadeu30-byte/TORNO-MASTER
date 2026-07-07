import re

with open("src/components/CNCEditor.tsx", "r") as f:
    code = f.read()

# Remove font-semibold
code = code.replace("font-semibold", "")

# Fix the highlighting text layout
old_grid = """        {/* Textarea & Highlighter Grid */}
        <div className="flex-1 relative h-full overflow-hidden grid">
          {/* Highlight Layer */}
          <div
            ref={highlightRef}
            className="grid-area-[1/1/2/2] pointer-events-none absolute inset-0 font-mono text-sm leading-6 p-4 overflow-hidden whitespace-pre select-none z-10"
            aria-hidden="true"
          >
            {lines.map((line, i) => (
              <div
                key={i}
                className={`min-w-max ${
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
            className="grid-area-[1/1/2/2] absolute inset-0 w-full h-full bg-transparent border-none outline-none resize-none p-4 font-mono text-sm leading-6 text-transparent caret-zinc-200 overflow-auto z-20 whitespace-pre overflow-wrap-[normal]"
          />
        </div>"""

new_grid = """        {/* Textarea & Highlighter Grid */}
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

code = code.replace(old_grid, new_grid)

# Handle \r\n in split
code = code.replace('const lines = text.split("\\n");', 'const lines = text.split(/\\r?\\n/);')
code = code.replace('const lineIndex = textBeforeCursor.split("\\n").length - 1;', 'const lineIndex = textBeforeCursor.split(/\\r?\\n/).length - 1;')
code = code.replace('const lineIndex = text.substring(0, index).split("\\n").length - 1;', 'const lineIndex = text.substring(0, index).split(/\\r?\\n/).length - 1;')

with open("src/components/CNCEditor.tsx", "w") as f:
    f.write(code)
