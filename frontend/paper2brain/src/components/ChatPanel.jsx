// ... (Imports remain the same: React, icons, etc.)
import React, { useState, useRef, useEffect } from "react";
import { FiPlus, FiX, FiUploadCloud, FiRefreshCw, FiArrowRight, FiTerminal, FiScissors, FiLayers, FiAlertCircle } from "react-icons/fi";
import "./chat.css";
import { parseDiagramResponse } from "./diagramParser";

export default function ChatPanel({ onDiagramGenerated, onSnipRequest, snippedNodes = [], onRemoveSnippedNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState('input');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasError, setHasError] = useState(false);
  // ... (Other state: currentData, files, prompt, chatHistory, logs, config...)
  const [currentData, setCurrentData] = useState(null); 
  const [files, setFiles] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [logs, setLogs] = useState([]); 
  const [skipExplanations, setSkipExplanations] = useState(false);
  const [useFastParse, setUseFastParse] = useState(false);
  const [iterations, setIterations] = useState(2); 
  const [contextSize, setContextSize] = useState(3000);

  const [isSnipActive, setIsSnipActive] = useState(false);

  const logsEndRef = useRef(null); 
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs, chatHistory]);

  // ... (readStream, handleGenerate, handleFileChange remain identical) ...
  const readStream = async (response) => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); 
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.type === "log") {
              setLogs((prev) => [...prev, json]);
            } else if (json.type === "result") {
              const parsedData = parseDiagramResponse(json.data);
              if (onDiagramGenerated) onDiagramGenerated(parsedData);
              setCurrentData(json.data);
            } else if (json.type === "error") {
              setHasError(true);
              setLogs((prev) => [...prev, { message: `ERROR: ${json.message}`, isError: true }]);
            }
          } catch (e) { console.error(e); }
        }
      }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || files.length === 0) return;
    setViewMode('processing');
    setIsProcessing(true);
    setHasError(false);
    setLogs([{ message: "Starting generation pipeline..." }]); 
    setChatHistory([{ role: 'user', text: prompt }]);
    const currentPrompt = prompt;
    setPrompt(""); 
    try {
      const formData = new FormData();
      formData.append("prompt", currentPrompt);
      formData.append("file", files[0]);
      formData.append("skip_explanations", skipExplanations);
      formData.append("use_fast_parse", useFastParse);
      formData.append("iterations", iterations);
      const response = await fetch("http://localhost:8000/api/generate", { method: "POST", body: formData });
      if (!response.ok) throw new Error(`HTTP Error: ${response.statusText}`);
      await readStream(response);
      setViewMode('chat'); 
    } catch (err) {
      setHasError(true);
      setLogs((prev) => [...prev, { message: "Failed.", isError: true }]);
    } finally { setIsProcessing(false); }
  };

  const handleRevision = async () => {
    if (!prompt.trim() || !currentData || isProcessing) return;
    const revisionPrompt = prompt;
    setPrompt("");
    setIsProcessing(true);
    
    // UI Feedback
    const snipContext = snippedNodes.length > 0 ? ` [Focused on ${snippedNodes.length} nodes]` : "";
    setChatHistory(prev => [...prev, { role: 'user', text: revisionPrompt + snipContext }]);
    setLogs([{ message: "Processing revision..." }]);
    
    // Turn off snip mode when submitting
    setIsSnipActive(false); 
    if(onSnipRequest) onSnipRequest(false);

    try {
      const formData = new FormData();
      formData.append("prompt", revisionPrompt);
      formData.append("current_structure", currentData.structure);
      formData.append("current_relationships", currentData.relationships);
      formData.append("source_text_memory", currentData.source_text_memory || ""); 
      formData.append("snipped_nodes", snippedNodes.join(", "));
      formData.append("skip_explanations", skipExplanations);
      formData.append("context_size", contextSize); 

      const response = await fetch("http://localhost:8000/api/revise", { method: "POST", body: formData });
      if (!response.ok) throw new Error(`HTTP Error: ${response.statusText}`);
      await readStream(response);

    } catch (err) {
      setLogs((prev) => [...prev, { message: "Revision failed.", isError: true }]);
    } finally { setIsProcessing(false); }
  };

  const toggleSnip = () => {
    if (isProcessing) return;
    const newState = !isSnipActive;
    setIsSnipActive(newState);
    if (onSnipRequest) onSnipRequest(newState);
  };

  const handleFileChange = (e) => {
    if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files)]);
  };

  return (
    <>
      {!isOpen && (
        <button className="generator-trigger" onClick={() => setIsOpen(true)}>
          <FiPlus size={20} />
          <span>New Diagram</span>
        </button>
      )}

      <aside className={`generator-panel ${isOpen ? "open" : ""}`}>
        <header className="panel-header">
          <h3>{viewMode === 'input' ? "Diagram Config" : "Designer Copilot"}</h3>
          <button onClick={() => setIsOpen(false)} className="close-btn"><FiX size={20} /></button>
        </header>

        <div className="panel-content">
          {viewMode === 'input' ? (
             /* ... (Input mode UI remains identical) ... */
             <div className="input-group">
               {/* ... Keep File Section, Prompt Section, Settings ... */}
               <div className="file-section">
                <div className="file-header">
                  <span className="label">Context Files *</span>
                  <label className="upload-btn">
                    <FiUploadCloud /> <span>Add</span>
                    <input type="file" hidden onChange={handleFileChange} disabled={isProcessing} />
                  </label>
                </div>
                {files.length > 0 ? (
                  <ul className="file-list">
                    {files.map((f, i) => (
                      <li key={i}><span className="filename">{f.name}</span> <button onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}><FiX /></button></li>
                    ))}
                  </ul>
                ) : <div className="empty-files">No files attached.</div>}
              </div>
              <div className="prompt-section">
                <span className="label">User Prompt *</span>
                <textarea placeholder="What specifically do you want to visualize?" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={isProcessing} />
              </div>
              <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" id="skipExplanations" checked={skipExplanations} onChange={(e) => setSkipExplanations(e.target.checked)}/>
                  <label htmlFor="skipExplanations" className="chk-label">Disable Explanations (Faster Generation)</label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" id="useFastParse" checked={useFastParse} onChange={(e) => setUseFastParse(e.target.checked)}/>
                  <label htmlFor="useFastParse" className="chk-label">Faster Parsing (Less Intelligence)</label>
                </div>
                <div style={{ marginTop:'10px', paddingTop:'10px', borderTop:'1px solid #eee' }}>
                   <div style={{fontSize:'12px', fontWeight:'bold', color:'#777', marginBottom:'5px'}}>Refinement Passes: {iterations}</div>
                   <input type="range" min="1" max="5" value={iterations} onChange={(e) => setIterations(parseInt(e.target.value))} style={{width:'100%', accentColor:'#455a64'}}/>
                </div>
              </div>
              <button className="generate-btn" onClick={handleGenerate} disabled={!prompt.trim() || files.length === 0 || isProcessing}>
                {isProcessing ? "Generating..." : <span>Generate Diagram <FiArrowRight /></span>}
              </button>
            </div>
          ) : (
            <div className="chat-interface">
              <div className="chat-history">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`chat-msg ${msg.role}`}>
                    <strong>{msg.role === 'user' ? 'You' : 'Agent'}:</strong> {msg.text}
                  </div>
                ))}
                
                <div className="terminal-window compact" style={{marginTop:'auto', minHeight:'120px', maxHeight:'200px'}}>
                  <div className="terminal-header" style={{ color: hasError ? '#ff6b6b' : '#ccc' }}><FiTerminal /> System Logs</div>
                  <div className="terminal-body">
                    {logs.map((log, i) => (
                      <div key={i} className={`terminal-line ${log.isError ? "error" : ""}`}>
                        <span className="message">{log.message}</span>
                      </div>
                    ))}
                    {isProcessing && <div className="terminal-line"><span className="cursor-block">▋</span></div>}
                    <div ref={logsEndRef} />
                  </div>
                </div>
                <div ref={chatEndRef} />
              </div>

              {hasError ? (
                  <div className="completion-actions">
                    <div className="error-banner"><FiAlertCircle style={{marginRight: '8px'}}/> Generation Failed</div>
                    <button className="retry-btn" onClick={() => setViewMode('input')}>Retry</button>
                  </div>
              ) : (
                <div className="revision-container">
                    <div className="revision-header">
                        <span className="label">Revision Controls</span>
                        <button className={`snip-toggle ${isSnipActive ? 'active' : ''}`} onClick={toggleSnip} disabled={isProcessing}>
                            <FiScissors /> {isSnipActive ? "Snip Active" : "Snip Area"}
                        </button>
                    </div>

                    {/* NEW: Snip Tray */}
                    {snippedNodes.length > 0 && (
                        <div className="snip-tray">
                            <div className="tray-label"><FiLayers /> Selected Context:</div>
                            <div className="tray-items">
                            {snippedNodes.map((node, i) => (
                                <span key={i} className="snip-tag">
                                {node}
                                <button onClick={() => onRemoveSnippedNode && onRemoveSnippedNode(node)}><FiX /></button>
                                </span>
                            ))}
                            </div>
                        </div>
                    )}

                    <div className="revision-input-wrapper">
                    <textarea 
                        className="revision-input"
                        placeholder="Describe your changes..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        disabled={isProcessing}
                        onKeyDown={(e) => {
                          if(e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault(); 
                            if(!isProcessing && prompt.trim()) handleRevision();
                          }
                        }}
                    />
                    <button className="send-revision-btn" onClick={handleRevision} disabled={!prompt.trim() || isProcessing}>
                        <FiArrowRight />
                    </button>
                    </div>
                    <div style={{marginTop:'5px', fontSize:'11px', color:'#999', display:'flex', justifyContent:'space-between'}}>
                        <span>RAG Memory Context: {contextSize} chars</span>
                        <input type="range" min="1000" max="10000" step="1000" value={contextSize} onChange={(e) => setContextSize(parseInt(e.target.value))} style={{width:'100px', accentColor:'#455a64'}}/>
                    </div>
                </div>
              )}
              <button className="new-session-btn" onClick={() => window.location.reload()} disabled={isProcessing}>
                <FiRefreshCw /> Start New Session
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}