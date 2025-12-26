import React, { useState } from "react";
import Diagram from "./Diagram";
import Brand from "./components/Brand";
// Note: Ensure DiagramGenerator.jsx is in your components folder or adjust path
import DiagramGenerator from "./components/ChatPanel.jsx"; 

export default function App() {
  const [diagramData, setDiagramData] = useState(null);

  // Callback to receive data from the Generator
  const handleDiagramGenerated = (data) => {
    console.log("App received new data:", data);
    setDiagramData(data);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Brand />
      
      {/* 1. Pass the dynamic data to Diagram */}
      <Diagram data={diagramData} />
      
      {/* 2. Use Generator instead of ChatPanel & Pass Callback */}
      <DiagramGenerator onDiagramGenerated={handleDiagramGenerated} />
    </div>
  );
}