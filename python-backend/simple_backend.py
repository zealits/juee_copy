from flask import Flask, request, jsonify
from groq import Groq
import os
from flask_cors import CORS
import markdown
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Initialize Groq client
GROQ_API_KEY = "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"
groq_client = Groq(api_key=GROQ_API_KEY)

# Store conversation history
conversation_history = []

# For testing when API key isn't available
MOCK_RESPONSE = """## Analysis
- The candidate provided a clear overview of the differences between monolithic and microservices architectures
- They correctly identified that monolithic architectures are single, unified applications
- They mentioned microservices are composed of smaller, independent services that communicate via APIs

## Evaluation
- Strengths: Good understanding of basic architectural concepts
- Areas for improvement: Could have discussed scaling considerations in more depth
- Technical depth: Intermediate level understanding demonstrated

## Follow-up Questions
- How would you handle data consistency challenges in a microservices architecture?
- Can you describe a scenario where you would choose monolithic over microservices?
- What monitoring and observability considerations are important for microservices?"""

@app.route('/analyze', methods=['POST'])
def analyze_text():
    """Analyze the input text using Groq's LLaMA model with conversation history."""
    global conversation_history

    data = request.json
    text_input = data.get('text', '')

    if not text_input:
        return jsonify({"error": "No text provided"}), 400

    # Add user input to history
    conversation_history.append({"role": "user", "content": text_input})
    
    logger.info(f"Received text for analysis: {text_input[:100]}...")

    # Prepare the prompt with context
    system_prompt = """You are an AI-powered technical interview evaluator. 
Your task is to:
1. Analyze the candidate's response
2. Evaluate their technical knowledge and communication skills
3. Generate relevant follow-up questions based on their answer
4. Provide feedback in a structured format

Format your response in markdown with the following sections:
## Analysis
- Key points from the answer
- Technical accuracy
- Communication clarity

## Evaluation
- Strengths
- Areas for improvement
- Technical depth

## Follow-up Questions
- 2-3 relevant technical questions to dig deeper
- Focus on areas that need clarification

Keep the tone professional and constructive. ENSURE ALL THREE SECTIONS (Analysis, Evaluation, and Follow-up Questions) ARE INCLUDED IN YOUR RESPONSE."""

    try:
        if groq_client:
            # Include the last 5 messages for context
            messages = [
                {"role": "system", "content": system_prompt}
            ] + conversation_history[-5:]  # Keep last 5 exchanges

            logger.info("Sending request to Groq API...")
            response = groq_client.chat.completions.create(
                model="llama3-70b-8192",
                messages=messages,
                temperature=0.7,
                max_tokens=1024
            )

            analysis_result = response.choices[0].message.content.strip()
            logger.info(f"Received response from Groq API: {analysis_result[:100]}...")
        else:
            # Use mock data when API key isn't available
            logger.info("Using mock response (no API key available)...")
            analysis_result = MOCK_RESPONSE
        
        # Verify that all sections are present
        required_sections = ["## Analysis", "## Evaluation", "## Follow-up Questions"]
        missing_sections = [section for section in required_sections if section not in analysis_result]
        
        if missing_sections:
            logger.warning(f"Missing sections in API response: {missing_sections}")
            # Append any missing sections with placeholder content
            for section in missing_sections:
                analysis_result += f"\n\n{section}\n- No {section.replace('## ', '')} provided"
        
        logger.info("Final analysis result has all required sections")

        # Add AI response to history
        conversation_history.append(
            {"role": "assistant", "content": analysis_result})

        return jsonify({
            "transcript": text_input,
            "analysis": analysis_result
        })

    except Exception as e:
        logger.error(f"Error in analyze_text: {str(e)}")
        # Fall back to mock data on error
        return jsonify({
            "transcript": text_input,
            "analysis": MOCK_RESPONSE
        })


@app.route('/reset', methods=['POST'])
def reset_conversation():
    """Reset the conversation history"""
    global conversation_history
    conversation_history = []
    logger.info("Conversation history reset")
    return jsonify({"status": "Conversation history reset"})


if __name__ == "__main__":
    logger.info(f"Starting Flask app on port 8004, GROQ_API_KEY {'is set' if GROQ_API_KEY else 'is NOT set'}")
    app.run(port=8004, debug=True) 
