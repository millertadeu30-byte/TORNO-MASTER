import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

old_reset = """  const handleResetView = () => {
    setZoom(8);
    setPanX(0);
    setPanY(0);
  };"""

new_reset = """  const handleResetView = () => {
    const pList = parseGCode().plotList;
    if (pList.length === 0) {
      setZoom(8);
      setPanX(0);
      setPanY(0);
      return;
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    pList.forEach((p: any) => {
      minX = Math.min(minX, p.x1, p.x2);
      maxX = Math.max(maxX, p.x1, p.x2);
      minZ = Math.min(minZ, p.z1, p.z2);
      maxZ = Math.max(maxZ, p.z1, p.z2);
    });
    if (minX === Infinity) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cw = canvas.width;
    const ch = canvas.height;
    
    const dx = Math.abs(maxZ - minZ) || 1;
    const dy = Math.abs(maxX - minX) || 1;
    
    const zoomX = (cw - 40) / dx;
    const zoomY = (ch - 40) / dy;
    const newZoom = Math.max(0.5, Math.min(zoomX, zoomY, 30));
    setZoom(newZoom);
    
    const zCenter = (minZ + maxZ) / 2;
    const xCenter = (minX + maxX) / 2;
    
    const newPanX = -zCenter * newZoom * (simInvertZ ? -1 : 1) - 50;
    const newPanY = xCenter * newZoom - 50;
    
    setPanX(newPanX);
    setPanY(newPanY);
  };"""

code = code.replace(old_reset, new_reset)

with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
