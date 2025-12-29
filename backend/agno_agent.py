from dotenv import load_dotenv
load_dotenv()

import re
from pypdf import PdfReader
from agno.agent import Agent
from agno.models.groq import Groq

from system_prompt import (
    MAIN_AGENT_PROMPT,
    RELATIONSHIP_AGENT_PROMPT,
    REVISION_AGENT_PROMPT,
    JUSTIFIER_AGENT_PROMPT,
)

def log(msg):
    print(f"[Paper2Brain] {msg}", flush=True)

def load_pdf_text(path: str) -> str:
    try:
        reader = PdfReader(path)
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    except: return ""

def extract_section(text: str, tag: str) -> str:
    if not text: return ""
    pattern = re.compile(f"<{tag}>(.*?)</{tag}>", re.DOTALL | re.IGNORECASE)
    match = pattern.search(text)
    return match.group(1).strip() if match else ""

# --- Clean Artifacts: Remove accidental headers/markdown tables ---
def clean_artifacts(text_block: str) -> str:
    if not text_block: return ""
    lines = text_block.split('\n')
    valid_lines = []
    for line in lines:
        l = line.strip().lower()
        if l.startswith("group |") or l.startswith("id |") or l.startswith("label |") or l.startswith("source |") or l.startswith("node_a |"):
            continue
        if "|" not in line:
            continue
        valid_lines.append(line)
    return "\n".join(valid_lines)

def validate_and_format_main(text: str) -> str:
    nodes = extract_section(text, "nodes")
    context = extract_section(text, "relationship_context")
    if nodes: return f"<nodes>\n{nodes}\n</nodes>\n\n<relationship_context>\n{context}\n</relationship_context>"
    return ""

def validate_and_format_rels(text: str) -> str:
    groups = extract_section(text, "groups")
    rels = extract_section(text, "relationships")
    clean_groups = clean_artifacts(groups)
    clean_rels = clean_artifacts(rels)
    return f"<groups>\n{clean_groups}\n</groups>\n\n<relationships>\n{clean_rels}\n</relationships>"

# --- Special Validator for Revision Agent (Has All 3 Parts) ---
def validate_full_state(text: str) -> str:
    nodes = extract_section(text, "nodes")
    groups = extract_section(text, "groups")
    rels = extract_section(text, "relationships")
    
    clean_nodes = clean_artifacts(nodes)
    clean_groups = clean_artifacts(groups)
    clean_rels = clean_artifacts(rels)

    if not clean_nodes or not clean_nodes.strip():
        return {"structure": None, "relationships": None}
    
    # We construct the split formats expected by the frontend
    # But internally we return a dict or just string blocks?
    # The pipeline expects 'structure' (nodes) and 'relationships' (groups+rels)
    return {
        "structure": f"<nodes>\n{clean_nodes}\n</nodes>",
        "relationships": f"<groups>\n{clean_groups}\n</groups>\n\n<relationships>\n{clean_rels}\n</relationships>"
    }

def get_relevant_context(source_text: str, query: str, context_size: int = 3000) -> str:
    if not source_text or not query or query == "NO_SEARCH": return ""
    chunks = source_text.split("\n\n")
    query_terms = set(re.findall(r"\w+", query.lower()))
    scored_chunks = []
    for chunk in chunks:
        chunk_terms = set(re.findall(r"\w+", chunk.lower()))
        if not chunk_terms: continue
        score = len(query_terms.intersection(chunk_terms))
        if score > 0: scored_chunks.append((score, chunk))
    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    
    final_context = []
    current_len = 0
    for _, chunk in scored_chunks:
        if current_len + len(chunk) > context_size: break
        final_context.append(chunk)
        current_len += len(chunk)
    return "\n---\n".join(final_context)

class LLMWorker:
    def __init__(self, name, system_prompt):
        self.name = name
        self.agent = Agent(name=name, model=Groq(id="llama-3.3-70b-versatile"), markdown=False)
        self.system_prompt = system_prompt

    def run(self, prompt: str) -> str:
        return self.agent.run(f"{self.system_prompt}\n\n{prompt}").content

