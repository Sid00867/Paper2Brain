import { useCallback, useEffect, useState, useRef } from 'react';
import ReactFlow, { 
  useNodesState, 
  useEdgesState, 
  Background,
  Controls,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  useViewport 
} from 'reactflow';
import 'reactflow/dist/style.css';
import ELK from "elkjs/lib/elk.bundled.js";
import { toPng } from 'html-to-image'; 

import Popup from "./Popup";
import ElkEdge from "./ElkEdge";
import { FiEye, FiEyeOff, FiDownload, FiCode, FiUpload } from "react-icons/fi";

const elk = new ELK();

// --- FIX: Define types OUTSIDE component to prevent re-creation on render ---
const edgeTypes = { elk: ElkEdge };
const nodeTypes = {}; // Defined once, stable reference

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.portConstraints': 'FIXED_ORDER', 
  'elk.spacing.nodeNode': '100',
  'elk.layered.spacing.nodeNodeBetweenLayers': '180',
  'elk.spacing.edgeNode': '40',
  'elk.layered.spacing.edgeNodeBetweenLayers': '50',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.padding': '[top=70,left=50,bottom=50,right=50]',
};

// ... (Keep Helper 1: getEdgeLabelPosition as is) ...
const getEdgeLabelPosition = (sections) => {
    if (!sections || sections.length === 0) return null;
    const points = [
        sections[0].startPoint, 
        ...(sections[0].bendPoints || []), 
        sections[0].endPoint
    ];
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
            const ratio = (targetLength - currentLength) / seg.dist;
            return {
                x: seg.p1.x + (seg.p2.x - seg.p1.x) * ratio,
                y: seg.p1.y + (seg.p2.y - seg.p1.y) * ratio
            };
        }
        currentLength += seg.dist;
    }
    return points[0];
};

// ... (Keep Helper 2: getNodeWorldPos as is) ...
const getNodeWorldPos = (node, allNodes) => {
    let x = node.position.x;
    let y = node.position.y;
    let current = node;
    while (current.parentNode) {
        const parent = allNodes.find(n => n.id === current.parentNode);
        if (!parent) break;
        x += parent.position.x;
        y += parent.position.y;
        current = parent;
    }
    return { x, y };
};

const getElkGraph = (nodes, links, groups) => {
  // ... (Keep existing implementation) ...
  const groupMap = {};
  groups.forEach(g => {
    groupMap[g.id] = {
      id: g.id,
      children: [],
      layoutOptions: { 
          'elk.padding': '[top=70,left=50,bottom=50,right=50]',
          'elk.spacing.edgeNode': '30',
          'elk.portConstraints': 'FIXED_ORDER'
      }, 
    };
  });
  const topLevelNodes = [];
  nodes.forEach(node => {
    const elkNode = { 
        id: node.id, 
        width: 180, 
        height: 60,
        layoutOptions: { 'elk.portConstraints': 'FIXED_ORDER' } 
    };
    if (node.parent && groupMap[node.parent]) {
      groupMap[node.parent].children.push(elkNode);
    } else {
      topLevelNodes.push(elkNode);
    }
  });
  const children = [...topLevelNodes, ...Object.values(groupMap)];
  return {
    id: 'root',
    layoutOptions: elkOptions,
    children: children,
    edges: links.map(l => ({ 
        id: `${l.source}-${l.target}`, 
        sources: [l.source], 
        targets: [l.target] 
    })),
  };
};

