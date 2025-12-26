import { useCallback, useEffect, useState } from 'react';
import ReactFlow, { 
  useNodesState, 
  useEdgesState, 
  Background,
  Controls,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  useViewport // Import this hook
} from 'reactflow';
import 'reactflow/dist/style.css';
import ELK from "elkjs/lib/elk.bundled.js";
import { toPng } from 'html-to-image'; 

import Popup from "./Popup";
import ElkEdge from "./ElkEdge";
import { FiEye, FiEyeOff, FiDownload } from "react-icons/fi";

const elk = new ELK();
const edgeTypes = { elk: ElkEdge };

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

const getElkGraph = (nodes, links, groups) => {
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

function DiagramInner({ data }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [popup, setPopup] = useState(null);
  const [showLabels, setShowLabels] = useState(true);

  // 1. Get Viewport State and Helper Functions
  const { fitView, screenToFlowPosition } = useReactFlow(); 
  const { x: vpX, y: vpY, zoom: vpZoom } = useViewport(); // Listens to Pan/Zoom

  const rawNodes = data?.nodes || [];
  const rawLinks = data?.links || [];
  const rawGroups = data?.groups || [];

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
            style: {
                width: imageWidth,
                height: imageHeight,
                transform: `scale(1)`,
            },
        })
        .then((dataUrl) => {
            const a = document.createElement('a');
            a.setAttribute('download', 'architecture-diagram.png');
            a.setAttribute('href', dataUrl);
            a.click();
        })
        .catch((err) => {
            console.error('Download failed', err);
        });
    }
  };

  const darkenColor = (color) => color || "#ccc"; 

  useEffect(() => {
    if (!rawNodes.length) {
      setNodes([]); setEdges([]); return;
    }

    const validIds = new Set([
        ...rawNodes.map(n => n.id),
        ...rawGroups.map(g => g.id)
    ]);

    const sanitizedLinks = rawLinks.filter(link => {
        const sourceExists = validIds.has(link.source);
        const targetExists = validIds.has(link.target);
        if (!sourceExists || !targetExists) {
            console.warn(`[Diagram] Skipping invalid edge: ${link.source} -> ${link.target}`);
            return false;
        }
        return true;
    });

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
                zIndex: -1,
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
                zIndex: 10 
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
             
             let offsetX = 0;
             let offsetY = 0;

             if (sourceParent && sourceParent === targetParent) {
                 const groupPos = getGroupPosition(sourceParent);
                 offsetX = groupPos.x;
                 offsetY = groupPos.y;
             }

             const fixedSections = (edge.sections || []).map(sec => ({
                 startPoint: { x: sec.startPoint.x + offsetX, y: sec.startPoint.y + offsetY },
                 endPoint: { x: sec.endPoint.x + offsetX, y: sec.endPoint.y + offsetY },
                 bendPoints: (sec.bendPoints || []).map(bp => ({ 
                     x: bp.x + offsetX, 
                     y: bp.y + offsetY 
                 }))
             }));

             rfEdges.push({
               id: edge.id,
               source: sourceId,
               target: targetId,
               type: 'elk',
               label: rawLink?.label,
               data: { 
                   sections: fixedSections, 
                   info: rawLink?.info,
                   showLabel: true
               },
               style: { 
                   stroke: '#333', 
                   strokeWidth: 2,
                   strokeDasharray: rawLink?.dashed ? '5,5' : '0',
               },
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
    setEdges((eds) => 
      eds.map((e) => ({
        ...e,
        data: { ...e.data, showLabel: showLabels }
      }))
    );
  }, [showLabels, setEdges]);

  // 2. Updated Interaction Logic: Store World Coordinates
  const onNodeClick = useCallback((event, node) => {
    // Convert screen click to Flow World position
    const worldPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });

    setPopup({ 
        x: worldPos.x, 
        y: worldPos.y, 
        title: node.data.label, 
        content: node.data.info,
        accentColor: node.data.color || "#333" 
    });
  }, [screenToFlowPosition]);

  const onEdgeClick = useCallback((event, edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    const sourceLabel = sourceNode?.data?.label || edge.source;
    const targetLabel = targetNode?.data?.label || edge.target;

    // Convert screen click to Flow World position
    const worldPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });

    const content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '12px', color: '#888' }}>CONNECTION</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             <span style={{ fontWeight: '600' }}>{sourceLabel}</span>
             <span style={{ color: '#aaa' }}>➝</span>
             <span style={{ fontWeight: '600' }}>{targetLabel}</span>
        </div>
        {(edge.data?.info || edge.label) && (
          <div style={{ marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '8px', fontStyle: 'italic' }}>
            "{edge.data?.info || edge.label}"
          </div>
        )}
      </div>
    );
    setPopup({ 
        x: worldPos.x, 
        y: worldPos.y, 
        title: null, 
        content: content,
        accentColor: "#555" 
    });
  }, [nodes, screenToFlowPosition]);

  if (!nodes || nodes.length === 0) {
      return (
        <div style={{ width: '100%', height: '100%', background: '#fbfbfb', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#888', flexDirection: 'column', gap: '15px' }}>
            <div style={{ fontSize: '40px', opacity: 0.3 }}>🕸️</div>
            <div>No diagram generated.</div>
        </div>
      );
  }

  // 3. Dynamic Calculation for Render
  // Transform World Coordinates -> Screen Coordinates using current Viewport
  const renderPopup = () => {
    if (!popup) return null;
    
    // (WorldX * Zoom) + PanX = ScreenX
    const screenX = popup.x * vpZoom + vpX;
    const screenY = popup.y * vpZoom + vpY;

    return (
        <Popup 
            x={screenX} 
            y={screenY} 
            title={popup.title} 
            content={popup.content} 
            accentColor={popup.accentColor}
            onClose={() => setPopup(null)} 
        />
    );
  };

  return (
    <div style={{ width: '100%', height: '100%', background: '#fbfbfb' }}>
      <ReactFlow
        key={rawNodes.length}
        nodes={nodes}
        edges={edges}
        nodeTypes={{}} 
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={() => setPopup(null)}
        nodesDraggable={false}       
        nodesConnectable={false}     
        elementsSelectable={false}   
        minZoom={0.1}
        maxZoom={2}
        fitView
      >
        <Background color="#ccc" gap={20} />
        <Controls showInteractive={false} />
        
        <Panel position="top-right" style={{ display: 'flex', gap: '10px' }}>
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
      
      {/* 4. Render popup with dynamic coords */}
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