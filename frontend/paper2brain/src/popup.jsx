import React from "react";

export default function Popup({ x, y, title, content, onClose, accentColor = "#333" }) {
  
  // --- Text Formatting Helper ---
  const formatContent = (rawContent) => {
    // 1. If content is React Component/JSX (like Edges), render as is.
    if (typeof rawContent !== "string") return rawContent;

    // 2. If content is short, just return it wrapped in a paragraph.
    if (rawContent.length < 150) {
        return <p style={{ margin: 0 }}>{rawContent}</p>;
    }

    // 3. Logic to split giant paragraphs
    // Split by sentences (Full stop, !, ? followed by space)
    const sentences = rawContent.split(/(?<=[.!?])\s+/);
    
    const paragraphs = [];
    let currentBlock = "";
    
    // Threshold: ~50 chars per line * 3.5 lines = ~175 chars
    const CHAR_THRESHOLD = 175; 

    sentences.forEach((sentence) => {
      currentBlock += sentence + " ";
      
      // Only break if we have accumulated enough text to fill 3-4 lines
      if (currentBlock.length >= CHAR_THRESHOLD) {
        paragraphs.push(currentBlock.trim());
        currentBlock = "";
      }
    });

    // Push any remaining text
    if (currentBlock.trim()) {
      paragraphs.push(currentBlock.trim());
    }

    return paragraphs.map((para, i) => (
      <p key={i} style={{ margin: "0 0 12px 0", lastChild: { marginBottom: 0 } }}>
        {para}
      </p>
    ));
  };

  return (
    <div
      className="popup-enter"
      style={{
        position: "absolute",
        left: x,
        top: y - 10,
        transform: "translate(-50%, -100%)",
        zIndex: 2000,
        pointerEvents: "auto",
        paddingBottom: "12px",
        filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.15))"
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "8px",
          minWidth: "220px",
          maxWidth: "320px",
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.05)"
        }}
      >
        {/* Accent Header */}
        <div style={{ height: "4px", width: "100%", background: accentColor }} />

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "18px",
            color: "#aaa",
            lineHeight: 1,
            padding: "4px"
          }}
        >
          &times;
        </button>

        <div style={{ padding: "16px 20px" }}>
          {title && (
            <h4
              style={{
                margin: "0 0 10px 0",
                fontSize: "15px",
                fontWeight: "700",
                color: "#222",
                fontFamily: "'Segoe UI', Georgia, serif",
                paddingRight: "15px"
              }}
            >
              {title}
            </h4>
          )}
          
          <div style={{ 
            margin: 0, 
            fontSize: "13px", 
            color: "#555", 
            lineHeight: "1.5",
            fontFamily: "'Segoe UI', sans-serif"
          }}>
            {/* Call the helper here */}
            {formatContent(content)}
          </div>
        </div>
      </div>

      {/* Triangle Arrow */}
      <div
        style={{
          position: "absolute",
          bottom: "6px",
          left: "50%",
          marginLeft: "-6px",
          width: "12px",
          height: "12px",
          background: "#fff",
          transform: "rotate(45deg)",
          zIndex: -1
        }}
      />
    </div>
  );
}