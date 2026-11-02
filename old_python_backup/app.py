from flask import Flask, render_template, request
from scraper import get_products
from ai_engine import analyze_product
import json

app = Flask(__name__)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/search')
def search():
    query = request.args.get('q')
    if not query: return render_template('index.html')
    products = get_products(query)
    return render_template('results.html', products=products, query=query)

# POST method for Analysis (Fixes URL limit error)
@app.route('/analyze', methods=['POST'])
def analyze():
    name = request.form.get('name')
    price = request.form.get('price')
    image = request.form.get('image')
    platform = request.form.get('platform')

    ai_resp = analyze_product(name, price, image, "Reviews skipped")
    
    try:
        ai_data = json.loads(ai_resp)
    except:
        ai_data = {"verdict": "Unknown", "score": 0, "reason": "AI Error"}
    
    product = {"name": name, "price": price, "image": image, "platform": platform}
    return render_template('product_detail.html', product=product, ai_data=ai_data)

if __name__ == '__main__':
    import os
    from dotenv import load_dotenv
    load_dotenv()
    debug = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    port = int(os.getenv('FLASK_PORT', 5000))
    app.run(debug=debug, port=port)