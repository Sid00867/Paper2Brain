import React from 'react';
import { BaseEdge, EdgeLabelRenderer } from 'reactflow';

// Helper to generate a consistent color from a string
const stringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
};

const darkenColor = (color, percent) => {
    let R = parseInt(color.substring(1,3),16);
    let G = parseInt(color.substring(3,5),16);
    let B = parseInt(color.substring(5,7),16);
    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);
    R = (R<255)?R:255;  
    G = (G<255)?G:255;  
    B = (B<255)?B:255;  
    const RR = ((R.toString(16).length===1)?"0"+R.toString(16):R.toString(16));
    const GG = ((G.toString(16).length===1)?"0"+G.toString(16):G.toString(16));
    const BB = ((B.toString(16).length===1)?"0"+B.toString(16):B.toString(16));
    return "#"+RR+GG+BB;
}

// Destructure markerEnd from props!
export default function ElkEdge({ id, data, style, label, markerEnd }) {
  const section = data?.sections?.[0];

  if (!section) return null;

  const { startPoint, bendPoints, endPoint } = section;
  const showLabel = data?.showLabel !== false; // Default to true if undefined

  const edgeColor = stringToColor(id);
  const darkEdgeColor = darkenColor(edgeColor, -40);

  let path = `M ${startPoint.x} ${startPoint.y}`;
  if (bendPoints) {
    bendPoints.forEach((p) => {
      path += ` L ${p.x} ${p.y}`;
    });
  }
  path += ` L ${endPoint.x} ${endPoint.y}`;

  const getLabelData = (points) => {
    let totalLength = 0;
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      segments.push({ p1, p2, dist });
      totalLength += dist;
    }
    let targetLength = totalLength / 2;
    let currentLength = 0;
    for (const seg of segments) {
      if (currentLength + seg.dist >= targetLength) {
        const remaining = targetLength - currentLength;
        const ratio = remaining / seg.dist;
        const x = seg.p1.x + (seg.p2.x - seg.p1.x) * ratio;
        const y = seg.p1.y + (seg.p2.y - seg.p1.y) * ratio;
        let angle = Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x) * (180 / Math.PI);
        if (angle > 90 || angle < -90) angle += 180;
        return { x, y, angle };
      }
      currentLength += seg.dist;
    }
    return { x: points[0].x, y: points[0].y, angle: 0 };
  };

  const { x, y, angle } = getLabelData([startPoint, ...(bendPoints || []), endPoint]);

  return (
    <>
      <BaseEdge 
        id={id} 
        path={path} 
        markerEnd={markerEnd} // FIX: Pass arrow marker
        style={{ ...style, stroke: darkEdgeColor, strokeWidth: 2 }} 
      />
      
      {label && showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${x}px,${y}px) rotate(${angle}deg)`,
              // Clean white background with transparency
              background: 'rgba(255, 255, 255, 0.85)', 
              padding: '1px 4px',
              borderRadius: '4px',
              fontSize: '10px', // Smaller font
              fontWeight: 500,
              fontFamily: 'Georgia, serif',
              border: `1px solid ${darkEdgeColor}40`, // Low opacity border
              color: darkEdgeColor,
              pointerEvents: 'all',
              cursor: 'pointer',
              zIndex: 100,
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}