import React, { useState, useRef, useEffect } from "react";
import { FiPlus, FiX, FiUploadCloud, FiRefreshCw, FiArrowRight, FiTerminal, FiAlertCircle } from "react-icons/fi";
import "./chat.css";
import { parseDiagramResponse } from "./diagramParser.js";

export default function ChatPanel({ onDiagramGenerated }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isComplete, setIsComplete] = useState(false); 
  const [hasError, setHasError] = useState(false); // New Error State
  
  const [files, setFiles] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [logs, setLogs] = useState([]); 
  
  const logsEndRef = useRef(null); 

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || files.length === 0) return;
    
    setIsSubmitted(true);
    setIsComplete(false);
    setHasError(false); // Reset error state
    setLogs([{ message: "Establishing connection to brain..." }]); 

    try {
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("file", files[0]);

      const response = await fetch("http://localhost:8000/api/generate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.statusText}`);

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
              setIsComplete(true);
            } else if (json.type === "error") {
              // Capture the error explicitly
              setHasError(true);
              setLogs((prev) => [...prev, { message: `CRITICAL ERROR: ${json.message}`, isError: true }]);
            }
          } catch (e) {
            console.error("Stream parse error", e);
          }
        }
      }

    } catch (err) {
      setHasError(true);
      setLogs((prev) => [...prev, { message: "Connection failed. Please check backend.", isError: true }]);
    }
  };

  const handleRetry = () => {
    setIsSubmitted(false);
    setHasError(false);
    setLogs([]);
  };

  const handleNewSession = () => {
    window.location.reload();
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
          <h3>Diagram Config</h3>
          <button onClick={() => setIsOpen(false)} className="close-btn">
            <FiX size={20} />
          </button>
        </header>

        <div className="panel-content">
          {!isSubmitted ? (
            <div className="input-group">
              <div className="file-section">
                <div className="file-header">
                  <span className="label">Context Files *</span>
                  <label className="upload-btn">
                    <FiUploadCloud />
                    <span>Add</span>
                    <input type="file" hidden onChange={handleFileChange} />
                  </label>
                </div>
                {files.length > 0 ? (
                  <ul className="file-list">
                    {files.map((f, i) => (
                      <li key={i}>
                        <span className="filename">{f.name}</span>
                        <button onClick={() => removeFile(i)}><FiX /></button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-files">No files attached. (Required)</div>
                )}
              </div>

              <div className="prompt-section">
                <span className="label">User Prompt *</span>
                <textarea 
                  placeholder="What specifically do you want to visualize?"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              <button 
                className="generate-btn"
                onClick={handleSubmit}
                disabled={!prompt.trim() || files.length === 0}
              >
                <span>Generate Diagram</span>
                <FiArrowRight />
              </button>
            </div>
          ) : (
            <div className="submitted-view">
              
              <div className="read-only-section">
                <span className="label">Your Prompt:</span>
                <div className="read-only-prompt">"{prompt}"</div>
              </div>

              <div className="terminal-window" style={{ borderColor: hasError ? '#ff6b6b' : 'transparent' }}>
                <div className="terminal-header" style={{ color: hasError ? '#ff6b6b' : '#ccc' }}>
                  <FiTerminal />
                  <span>{hasError ? "Process Failed" : "Agent Logs"}</span>
                </div>
                <div className="terminal-body">
                  {logs.map((log, i) => (
                    <div key={i} className={`terminal-line ${log.isError ? "error" : ""}`}>
                      <span className="timestamp">[{new Date().toLocaleTimeString('en-US', {hour12: false, hour: "2-digit", minute:"2-digit", second:"2-digit"})}]</span>
                      <span className="message">{log.message}</span>
                    </div>
                  ))}
                  {!isComplete && !hasError && (
                    <div className="terminal-line">
                      <span className="cursor-block">▋</span>
                    </div>
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>

              {/* SUCCESS STATE */}
              {isComplete && !hasError && (
                <div className="completion-actions">
                  <div className="success-banner">Diagram Generated Successfully</div>
                  <button className="new-session-btn" onClick={handleNewSession}>
                    <FiRefreshCw />
                    <span>New Session</span>
                  </button>
                </div>
              )}

              {/* FAILURE STATE */}
              {hasError && (
                <div className="completion-actions">
                  <div className="error-banner">
                    <FiAlertCircle style={{marginRight: '8px'}}/>
                    Generation Failed
                  </div>
                  <div style={{fontSize: '13px', color: '#666', textAlign: 'center', marginBottom: '10px'}}>
                    Check the logs above for details.
                  </div>
                  <button className="retry-btn" onClick={handleRetry}>
                    Try Again
                  </button>
                </div>
              )}

            </div>
          )}
        </div>
      </aside>
    </>
  );
}