import React, { useRef, useEffect } from 'react';

interface PreviewElement {
  id: string;
  type: 'line' | 'rectangle' | 'circle';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  x2?: number;
  y2?: number;
  color?: string;
}

interface PreviewImage {
  width: number;
  height: number;
  data: string;
}

interface MapMiniPreviewProps {
  elements: PreviewElement[];
  width: number;
  height: number;
  canvasWidth?: number;
  canvasHeight?: number;
  showGrid?: boolean;
  gridSize?: number;
  image?: PreviewImage | null;
}

const MapMiniPreview: React.FC<MapMiniPreviewProps> = ({
  elements,
  width,
  height,
  canvasWidth = 200,
  canvasHeight = 150,
  showGrid = false,
  gridSize = 20,
  image = null
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (width === 0 || height === 0) {
      return;
    }

    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (canvas.width - width * scale) / 2;
    const offsetY = (canvas.height - height * scale) / 2;

    const transformX = (x: number) => offsetX + x * scale;
    const transformY = (y: number) => offsetY + y * scale;

    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (image && image.width > 0 && image.height > 0) {
      const binary = atob(image.data);
      const buffer = new Uint8ClampedArray(image.width * image.height * 4);
      for (let i = 0; i < image.width * image.height; i += 1) {
        const value = binary.charCodeAt(i);
        const baseIndex = i * 4;
        buffer[baseIndex] = value;
        buffer[baseIndex + 1] = value;
        buffer[baseIndex + 2] = value;
        buffer[baseIndex + 3] = 255;
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = image.width;
      tempCanvas.height = image.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        const imgData = new ImageData(buffer, image.width, image.height);
        tempCtx.putImageData(imgData, 0, 0);
        ctx.drawImage(
          tempCanvas,
          0,
          0,
          image.width,
          image.height,
          offsetX,
          offsetY,
          image.width * scale,
          image.height * scale
        );
      }
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(offsetX, offsetY, width * scale, height * scale);
    }

    if (showGrid && gridSize > 0) {
      ctx.save();
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      const scaledGrid = gridSize * scale;

      for (let gx = offsetX; gx <= offsetX + width * scale; gx += scaledGrid) {
        ctx.beginPath();
        ctx.moveTo(Math.round(gx) + 0.5, offsetY);
        ctx.lineTo(Math.round(gx) + 0.5, offsetY + height * scale);
        ctx.stroke();
      }

      for (let gy = offsetY; gy <= offsetY + height * scale; gy += scaledGrid) {
        ctx.beginPath();
        ctx.moveTo(offsetX, Math.round(gy) + 0.5);
        ctx.lineTo(offsetX + width * scale, Math.round(gy) + 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (!image) {
      elements.forEach(element => {
        ctx.save();
        ctx.strokeStyle = element.color || '#1976d2';
        ctx.lineWidth = 2;

        switch (element.type) {
          case 'line':
            if (element.x2 !== undefined && element.y2 !== undefined) {
              ctx.beginPath();
              ctx.moveTo(transformX(element.x), transformY(element.y));
              ctx.lineTo(transformX(element.x2), transformY(element.y2));
              ctx.stroke();
            }
            break;
          case 'rectangle':
            if (element.width && element.height) {
              ctx.strokeRect(
                transformX(element.x),
                transformY(element.y),
                element.width * scale,
                element.height * scale
              );
            }
            break;
          case 'circle':
            if (element.radius) {
              ctx.beginPath();
              ctx.arc(
                transformX(element.x),
                transformY(element.y),
                element.radius * scale,
                0,
                2 * Math.PI
              );
              ctx.stroke();
            }
            break;
          default:
            break;
        }

        ctx.restore();
      });
    }
  }, [elements, image, width, height, canvasWidth, canvasHeight, showGrid, gridSize]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      style={{
        width: '100%',
        height: 'auto',
        display: 'block',
        borderRadius: 8,
        backgroundColor: '#f5f5f5'
      }}
    />
  );
};

export default MapMiniPreview;
