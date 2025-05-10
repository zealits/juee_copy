from groq import Groq
import os
import markdown
from typing import List, Dict
import json

class InterviewAnalyzer:
    def __init__(self):
        self.groq_client = Groq(api_key=os.getenv("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"))
        self.conversation_history: List[Dict] = []
        
    def analyze_response(self, transcript: str) -> Dict:
        """
        Analyze the candidate's response using Groq and generate follow-up questions.
        """
        # Add user input to history
        self.conversation_history.append({"role": "user", "content": transcript})
        
        # Prepare the prompt with context
        system_prompt = """You are an AI-powered technical interview evaluator. 
Your task is to:
1. Analyze the candidate's response to the previous question
2. Evaluate their technical knowledge and communication skills
3. Generate a relevant follow-up question based on their answer
4. Provide an expected answer for the follow-up question
5. Provide feedback in a structured format

Format your response in markdown with the following sections:
## Analysis of Previous Answer
- Key points from the answer
- Technical accuracy
- Communication clarity

## Evaluation
- Strengths
- Areas for improvement
- Technical depth

## Next Question
- Provide one clear, concise follow-up question 

## Expected Answer
- Detailed explanation of what a good answer to the next question should include
- Key technical points that should be mentioned
- Common misconceptions to avoid

Keep the tone professional and constructive."""

        try:
            # Include the last 5 messages for context
            messages = [
                {"role": "system", "content": system_prompt}
            ] + self.conversation_history[-5:]  # Keep last 5 exchanges for context

            response = self.groq_client.chat.completions.create(
                model="llama3-70b-8192",
                messages=messages,
                temperature=0.7,
                max_tokens=1024
            )

            analysis_result = response.choices[0].message.content.strip()
            
            # Add AI response to history
            self.conversation_history.append(
                {"role": "assistant", "content": analysis_result}
            )

            # Convert markdown to HTML
            html_output = markdown.markdown(analysis_result)

            # Extract the sections
            sections = self._extract_sections(analysis_result)

            return {
                "transcript": transcript,
                "analysis": analysis_result,
                "analysis_html": html_output,
                "next_question": sections.get("next_question", ""),
                "expected_answer": sections.get("expected_answer", ""),
                "previous_analysis": sections.get("analysis_of_previous_answer", "")
            }

        except Exception as e:
            print(f"Error in Groq analysis: {str(e)}")
            return {
                "error": "Failed to analyze response",
                "transcript": transcript
            }

    def _extract_sections(self, analysis: str) -> Dict[str, str]:
        """
        Extract sections from the analysis text.
        """
        sections = {}
        current_section = None
        current_content = []
        
        for line in analysis.split('\n'):
            if line.startswith('## '):
                # Save previous section if exists
                if current_section and current_content:
                    sections[current_section.lower().replace(' ', '_')] = '\n'.join(current_content).strip()
                    current_content = []
                
                # Start new section
                current_section = line[3:].strip()
            elif current_section:
                current_content.append(line)
        
        # Save the last section
        if current_section and current_content:
            sections[current_section.lower().replace(' ', '_')] = '\n'.join(current_content).strip()
        
        return sections

    def reset_conversation(self):
        """Reset the conversation history"""
        self.conversation_history = []
        return {"status": "Conversation history reset"}
