import base64
import os
import requests
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

client = Groq(api_key=GROQ_API_KEY)

def encode_image_from_url(image_url):
    try:
        response = requests.get(image_url)
        if response.status_code == 200:
            return base64.b64encode(response.content).decode('utf-8')
    except:
        return None
    return None

def analyze_product(product_name, price, image_url, reviews):
    if not GROQ_API_KEY:
        return json.dumps({"verdict": "Error", "score": 0, "reason": "GROQ_API_KEY is not set in .env"})

    base64_image = encode_image_from_url(image_url)
    
    if not base64_image:
        return json.dumps({"verdict": "Error", "score": 0, "reason": "Could not access image."})

    prompt = f"""
    Product: {product_name}
    Price: {price}
    
    Role: Expert Counterfeit Detection AI.
    Task: Analyze the image and price.
    1. Does the image look like a high-quality original product?
    2. Is the price suspicious (too low for this model)?
    
    Return JSON ONLY:
    {{
        "verdict": "Original", "Fake", or "Suspicious",
        "score": (0-100 confidence),
        "reason": "One short sentence explaining why."
    }}
    """

    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
                        },
                    ],
                }
            ],
            model="llama-3.2-90b-vision-preview",
            response_format={"type": "json_object"}
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        return json.dumps({"verdict": "Error", "score": 0, "reason": str(e)})