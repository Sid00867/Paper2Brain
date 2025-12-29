import os
import shutil
import json
import uvicorn
import nest_asyncio
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader
from llama_parse import LlamaParse

nest_asyncio.apply()

from agno_agent import Paper2BrainPipeline

app = FastAPI(title="Paper2Brain Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_pypdf_text(file_path):
    try:
        reader = PdfReader(file_path)
        return "\n\n".join((page.extract_text() or "") for page in reader.pages)
    except: return None

def get_llama_text(file_path):
    print("...Starting LlamaParse...")
    try:
        parser = LlamaParse(result_type="markdown", verbose=True, language="en")
        documents = parser.load_data(file_path)
        return "\n\n".join([doc.text for doc in documents])
    except Exception as e: raise ValueError(f"LlamaParse failed: {str(e)}")


# --- NEW: Debug Helper to Print & Yield ---
async def debug_and_stream(generator_func):
    """Iterates through the agent generator, prints the FINAL result to console, and streams to client."""
    for item in generator_func:
        # Check if this is the final result payload
        if item.get("type") == "result":
            print("\n" + "="*50)
            print("🔍 DEBUG: DATA SENT TO FRONTEND")
            print("="*50)
            # Pretty print the JSON data (Structure, Relationships, Explanations)
            print(json.dumps(item["data"], indent=2)) 
            print("="*50 + "\n")
            
        yield json.dumps(item) + "\n"

# --- Updated Generators using the Debug Helper ---

async def stream_generator(source_text: str, user_prompt: str, skip_explanations: bool, iterations: int):
    try:
        pipeline = Paper2BrainPipeline()
        # Wrap the generator in our debug helper
        gen = pipeline.run_generator(source_text, user_prompt, skip_explanations, iterations)
        async for chunk in debug_and_stream(gen):
            yield chunk
    except Exception as e:
        yield json.dumps({"type": "error", "message": str(e)}) + "\n"

async def revision_stream_generator(prompt, structure, relationships, source_text, snip, skip_explanations, context_size):
    try:
        pipeline = Paper2BrainPipeline()
        # Wrap the generator in our debug helper
        gen = pipeline.run_revision_generator(prompt, structure, relationships, source_text, snip, skip_explanations, context_size)
        async for chunk in debug_and_stream(gen):
            yield chunk
    except Exception as e:
        yield json.dumps({"type": "error", "message": str(e)}) + "\n"

@app.post("/api/generate")
async def generate_diagram(
    prompt: str = Form(...),
    skip_explanations: bool = Form(False),
    use_fast_parse: bool = Form(False),
    iterations: int = Form(2),
    file: UploadFile = File(...)
):
    temp_filename = f"temp_{file.filename}"
    try:
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        source_text = None
        if use_fast_parse:
            source_text = get_pypdf_text(temp_filename)
        
        if not source_text or not source_text.strip():
             source_text = get_llama_text(temp_filename)
        
        if not source_text or not source_text.strip():
            raise HTTPException(status_code=400, detail="Document empty.")

        return StreamingResponse(
            stream_generator(source_text, prompt, skip_explanations, iterations),
            media_type="application/x-ndjson"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_filename):
            try: os.remove(temp_filename)
            except: pass

@app.post("/api/revise")
async def revise_diagram(
    prompt: str = Form(...),
    current_structure: str = Form(...),
    current_relationships: str = Form(...),
    source_text_memory: str = Form(""), 
    snipped_nodes: str = Form(""), 
    skip_explanations: bool = Form(False),
    context_size: int = Form(3000)
):
    return StreamingResponse(
        revision_stream_generator(prompt, current_structure, current_relationships, source_text_memory, snipped_nodes, skip_explanations, context_size),
        media_type="application/x-ndjson"
    )

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)