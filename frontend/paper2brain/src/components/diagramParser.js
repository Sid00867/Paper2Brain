// src/diagramParser.js

// A palette of distinct, soft architectural colors
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
  const { explanations, relationships } = response;
  
  const groups = [];
  const nodes = [];
  const links = [];

  // --- Helper: Extract blocks by tag ---
  const extractBlocks = (text, tag) => {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g');
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push(match[1].trim());
    }
    return matches;
  };

  // --- Helper: Parse key-value pairs ---
  const parseProps = (block) => {
    const lines = block.split('\n');
    const props = {};
    lines.forEach(line => {
      const splitIndex = line.indexOf(':');
      if (splitIndex > -1) {
        const key = line.substring(0, splitIndex).trim().toLowerCase();
        const value = line.substring(splitIndex + 1).trim();
        props[key] = value;
      }
    });
    return props;
  };

  // 1. Parse Groups and Assign Colors
  const groupBlocks = extractBlocks(explanations, 'group');
  const groupIdToColorMap = {};

  groupBlocks.forEach((block, index) => {
    const p = parseProps(block);
    if (p.id) {
      // Cycle through palette
      const theme = PALETTE[index % PALETTE.length];
      groupIdToColorMap[p.id] = theme; // Store for nodes to use later

      groups.push({
        id: p.id,
        label: p.label || "Group",
        color: theme.group,
        info: p.explanation || "No info"
      });
    }
  });

  // 2. Parse Nodes and Inherit Colors
  const nodeParentMap = {};
  const rawGroupBlocks = extractBlocks(relationships, 'groups');
  if (rawGroupBlocks.length > 0) {
    const lines = rawGroupBlocks[0].split('\n').filter(l => l.trim());
    lines.forEach(line => {
      const parts = line.split('|');
      if (parts.length >= 3) {
        const gId = parts[0].trim();
        const nodeNames = parts[2].split(',').map(n => n.trim());
        nodeNames.forEach(name => {
          nodeParentMap[name] = gId;
        });
      }
    });
  }

  const nodeBlocks = extractBlocks(explanations, 'node');
  nodeBlocks.forEach(block => {
    const p = parseProps(block);
    if (p.name) {
      const parentId = nodeParentMap[p.name];
      const theme = groupIdToColorMap[parentId];
      
      nodes.push({
        id: p.name,
        label: p.name,
        parent: parentId || null,
        // Use assigned node color, or white if ungrouped
        color: theme ? theme.node : "#ffffff", 
        info: p.details || p.role || "No info"
      });
    }
  });

  // 3. Parse Relationships
  const linkBlocks = extractBlocks(explanations, 'relationship');
  linkBlocks.forEach(block => {
    const p = parseProps(block);
    if (p.from && p.to) {
      links.push({
        source: p.from,
        target: p.to,
        label: p.label || "",
        info: p.explanation || ""
      });
    }
  });

  return { nodes, links, groups };
};