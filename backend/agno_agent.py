from dotenv import load_dotenv
load_dotenv()

from pypdf import PdfReader
from agno.agent import Agent
from agno.models.groq import Groq
import json

from system_prompt import (
    MAIN_AGENT_PROMPT,
    RELATIONSHIP_AGENT_PROMPT,
    JUSTIFIER_AGENT_PROMPT,
)

MAX_ITERS = 2

def load_pdf_text(path: str) -> str:
    reader = PdfReader(path)
    return "\n\n".join(page.extract_text() or "" for page in reader.pages)

class LLMWorker:
    def __init__(self, name, system_prompt):
        self.name = name
        self.agent = Agent(
            name=name,
            model=Groq(id="llama-3.3-70b-versatile"), 
            markdown=False,
        )
        self.system_prompt = system_prompt

    def run(self, prompt: str) -> str:
        # The Pipeline controls the logging now.
        result = self.agent.run(f"{self.system_prompt}\n\n{prompt}")
        return result.content

class Paper2BrainPipeline:
    def __init__(self):
        self.main_agent = LLMWorker("MainAgent", MAIN_AGENT_PROMPT)
        self.relationship_agent = LLMWorker("RelationshipAgent", RELATIONSHIP_AGENT_PROMPT)
        self.justifier_agent = LLMWorker("JustifierAgent", JUSTIFIER_AGENT_PROMPT)

    def run_generator(self, source_text: str, user_prompt: str):
        """
        Yields events: { "type": "log"|"result", "message": str, "data": dict }
        """
        yield {"type": "log", "message": "Main Agent: Synthesizing initial structure..."}

        main_state = self.main_agent.run(
            f"User request:\n{user_prompt}\n\nSource text:\n{source_text}"
        )
        yield {"type": "log", "message": "Main Agent: Structure synthesized."}

        relationships = ""
        for i in range(MAX_ITERS):
            yield {"type": "log", "message": f"Relationship Agent: Topology pass {i+1}..."}
            relationships = self.relationship_agent.run(main_state)

            yield {"type": "log", "message": f"Main Agent: Critique pass {i+1}..."}

            critique_and_revision = self.main_agent.run(
                f"You previously produced the following structure:\n\n{main_state}\n\n"
                f"The following relationships were proposed:\n\n{relationships}\n\n"
                f"Critique the relationships against the source text and structure.\n"
                f"If revisions are needed, revise the nodes and/or relationship_context.\n"
                f"If sufficient, reproduce the structure unchanged."
            )

            if critique_and_revision.strip() == main_state.strip():
                yield {"type": "log", "message": "Main Agent: Structure converged."}
                break

            main_state = critique_and_revision
            yield {"type": "log", "message": "Main Agent: Revisions applied."}

        yield {"type": "log", "message": "Justifier Agent: Writing technical explanations..."}

        explanations = self.justifier_agent.run(
            f"{main_state}\n\n{relationships}\n\nSource text:\n{source_text}"
        )

        final_result = {
            "structure": main_state,
            "relationships": relationships,
            "explanations": explanations,
        }

        yield {"type": "log", "message": "Pipeline Complete."}
        yield {"type": "result", "data": final_result}

    def run(self, source_text: str, user_prompt: str):
        """
        CLI Wrapper: Consumes the generator and prints to stdout.
        Returns the final result dict.
        """
        result = None
        for event in self.run_generator(source_text, user_prompt):
            if event["type"] == "log":
                print(f"[Paper2Brain] {event['message']}", flush=True)
            elif event["type"] == "result":
                result = event["data"]
        return result

if __name__ == "__main__":
    # CLI Usage Example
    PDF_PATH = "./1811.04551v5_removed.pdf"
    prompt = "Build a system-level diagram illustrating latent overshooting..."

    print(f"Loading {PDF_PATH}...")
    try:
        text = load_pdf_text(PDF_PATH)

        pipeline = Paper2BrainPipeline()
        res = pipeline.run(text, prompt)

        print("\n===== FINAL RESULT =====\n")
        # Added safeguard for when res is None due to errors
        if res:
            print(res["structure"][:200] + "...")
        else:
            print("Pipeline failed to produce a result.")

    except Exception as e:
        print(f"Error: {e}")