function SnipOverlay({ active, onComplete, nodes, edges }) {
  // ... (Keep existing SnipOverlay logic) ...
  const { screenToFlowPosition } = useReactFlow();
  const [startPos, setStartPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const containerRef = useRef(null);

  if (!active) return null;

  const handleMouseDown = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    setStartPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setCurrentPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseMove = (e) => {
    if (!startPos) return;
    const rect = containerRef.current.getBoundingClientRect();
    setCurrentPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseUp = (e) => {
    if (!startPos) return;
    const rect = containerRef.current.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const screenRect = {
      x: Math.min(startPos.x, endX),
      y: Math.min(startPos.y, endY),
      width: Math.abs(endX - startPos.x),
      height: Math.abs(endY - startPos.y)
    };

    const flowStart = screenToFlowPosition({ x: rect.left + screenRect.x, y: rect.top + screenRect.y });
    const flowEnd = screenToFlowPosition({ 
        x: rect.left + screenRect.x + screenRect.width, 
        y: rect.top + screenRect.y + screenRect.height 
    });

    const box = {
        x1: Math.min(flowStart.x, flowEnd.x),
        y1: Math.min(flowStart.y, flowEnd.y),
        x2: Math.max(flowStart.x, flowEnd.x),
        y2: Math.max(flowStart.y, flowEnd.y),
    };

    const capturedNodes = [];
    nodes.forEach(node => {
        const nW = node.width || 180;
        const nH = node.height || 60;
        const { x, y } = getNodeWorldPos(node, nodes);

        const isInside = (x < box.x2 && x + nW > box.x1 && y < box.y2 && y + nH > box.y1);
        if (isInside) {
            const isGroup = node.style && node.style.border && node.style.border.includes('dashed');
            capturedNodes.push({
                type: isGroup ? 'Group' : 'Node',
                label: node.data.label,
                id: node.id
            });
        }
    });

    const capturedEdges = [];
    edges.forEach(edge => {
        if (!edge.data || !edge.data.sections || !edge.data.showLabel) return;
        const labelText = edge.label || edge.data.label;
        if (!labelText) return;

        const pos = getEdgeLabelPosition(edge.data.sections);
        if (!pos) return;

        if (pos.x >= box.x1 && pos.x <= box.x2 && pos.y >= box.y1 && pos.y <= box.y2) {
            const sourceNode = nodes.find(n => n.id === edge.source);
            const targetNode = nodes.find(n => n.id === edge.target);
            capturedEdges.push({
                type: 'Label',
                label: labelText,
                source: sourceNode?.data?.label || edge.source,
                target: targetNode?.data?.label || edge.target
            });
        }
    });

    const allCaptured = [...capturedNodes, ...capturedEdges];
    const finalStrings = [];
    const labelCounts = {};
    allCaptured.forEach(item => {
        labelCounts[item.label] = (labelCounts[item.label] || 0) + 1;
    });

    allCaptured.forEach(item => {
        let displayStr = "";
        if (item.type === 'Node' || item.type === 'Group') {
            displayStr = `${item.label} (${item.type})`;
        } else if (item.type === 'Label') {
            if (labelCounts[item.label] > 1) {
                displayStr = `${item.label} (from ${item.source} to ${item.target})`;
            } else {
                displayStr = item.label;
            }
        }
        finalStrings.push(displayStr);
    });

    const uniqueStrings = Array.from(new Set(finalStrings));
    if (uniqueStrings.length > 0) {
        onComplete(uniqueStrings);
    }
    setStartPos(null);
    setCurrentPos(null);
  };

  const boxStyle = startPos && currentPos ? {
      left: Math.min(startPos.x, currentPos.x),
      top: Math.min(startPos.y, currentPos.y),
      width: Math.abs(currentPos.x - startPos.x),
      height: Math.abs(currentPos.y - startPos.y),
      position: 'absolute',
      border: '2px dashed #007bff',
      backgroundColor: 'rgba(0, 123, 255, 0.15)',
      pointerEvents: 'none', 
  } : {};

  return (
      <div 
        ref={containerRef}
        style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            zIndex: 1000, cursor: 'crosshair',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setStartPos(null)}
      >
          {startPos && <div style={boxStyle} />}
      </div>
  );
}

function DiagramInner({ data, isSnipMode, onSnipComplete, onImport }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [popup, setPopup] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const fileInputRef = useRef(null);

  const { fitView, screenToFlowPosition } = useReactFlow(); 
  const { x: vpX, y: vpY, zoom: vpZoom } = useViewport(); 

  const rawNodes = data?.nodes || [];
  const rawLinks = data?.links || [];
  const rawGroups = data?.groups || [];

  // ... (Keep existing downloadImage, downloadSchema, handleUploadClick, handleFileChange) ...
  const downloadImage = () => {
    const imageWidth = 1920;
    const imageHeight = 1080;
    const bg = '#fbfbfb';
    const flowElement = document.querySelector('.react-flow');

    if (flowElement) {
        toPng(flowElement, { 
            backgroundColor: bg,
            width: imageWidth,
            height: imageHeight,
            style: { width: imageWidth, height: imageHeight, transform: `scale(1)` },
        })
        .then((dataUrl) => {
            const a = document.createElement('a');
            a.setAttribute('download', 'architecture-diagram.png');
            a.setAttribute('href', dataUrl);
            a.click();
        })
        .catch((err) => console.error('Download failed', err));
    }
  };

  const downloadSchema = () => {
    if (!data) return;
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram_schema.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleUploadClick = () => {
      if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const json = JSON.parse(e.target.result);
              if (json && (json.nodes || json.structure)) {
                   if (onImport) onImport(json);
              } else {
                   alert("Invalid schema file format.");
              }
          } catch (err) {
              console.error("Failed to parse schema", err);
              alert("Invalid JSON file.");
          }
      };
      reader.readAsText(file);
      event.target.value = '';
  };

  const darkenColor = (color) => color || "#ccc"; 

  // --- Layout Effect (ELK) ---
  useEffect(() => {
    if (!rawNodes.length) {
      setNodes([]); setEdges([]); return;
    }

    const validIds = new Set([...rawNodes.map(n => n.id), ...rawGroups.map(g => g.id)]);
    const sanitizedLinks = rawLinks.filter(link => validIds.has(link.source) && validIds.has(link.target));

    elk.layout(getElkGraph(rawNodes, sanitizedLinks, rawGroups)).then((layoutGraph) => {
      const rfNodes = [];
      const rfEdges = [];

      const getNodeParentId = (nodeId) => {
         const node = rawNodes.find(n => n.id === nodeId);
         return node ? node.parent : null;
      };

      const getGroupPosition = (groupId) => {
          const group = layoutGraph.children.find(c => c.id === groupId);
          return group ? { x: group.x, y: group.y } : { x: 0, y: 0 };
      };

      const traverse = (graphNodes, parentId = null) => {
        graphNodes.forEach(node => {
          const isGroup = rawGroups.find(g => g.id === node.id);
          const rawNode = rawNodes.find(n => n.id === node.id);
          const dataSource = isGroup || rawNode;

          rfNodes.push({
            id: node.id,
            width: node.width, 
            height: node.height,
            position: { x: node.x, y: node.y },
            data: { 
                label: dataSource?.label,
                info: dataSource?.info,
                color: dataSource?.color 
            },
            style: isGroup ? {
                width: node.width,
                height: node.height,
                backgroundColor: dataSource?.color || 'rgba(0,0,0,0.02)',
                border: `2px dashed ${darkenColor(dataSource?.color)}`, 
                borderRadius: '12px',
                zIndex: 0, 
                cursor: 'pointer',
            } : {
                width: 180,
                height: 55,
                backgroundColor: dataSource?.color || '#fff',
                border: '1px solid #333',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                fontFamily: 'Georgia, serif',
                fontSize: '14px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                zIndex: 10,
                cursor: 'pointer',
            },
            parentNode: parentId,
            extent: parentId ? 'parent' : undefined,
          });

          if (node.children) traverse(node.children, node.id);
        });
      };
      if (layoutGraph.children) traverse(layoutGraph.children);

      if (layoutGraph.edges) {
          layoutGraph.edges.forEach(edge => {
             const sourceId = edge.sources[0];
             const targetId = edge.targets[0];
             const rawLink = sanitizedLinks.find(l => l.source === sourceId && l.target === targetId);
             const sourceParent = getNodeParentId(sourceId);
             const targetParent = getNodeParentId(targetId);
             
             let offsetX = 0; let offsetY = 0;
             if (sourceParent && sourceParent === targetParent) {
                 const groupPos = getGroupPosition(sourceParent);
                 offsetX = groupPos.x; offsetY = groupPos.y;
             }
             const fixedSections = (edge.sections || []).map(sec => ({
                 startPoint: { x: sec.startPoint.x + offsetX, y: sec.startPoint.y + offsetY },
                 endPoint: { x: sec.endPoint.x + offsetX, y: sec.endPoint.y + offsetY },
                 bendPoints: (sec.bendPoints || []).map(bp => ({ x: bp.x + offsetX, y: bp.y + offsetY }))
             }));

             rfEdges.push({
               id: edge.id,
               source: sourceId,
               target: targetId,
               type: 'elk',
               label: rawLink?.label,
               data: { sections: fixedSections, info: rawLink?.info, showLabel: true },
               style: { stroke: '#333', strokeWidth: 2, strokeDasharray: rawLink?.dashed ? '5,5' : '0' },
               markerEnd: { type: MarkerType.ArrowClosed, color: '#333' },
               zIndex: 5,
             });
          });
      }
      setNodes(rfNodes);
      setEdges(rfEdges);
      setTimeout(() => fitView({ padding: 0.2 }), 50);
    });
  }, [data, fitView]);

  useEffect(() => {
    setEdges((eds) => eds.map((e) => ({ ...e, data: { ...e.data, showLabel: showLabels } })));
  }, [showLabels, setEdges]);

  // Handle Interactions
  const onNodeClick = useCallback((event, node) => {
    if (isSnipMode) return;
    const worldPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setPopup({ x: worldPos.x, y: worldPos.y, title: node.data.label, content: node.data.info, accentColor: node.data.color || "#333" });
  }, [screenToFlowPosition, isSnipMode]);

  const onEdgeClick = useCallback((event, edge) => {
    if (isSnipMode) return;
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    const worldPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });

    const content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '12px', color: '#888' }}>CONNECTION</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             <span style={{ fontWeight: '600' }}>{sourceNode?.data?.label}</span>
             <span style={{ color: '#aaa' }}>➝</span>
             <span style={{ fontWeight: '600' }}>{targetNode?.data?.label}</span>
        </div>
        {(edge.data?.info || edge.label) && (
          <div style={{ marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '8px', fontStyle: 'italic' }}>"{edge.data?.info || edge.label}"</div>
        )}
      </div>
    );
    setPopup({ x: worldPos.x, y: worldPos.y, title: null, content: content, accentColor: "#555" });
  }, [nodes, screenToFlowPosition, isSnipMode]);

  const renderPopup = () => {
    if (!popup) return null;
    const screenX = popup.x * vpZoom + vpX;
    const screenY = popup.y * vpZoom + vpY;
    return <Popup x={screenX} y={screenY} title={popup.title} content={popup.content} accentColor={popup.accentColor} onClose={() => setPopup(null)} />;
  };

  if (!nodes || nodes.length === 0) {
      return (
        <div style={{ width: '100%', height: '100%', background: '#fbfbfb', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#888', flexDirection: 'column', gap: '15px' }}>
            <div style={{ fontSize: '40px', opacity: 0.3 }}>🕸️</div>
            <div>No diagram generated.</div>
            
            <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".json" 
                onChange={handleFileChange} 
            />
            <button 
                onClick={handleUploadClick}
                style={{
                    marginTop: '10px',
                    background: '#fff', border: '1px solid #ccc', borderRadius: '4px',
                    padding: '8px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)', color: '#555'
                }}
            >
                <FiUpload /> Load Schema
            </button>
        </div>
      );
  }

  return (
    <div style={{ width: '100%', height: '100%', background: '#fbfbfb', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes} // FIX: Pass stable constant
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={() => setPopup(null)}
        nodesDraggable={false}       
        nodesConnectable={false}
        
        // --- CRITICAL FIX ---
        // 1. Removed elementsSelectable={false} (it blocked clicks)
        // 2. Added nodesFocusable={false} (allows clicks but hides blue border)
        nodesFocusable={false}
        
        minZoom={0.1}
        maxZoom={2}
        fitView
      >
        <Background color="#ccc" gap={20} />
        <Controls showInteractive={!isSnipMode} /> 

        <SnipOverlay active={isSnipMode} onComplete={onSnipComplete} nodes={nodes} edges={edges} />

        <Panel position="top-right" style={{ display: 'flex', gap: '10px' }}>
            <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".json" 
                onChange={handleFileChange} 
            />
            
            <button 
                onClick={() => setShowLabels(!showLabels)}
                title={showLabels ? "Hide Labels" : "Show Labels"}
                style={{
                    background: '#fff', border: '1px solid #ccc', borderRadius: '4px',
                    padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                }}
            >
                {showLabels ? <FiEye /> : <FiEyeOff />}
            </button>
            
            <button 
                onClick={handleUploadClick}
                title="Upload Schema"
                style={{
                    background: '#fff', border: '1px solid #ccc', borderRadius: '4px',
                    padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                }}
            >
                <FiUpload />
            </button>

            <button 
                onClick={downloadSchema}
                title="Download JSON Schema"
                style={{
                    background: '#fff', border: '1px solid #ccc', borderRadius: '4px',
                    padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                }}
            >
                <FiCode />
            </button>
            <button 
                onClick={downloadImage}
                title="Download PNG"
                style={{
                    background: '#fff', border: '1px solid #ccc', borderRadius: '4px',
                    padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                }}
            >
                <FiDownload />
            </button>
        </Panel>
      </ReactFlow>
      {renderPopup()}
    </div>
  );
}

export default function Diagram(props) {
  return (
    <ReactFlowProvider>
      <DiagramInner {...props} />
    </ReactFlowProvider>
  );
}