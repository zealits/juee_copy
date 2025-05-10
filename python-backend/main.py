from fastapi import FastAPI, WebSocket, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import json
from datetime import datetime
from interview_analyzer import InterviewAnalyzer
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the interview analyzer
interview_analyzer = InterviewAnalyzer()

# Store active connections
active_connections = []

@app.websocket("/ws/transcription")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    
    try:
        while True:
            # Receive transcription data
            data = await websocket.receive_text()
            
            try:
                # Parse the JSON data
                transcription_data = json.loads(data)
                
                # Get current timestamp
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                
                # Print the transcription with timestamp
                print(f"[{timestamp}] Transcription: {transcription_data['transcript']}")
                
                # Save to file
                with open("transcriptions.txt", "a", encoding="utf-8") as f:
                    f.write(f"[{timestamp}] {transcription_data['transcript']}\n")
                
                # Send back the transcription to be displayed (without analysis)
                await websocket.send_json({
                    "type": "transcription",
                    "data": {
                        "transcript": transcription_data['transcript'],
                        "timestamp": timestamp
                    }
                })
                
            except json.JSONDecodeError:
                print("Error: Invalid JSON data received")
            except Exception as e:
                print(f"Error processing transcription: {str(e)}")
                
    except Exception as e:
        print(f"WebSocket error: {str(e)}")
    finally:
        active_connections.remove(websocket)

@app.post("/analyze")
async def analyze_text(data: dict = Body(...)):
    """
    Analyze a text response using Groq.
    """
    try:
        text = data.get("text", "")
        if not text:
            raise HTTPException(status_code=400, detail="No text provided")
            
        result = interview_analyzer.analyze_response(text)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/reset")
async def reset_conversation():
    """
    Reset the conversation history.
    """
    try:
        result = interview_analyzer.reset_conversation()
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
