// src/diagramParser.js

const PALETTE = [
  { group: "#e3f2fd", node: "#bbdefb" }, // Blue
  { group: "#f3e5f5", node: "#e1bee7" }, // Purple
  { group: "#e8f5e9", node: "#c8e6c9" }, // Green
  { group: "#fff3e0", node: "#ffe0b2" }, // Orange
  { group: "#fbe9e7", node: "#ffccbc" }, // Red/Pink
  { group: "#eceff1", node: "#cfd8dc" }, // Grey
  { group: "#fff8e1", node: "#ffecb3" }, // Yellow
  { group: "#e0f2f1", node: "#b2dfdb" }, // Teal
];

export const parseDiagramResponse = (response) => {
  const { structure, relationships, explanations } = response;
  
  const groups = [];
  const nodes = [];
  const links = [];

  // --- Helper: Strict but Space-Tolerant Section Extractor ---
  const extractSection = (text, tag) => {
    if (!text) return [];
    
    // Regex Logic:
    // 1. <\s*tag\s*>  : Matches opening tag with spaces (e.g. < nodes >)
    // 2. ([\s\S]*?)   : Captures content non-greedily
    // 3. <\/\s*tag\s*>: REQUIRES strict closing tag (e.g. </nodes>)
    const regex = new RegExp(`<\\s*${tag}\\s*>([\\s\\S]*?)<\\/\\s*${tag}\\s*>`, 'i');
    
    const match = regex.exec(text);
    if (match && match[1]) {
      return match[1].trim().split('\n').filter(line => line.trim().length > 0);
    }
    return [];
  };

  // --- Helper: Parse Explanations ---
  const parseExplanations = (xmlText) => {
    const map = { nodes: {}, rels: {}, groups: {} };
    if (!xmlText) return map;

    try {
        // Updated regex to handle spaces but require closing tags
        const nodeBlocks = xmlText.match(/<\s*node\s*>[\s\S]*?<\/\s*node\s*>/gi) || [];
        nodeBlocks.forEach(block => {
            const nameMatch = block.match(/name:\s*(.*?)(?:\n|$)/i);
            const detailsMatch = block.match(/details:\s*([\s\S]*?)(?:<\/\s*node\s*>|$)/i);
            if (nameMatch) {
                const name = nameMatch[1].trim();
                const details = detailsMatch ? detailsMatch[1].trim() : "";
                map.nodes[name] = details;
            }
        });

        const relBlocks = xmlText.match(/<\s*relationship\s*>[\s\S]*?<\/\s*relationship\s*>/gi) || [];
        relBlocks.forEach(block => {
            const fromMatch = block.match(/from:\s*(.*?)(?:\n|$)/i);
            const toMatch = block.match(/to:\s*(.*?)(?:\n|$)/i);
            const explMatch = block.match(/explanation:\s*([\s\S]*?)(?:<\/\s*relationship\s*>|$)/i);
            if (fromMatch && toMatch) {
                const key = `${fromMatch[1].trim()}|${toMatch[1].trim()}`;
                map.rels[key] = explMatch ? explMatch[1].trim() : "";
            }
        });
        
        const groupBlocks = xmlText.match(/<\s*group\s*>[\s\S]*?<\/\s*group\s*>/gi) || [];
        groupBlocks.forEach(block => {
            const idMatch = block.match(/id:\s*(.*?)(?:\n|$)/i);
            const explMatch = block.match(/explanation:\s*([\s\S]*?)(?:<\/\s*group\s*>|$)/i);
            if (idMatch) {
                const id = idMatch[1].trim();
                map.groups[id] = explMatch ? explMatch[1].trim() : "";
            }
        });
    } catch (e) {
        console.warn("Explanation Parsing Failed:", e);
    }

    return map;
  };

  const explMap = parseExplanations(explanations);

  // 1. Parse Groups
  const groupLines = extractSection(relationships, 'groups');
  const groupIdToColorMap = {};
  const nodeParentMap = {};

  groupLines.forEach((line, index) => {
    if (line.toLowerCase().includes("group |") || line.toLowerCase().includes("id |")) return;
    if (!line.includes("|")) return;

    const parts = line.split('|').map(s => s.trim());
    if (parts.length >= 3) {
      const id = parts[0];
      const label = parts[1];
      const children = parts[2].split(',').map(s => s.trim());

      const theme = PALETTE[index % PALETTE.length];
      groupIdToColorMap[id] = theme;

      children.forEach(child => {
          nodeParentMap[child] = id;
      });

      groups.push({
        id: id,
        label: label,
        color: theme.group,
        info: explMap.groups[id] || "Group Container" 
      });
    }
  });

  // 2. Parse Relationships
  const linkLines = extractSection(relationships, 'relationships');
  
  linkLines.forEach(line => {
    if (line.toLowerCase().includes("source |") || line.toLowerCase().includes("node_a |")) return;

    const parts = line.split('|').map(s => s.trim());
    if (parts.length >= 4) {
      const source = parts[0];
      const target = parts[2];
      const label = parts[3].replace(/^label:\s*/i, "");

      const key = `${source}|${target}`;
      const richInfo = explMap.rels[key];

      links.push({
        source: source,
        target: target,
        label: label,
        info: richInfo || label 
      });
    }
  });

  // 3. Parse Nodes
  const nodeLines = extractSection(structure, 'nodes');
  
  nodeLines.forEach(line => {
    if (line.toLowerCase().includes("node_name |") || line.toLowerCase().includes("role")) return;
    
    const parts = line.split('|').map(s => s.trim());
    if (parts.length >= 1) {
      const id = parts[0];
      const role = parts[1] || "Component";
      
      const parentId = nodeParentMap[id];
      const theme = parentId ? groupIdToColorMap[parentId] : null;
      const richInfo = explMap.nodes[id];

      // RAW OUTPUT: No prefix cleaning, no replacement
      const displayLabel = id; 

      nodes.push({
        id: id,
        label: displayLabel,
        parent: parentId || null,
        color: theme ? theme.node : "#ffffff", 
        info: richInfo || role
      });
    }
  });

  return { nodes, links, groups };
};