import re

with open("src/components/CNCSimulator.tsx", "r") as f:
    code = f.read()

old_wheel = """  // Zoom on scroll wheel
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    
    setZoom((prevZoom) => {
      const newZoom = Math.min(Math.max(prevZoom * zoomFactor, 0.5), 100);
      if (newZoom === prevZoom) return prevZoom;
      
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const cX = canvas.width / 2 + 50;
        const cY = canvas.height / 2 + 50;
        
        setPanX(prevPanX => prevPanX + (mouseX - cX - prevPanX) * (1 - newZoom / prevZoom));
        setPanY(prevPanY => prevPanY + (mouseY - cY - prevPanY) * (1 - newZoom / prevZoom));
      }
      
      return newZoom;
    });
  };"""

new_wheel = """  // Zoom on scroll wheel
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // Support both vertical and horizontal scroll wheels just in case
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (delta === 0) return;
    
    const zoomFactor = delta < 0 ? 1.15 : 1 / 1.15;
    
    setZoom((prevZoom) => {
      const newZoom = Math.min(Math.max(prevZoom * zoomFactor, 0.5), 150);
      if (newZoom === prevZoom) return prevZoom;
      
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const cX = canvas.width / 2 + 50;
        const cY = canvas.height / 2 + 50;
        
        setPanX(prevPanX => prevPanX + (mouseX - cX - prevPanX) * (1 - newZoom / prevZoom));
        setPanY(prevPanY => prevPanY + (mouseY - cY - prevPanY) * (1 - newZoom / prevZoom));
      }
      
      return newZoom;
    });
  };"""

code = code.replace(old_wheel, new_wheel)

with open("src/components/CNCSimulator.tsx", "w") as f:
    f.write(code)