class Paper2BrainPipeline:
    def __init__(self):
        self.main_agent = LLMWorker("MainAgent", MAIN_AGENT_PROMPT)
        self.relationship_agent = LLMWorker("RelationshipAgent", RELATIONSHIP_AGENT_PROMPT)
        self.revision_agent = LLMWorker("RevisionAgent", REVISION_AGENT_PROMPT)
        self.justifier_agent = LLMWorker("JustifierAgent", JUSTIFIER_AGENT_PROMPT)
        
        self.query_agent = LLMWorker("QueryAgent", 
            "You are a Search Decision Engine. "
            "Task: Convert the User Request into a search query for a vector database.\n"
            "Rules:\n"
            "1. If the user wants a simple graph edit (e.g. 'connect A to B', 'remove node X'), output: NO_SEARCH\n"
            "2. If the user asks for NEW information or details, output ONLY 3-5 specific technical keywords.\n"
            "3. DO NOT EXPLAIN. DO NOT ANSWER THE QUESTION. DO NOT WRITE SENTENCES.\n"
            "4. Output ONLY the keywords or 'NO_SEARCH'."
        )

    def _generate_search_query(self, user_request: str, structure_summary: str) -> str:
        try:
            response = self.query_agent.run(f"Structure Summary: {structure_summary}...\n\nUser Request: {user_request}").strip()
            if "NO_SEARCH" in response: return "NO_SEARCH"
            return response
        except: return user_request

    def construct_fast_response(self, main_state, relationships):
        return f"<explanations>\n<info>(Fast Mode: Explanations Skipped)</info>\n</explanations>"

    # --- GENERATION LOGIC (UNCHANGED) ---
    def run_generator(self, source_text: str, user_prompt: str, skip_explanations: bool = False, iterations: int = 2):
        yield {"type": "log", "message": "Main Agent: Synthesizing initial structure..."}
        safe_source = source_text
        
        raw_main = self.main_agent.run(f"User request:\n{user_prompt}\n\nSource text:\n{safe_source}")

        main_state = validate_and_format_main(raw_main)
        if not main_state: main_state = raw_main 
        
        yield {"type": "log", "message": "Main Agent: Structure synthesized."}
        relationships = ""
        
        for i in range(iterations):
            yield {"type": "log", "message": f"Relationship Agent: Topology pass {i+1}/{iterations}..."}
            raw_rels = self.relationship_agent.run(main_state)
            cleaned_rels = validate_and_format_rels(raw_rels)
            if cleaned_rels: relationships = cleaned_rels
            
            yield {"type": "log", "message": f"Main Agent: Critique pass {i+1}/{iterations}..."}
            critique = self.main_agent.run(
                f"You previously produced the following structure:\n\n{main_state}\n\n"
                f"The following relationships were proposed:\n\n{relationships}\n\n"
                f"Critique the relationships against the source text and structure.\n"
                f"If revisions are needed, revise the nodes and/or relationship_context.\n"
                f"If sufficient, reproduce the structure unchanged."
            )

            cleaned_critique = validate_and_format_main(critique)
            if not cleaned_critique or cleaned_critique.strip() == main_state.strip():
                yield {"type": "log", "message": "Structure converged."}
                break
            main_state = cleaned_critique
            yield {"type": "log", "message": "Main Agent: Revisions applied."}
        
        yield {"type": "log", "message": "Relationship Agent: Final synchronization..."}
        raw_final_rels = self.relationship_agent.run(main_state)
        final_rels = validate_and_format_rels(raw_final_rels)
        if final_rels: relationships = final_rels    

        if skip_explanations:
            explanations = self.construct_fast_response(main_state, relationships)
        else:
            yield {"type": "log", "message": "Justifier Agent: Writing technical explanations..."}
            raw_expl = self.justifier_agent.run(
                f"Structure:\n{main_state}\n\n"
                f"Relationships:\n{relationships}\n\n"
                f"Reference Material:\n{safe_source}\n\n"
                f"INSTRUCTION: Based on the Structure and Reference Material above, generate the <explanations> XML block."
            )
            explanations = extract_section(raw_expl, "explanations") or raw_expl

        yield {"type": "result", "data": {
            "structure": main_state, "relationships": relationships, "explanations": explanations, "source_text_memory": source_text 
        }}

    # --- NEW: ROBUST REVISION LOGIC ---
    def run_revision_generator(self, prompt: str, current_structure: str, current_relationships: str, source_text: str, snipped_nodes: str = "", skip_explanations: bool = False, context_size: int = 3000):
        yield {"type": "log", "message": "Query Agent: Analyzing revision intent..."}

        structure_summary = f"{current_structure}\n{current_relationships}"
        smart_query = self._generate_search_query(f"{prompt} {snipped_nodes}", structure_summary)
        
        relevant_context = ""
        if smart_query != "NO_SEARCH":
            yield {"type": "log", "message": f"RAG: Searching for '{smart_query}'..."}
            relevant_context = get_relevant_context(source_text, smart_query, context_size)
        else:
            yield {"type": "log", "message": "RAG: Simple edit detected. Skipping search."}

        yield {"type": "log", "message": "Revision Agent: Applying surgical edits..."}
        
        # We pass everything to the Revision Agent in one go.
        # It bypasses the RelationshipAgent to prevent re-wiring chaos.
        raw_revised = self.revision_agent.run(
            f"CURRENT_NODES:\n{current_structure}\n\n"
            f"CURRENT_RELATIONSHIPS:\n{current_relationships}\n\n"
            f"FOCUS_AREA (EDITABLE): {snipped_nodes if snipped_nodes else 'Global (Apply with caution)'}\n\n"
            f"RETRIEVED CONTEXT (For Info): {relevant_context}\n\n"
            f"USER REQUEST: {prompt}\n"
        )
        
        # Validation parses the merged output back into structure/relationships
        result_map = validate_full_state(raw_revised)
        
        main_state = result_map["structure"]
        relationships = result_map["relationships"]

        # Fallback: If Revision Agent output garbage, revert to old
        if not main_state or len(main_state) < 10:
             yield {"type": "log", "message": "Revision Agent failed. Reverting."}
             main_state = current_structure
             relationships = current_relationships

        if skip_explanations:
            explanations = self.construct_fast_response(main_state, relationships)
        else:
            yield {"type": "log", "message": "Justifier Agent: Updating explanations..."}
            raw_expl = self.justifier_agent.run(
                f"Structure: {main_state}\nRelationships: {relationships}\n\n"
                f"Context: {relevant_context}\n\n"
                f"Explain the components."
            )
            explanations = extract_section(raw_expl, "explanations") or raw_expl

        yield {"type": "result", "data": {
            "structure": main_state, "relationships": relationships, "explanations": explanations, "source_text_memory": source_text 
        }}