import React, { useState } from "react";
import Diagram from "./Diagram";
import Brand from "./components/Brand";
import DiagramGenerator from "./components/ChatPanel.jsx"; 

export default function App() {
  const [diagramData, setDiagramData] = useState(null);
  
  // --- Snip State Management ---
  const [isSnipMode, setIsSnipMode] = useState(false);
  const [snippedNodes, setSnippedNodes] = useState([]);

  const handleDiagramGenerated = (data) => {
    setDiagramData(data);
    // Reset snip on new generation
    setSnippedNodes([]);
    setIsSnipMode(false);
  };

  // Called when user toggles the button in ChatPanel
  const handleSnipRequest = (isActive) => {
    setIsSnipMode(isActive);
  };

  // Called when Diagram finishes a drag selection
  const handleSnipComplete = (nodes) => {
    // Add unique nodes to existing selection
    setSnippedNodes(prev => {
        const newSet = new Set([...prev, ...nodes]);
        return Array.from(newSet);
    });
    setIsSnipMode(false); // Turn off snip mode after one capture
  };

  const handleRemoveSnippedNode = (nodeToRemove) => {
    setSnippedNodes(prev => prev.filter(n => n !== nodeToRemove));
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Brand />
      
      {/* Pass snip state and handlers to Diagram */}
      <Diagram 
        data={diagramData} 
        isSnipMode={isSnipMode}
        onSnipComplete={handleSnipComplete}
        onImport={setDiagramData}
      />
      
      {/* Pass snip state and handlers to ChatPanel */}
      <DiagramGenerator 
        onDiagramGenerated={handleDiagramGenerated}
        onSnipRequest={handleSnipRequest}
        snippedNodes={snippedNodes}
        onRemoveSnippedNode={handleRemoveSnippedNode}
      />
    </div>
  );
}