import requests
import re
from typing import Dict


OPENROUTER_API_KEY = "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"

MODEL = "mistralai/mistral-7b-instruct:free"
API_URL = "https://openrouter.ai/api/v1/chat/completions"


def call_llm(prompt: str, retries: int = 3) -> str:
    for attempt in range(retries):
        try:
            response = requests.post(
                API_URL,
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:3000", 
                    "X-Title": "Paper2Brain",
                },
                json={
                    "model": MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a precise technical assistant. Always wrap your answers in the requested XML tags."
                        },
                        {
                            "role": "user",
                            "content": prompt
                        }
                    ],
                    "temperature": 0.1 # Slight temperature helps free models avoid empty output
                    # "reasoning": True
                },
                timeout=45
            )
            response.raise_for_status()
            res_json = response.json()
            
            if "choices" not in res_json:
                continue

            content = res_json["choices"][0]["message"]["content"]

            if content and content.strip() and "<s>" not in content:
                return content
        except Exception as e:
            print(f"Attempt {attempt + 1} failed: {e}")
            continue

    raise RuntimeError("LLM returned empty output or failed after retries. Check if your daily 50-request limit is reached.")


def extract_block(text: str, tag: str) -> str:
    """Uses Regex for robust extraction even if LLM adds markdown or extra text."""
    pattern = rf"<{tag}>(.*?)</{tag}>"
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        # Fallback: if model only wrote the content without tags
        print(f"Warning: Missing <{tag}> tags. Raw text: {text}")
        return text.strip()
    return match.group(1).strip()


class Agent:
    def run(self, state: Dict) -> Dict:
        raise NotImplementedError


class ConceptAgent(Agent):
    def run(self, state: Dict) -> Dict:
        prompt = f"""
Extract core technical concepts from the text. 
Format:
<concepts>
Concept Name
Concept Name
</concepts>

Text:
{state['text']}
"""
        output = call_llm(prompt)
        block = extract_block(output, "concepts")
        concepts = [c.strip() for c in block.splitlines() if c.strip() and not c.startswith('<')]
        return {"concepts": concepts}


class RelationAgent(Agent):
    def run(self, state: Dict) -> Dict:
        concepts_list = "\n".join(state['concepts'])
        prompt = f"""
Identify dependencies between these concepts. 
Format:
<relations>
Concept A -> depends_on -> Concept B
</relations>

Concepts:
{concepts_list}
"""
        output = call_llm(prompt)
        block = extract_block(output, "relations")

        relations = []
        for line in block.splitlines():
            if "->" in line:
                parts = [x.strip() for x in line.split("->")]
                if len(parts) == 3:
                    relations.append(parts)

        return {"relations": relations}


class TypeAgent(Agent):
    def run(self, state: Dict) -> Dict:
        concepts_list = "\n".join(state['concepts'])
        prompt = f"""
Classify each concept as: core_concept, assumption, model_component, or variable.
Format:
<types>
Concept Name : type
</types>

Concepts:
{concepts_list}
"""
        output = call_llm(prompt)
        block = extract_block(output, "types")

        types = {}
        for line in block.splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                types[k.strip()] = v.strip()

        return {"types": types}


# ===================== MAIN AGENT =====================

class MainAgent:
    def __init__(self):
        self.concept_agent = ConceptAgent()
        self.relation_agent = RelationAgent()
        self.type_agent = TypeAgent()

    def run(self, text: str) -> Dict:
        state = {"text": text}
        print("--- Extracting Concepts ---")
        state.update(self.concept_agent.run(state))
        
        print("--- Inferring Relations ---")
        state.update(self.relation_agent.run(state))
        
        print("--- Classifying Types ---")
        state.update(self.type_agent.run(state))
        return state


# ===================== EXECUTION =====================

if __name__ == "__main__":
    document = """
We consider a model-based reinforcement learning framework in which the agent learns a compact 
latent dynamics model from high-dimensional observations. The latent dynamics are factorized into a deterministic
recurrent component that captures long-term dependencies and a stochastic component that models uncertainty and
partial observability. An encoder maps observations into latent space, while a decoder reconstructs observations for representation learning.

Action selection is performed by planning in latent space using a learned reward predictor and a trajectory optimization procedure.
During training, the latent dynamics model is optimized by minimizing a variational objective that balances reconstruction accuracy,
prediction consistency, and regularization of the latent distribution. At inference time, the encoder is discarded and the agent relies 
solely on the learned dynamics and reward models, making accurate latent transition modeling critical for long-horizon performance.
    """

    agent = MainAgent()
    try:
        result = agent.run(document)

        print("\n" + "="*30)
        print("FINAL OUTPUT:")
        print("="*30)
        for k, v in result.items():
            if k != "text":
                print(f"\n[{k.upper()}]:")
                print(v)
    except Exception as e:
        print(f"\nERROR: {e}")