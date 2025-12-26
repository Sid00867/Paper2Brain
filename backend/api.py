import os
import shutil
import json
import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader

# Import the shared logic
from agno_agent import Paper2BrainPipeline

app = FastAPI(title="Paper2Brain Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def parse_document(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        try:
            reader = PdfReader(file_path)
            return "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception as e:
            raise ValueError(f"Error parsing PDF: {str(e)}")
    elif ext in [".txt", ".md", ".json", ".py", ".js"]:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            raise ValueError(f"Error reading text file: {str(e)}")
    else:
        raise ValueError(f"Unsupported file type: {ext}")

async def stream_generator(source_text: str, user_prompt: str):
    """
    Consumes the agno_agent generator and formats it for Server-Sent Events (NDJSON).
    """
    pipeline = Paper2BrainPipeline()
    
    try:
        # Iterate over the logic defined in agno_agent.py
        for event in pipeline.run_generator(source_text, user_prompt):
            # Serialize the dict to a JSON string + newline
            yield json.dumps(event) + "\n"
            
    except Exception as e:
        yield json.dumps({"type": "error", "message": str(e)}) + "\n"

@app.post("/api/generate")
async def generate_diagram(
    prompt: str = Form(...),
    file: UploadFile = File(...)
):
    temp_filename = f"temp_{file.filename}"
    try:
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        source_text = parse_document(temp_filename)
        
        if not source_text.strip():
            raise HTTPException(status_code=400, detail="Document empty.")

        return StreamingResponse(
            stream_generator(source_text, prompt),
            media_type="application/x-ndjson"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)