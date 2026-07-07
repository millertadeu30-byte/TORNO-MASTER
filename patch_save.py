import re

with open("src/App.tsx", "r") as f:
    code = f.read()

old_save = """  const handleSaveLocal = () => {
    const code = editorTexts[activePaneIdx];
    if (!code) return;

    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PROG_CNC_ED${activePaneIdx + 1}.nc`;
    link.click();
    URL.revokeObjectURL(url);
  };"""

new_save = """  const handleSaveLocal = async () => {
    const code = editorTexts[activePaneIdx];
    if (!code) return;

    if ('showSaveFilePicker' in window) {
      try {
        let handle = fileHandles[activePaneIdx];
        if (!handle) {
          handle = await (window as any).showSaveFilePicker({
             suggestedName: `PROG_CNC_ED${activePaneIdx + 1}.nc`,
             types: [{
                description: 'NC Files',
                accept: { 'text/plain': ['.nc', '.txt'] },
             }],
          });
          const newHandles = [...fileHandles];
          newHandles[activePaneIdx] = handle;
          setFileHandles(newHandles);
        }
        const writable = await (handle as any).createWritable();
        await writable.write(code);
        await writable.close();
      } catch (err) {
        console.error("Save failed:", err);
      }
    } else {
        const blob = new Blob([code], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `PROG_CNC_ED${activePaneIdx + 1}.nc`;
        link.click();
        URL.revokeObjectURL(url);
    }
  };"""

code = code.replace(old_save, new_save)

with open("src/App.tsx", "w") as f:
    f.write(code)
