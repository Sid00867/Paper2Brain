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

// Helper: Normalize IDs for fuzzy matching (case-insensitive trimming)
const normalizeId = (id) => (id ? id.trim().toLowerCase() : "");

export const parseDiagramResponse = (response) => {
  const { structure, relationships, explanations } = response;
  
  const groups = [];
  const nodes = [];
  const links = [];

  // --- Helper: Robust Section Extractor ---
  const extractSection = (text, tag) => {
    if (!text) return [];
    // Regex matches the tag block content
    const regex = new RegExp(`<\\s*${tag}\\s*>([\\s\\S]*?)<\\/\\s*${tag}\\s*>`, 'i');
    const match = regex.exec(text);
    if (match && match[1]) {
      return match[1].trim().split('\n').filter(line => line.trim().length > 0);
    }
    return [];
  };

  // --- Helper: Robust Line Splitter ---
  // Splits a line by '|' but limits the number of splits to avoid breaking content
  // e.g., "ID | Label | Content | Extra Pipe" -> ["ID", "Label", "Content | Extra Pipe"]
  const splitLine = (line, maxParts) => {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length <= maxParts) return parts;
    
    // If we have extra pipes, rejoin the overflow into the last part
    const base = parts.slice(0, maxParts - 1);
    const overflow = parts.slice(maxParts - 1).join(' | ');
    return [...base, overflow];
  };

  const parseExplanations = (xmlText) => {
    const map = { nodes: {}, rels: {}, groups: {} };
    if (!xmlText) return map;

    try {
        // XML PARSING (Preferred)
        const nodeBlocks = xmlText.match(/<\s*node\s*>[\s\S]*?<\/\s*node\s*>/gi) || [];
        nodeBlocks.forEach(block => {
            const nameMatch = block.match(/<name>([\s\S]*?)<\/name>/i);
            const detailsMatch = block.match(/<details>([\s\S]*?)<\/details>/i);
            if (nameMatch) {
                // Store BOTH exact and normalized keys for lookup
                const name = nameMatch[1].trim();
                map.nodes[name] = detailsMatch ? detailsMatch[1].trim() : "";
                map.nodes[normalizeId(name)] = map.nodes[name]; 
            }
        });

        // Parse Relationships
        const relBlocks = xmlText.match(/<\s*relationship\s*>[\s\S]*?<\/\s*relationship\s*>/gi) || [];
        relBlocks.forEach(block => {
            const fromMatch = block.match(/<from>([\s\S]*?)<\/from>/i);
            const toMatch = block.match(/<to>([\s\S]*?)<\/to>/i);
            const explMatch = block.match(/<explanation>([\s\S]*?)<\/explanation>/i);

            if (fromMatch && toMatch) {
                const from = fromMatch[1].trim();
                const to = toMatch[1].trim();
                // Store standard key
                map.rels[`${from}|${to}`] = explMatch ? explMatch[1].trim() : "";
                // Store normalized key
                map.rels[`${normalizeId(from)}|${normalizeId(to)}`] = map.rels[`${from}|${to}`];
            }
        });
        
        // Parse Groups
        const groupBlocks = xmlText.match(/<\s*group\s*>[\s\S]*?<\/\s*group\s*>/gi) || [];
        groupBlocks.forEach(block => {
            const idMatch = block.match(/<id>([\s\S]*?)<\/id>/i);
            const explMatch = block.match(/<explanation>([\s\S]*?)<\/explanation>/i);
            if (idMatch) {
                const id = idMatch[1].trim();
                map.groups[id] = explMatch ? explMatch[1].trim() : "";
            }
        });

    } catch (e) { console.warn("Explanation Parsing Failed:", e); }
    return map;
  };

  const explMap = parseExplanations(explanations);
  const nodeParentMap = {};
  const groupIdToColorMap = {};

  // 1. Parse Groups
  // Format: ID | Label | Children List
  const groupLines = extractSection(relationships, 'groups');
  
  groupLines.forEach((line, index) => {
    const lower = line.toLowerCase();
    // FIX: Only skip if starts with header
    if (lower.startsWith("group |") || lower.startsWith("id |")) return;
    if (!line.includes("|")) return;

    // Use safe split (3 parts: ID, Label, Children)
    const parts = splitLine(line, 3);
    
    if (parts.length >= 3) {
      const id = parts[0];
      const label = parts[1];
      // Split children by comma, handle empty cases
      const children = parts[2].split(',').map(s => s.trim()).filter(s => s);

      const theme = PALETTE[index % PALETTE.length];
      groupIdToColorMap[id] = theme;

      // Map normalized child ID to parent ID
      children.forEach(child => {
          nodeParentMap[normalizeId(child)] = id;
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
  // Format: Source | Type | Target | Label
  const linkLines = extractSection(relationships, 'relationships');
  
  linkLines.forEach(line => {
    const lower = line.toLowerCase();
    // FIX: Only skip if starts with header
    if (lower.startsWith("source |") || lower.startsWith("node_a |")) return;

    // Use safe split (4 parts max, preserves pipes in label)
    const parts = splitLine(line, 4);

    if (parts.length >= 3) {
      // Handle missing label scenario (Source | Type | Target) vs (Source | Type | Target | Label)
      const source = parts[0];
      // Index 1 is often the arrow type (-->), we ignore it mostly
      const target = parts[2];
      
      // Default label to empty if missing
      let label = parts[3] ? parts[3].replace(/^label:\s*/i, "") : "";

      // Try fuzzy lookup for explanations
      const exactKey = `${source}|${target}`;
      const fuzzyKey = `${normalizeId(source)}|${normalizeId(target)}`;
      const richInfo = explMap.rels[exactKey] || explMap.rels[fuzzyKey];

      links.push({
        source: source,
        target: target,
        label: label,
        info: richInfo || label 
      });
    }
  });

  // 3. Parse Nodes
  // Format: ID | Role
  const nodeLines = extractSection(structure, 'nodes');
  
  nodeLines.forEach(line => {
    const lower = line.toLowerCase();
    if (lower.startsWith("node_name |") || lower.startsWith("node |")) return;
    
    // Safe split (2 parts: ID, Role)
    const parts = splitLine(line, 2);

    if (parts.length >= 1) {
      const id = parts[0];
      const role = parts[1] || "Component";
      
      // Use normalized ID to find parent group
      const parentId = nodeParentMap[normalizeId(id)];
      const theme = parentId ? groupIdToColorMap[parentId] : null;
      
      // Try fuzzy lookup for explanations
      const richInfo = explMap.nodes[id] || explMap.nodes[normalizeId(id)];

      nodes.push({
        id: id,
        label: id,
        parent: parentId || null,
        color: theme ? theme.node : "#ffffff", 
        info: richInfo || role
      });
    }
  });

  return { nodes, links, groups };
};