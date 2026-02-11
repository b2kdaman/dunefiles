import { useEffect, useRef, useState } from "react";
import { getCurrentThemePalette, hexToCss } from "../theme";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [opacity, setOpacity] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Draw text on canvas with pixelation
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const palette = getCurrentThemePalette();
    const bgColor = hexToCss(palette.backgroundHex);
    const primaryColor = hexToCss(palette.primaryHex);
    canvas.width = width;
    canvas.height = height;

    const renderText = (currentPixelSize: number) => {
      // Calculate scaled dimensions for pixelation
      const scale = 1 / currentPixelSize;
      const scaledWidth = Math.max(1, Math.floor(width * scale));
      const scaledHeight = Math.max(1, Math.floor(height * scale));

      // Create temporary canvas at scaled size
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = scaledWidth;
      tempCanvas.height = scaledHeight;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      // Draw background
      tempCtx.fillStyle = bgColor;
      tempCtx.fillRect(0, 0, scaledWidth, scaledHeight);

      // Calculate font size for scaled canvas
      const fontSize = Math.min(scaledWidth * 0.2, scaledHeight * 0.2);

      // Draw text on scaled canvas
      tempCtx.font = `${fontSize}px 'VCR OSD Mono', ui-monospace, monospace`;
      tempCtx.fillStyle = primaryColor;
      tempCtx.textAlign = "center";
      tempCtx.textBaseline = "middle";
      tempCtx.shadowColor = primaryColor;
      tempCtx.shadowBlur = fontSize * 0.1;
      tempCtx.fillText("3d_space", scaledWidth / 2, scaledHeight / 2);

      // Clear main canvas
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // Draw scaled canvas to main canvas with pixelation
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tempCanvas, 0, 0, scaledWidth, scaledHeight, 0, 0, width, height);
    };

    // Animate pixel size from 30 to 1
    const duration = 2000; // 2 seconds
    const startTime = Date.now();
    const startPixelSize = 30;
    const endPixelSize = 1;

    const animatePixels = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentPixelSize = startPixelSize - (startPixelSize - endPixelSize) * eased;

      renderText(currentPixelSize);

      if (progress < 1) {
        requestAnimationFrame(animatePixels);
      } else {
        // Start fade out after pixelation completes
        setTimeout(() => {
          const fadeStart = Date.now();
          const fadeDuration = 500;

          const fadeOut = () => {
            const fadeElapsed = Date.now() - fadeStart;
            const fadeProgress = Math.min(fadeElapsed / fadeDuration, 1);
            setOpacity(1 - fadeProgress);

            if (fadeProgress < 1) {
              requestAnimationFrame(fadeOut);
            } else {
              onComplete();
            }
          };

          fadeOut();
        }, 500);
      }
    };

    animatePixels();
  }, [onComplete]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 10000,
        opacity,
        transition: "opacity 0.5s",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
