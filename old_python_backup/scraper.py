import time
import re
import random
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

# --- 1. RELEVANCE CHECK & JUNK FILTER ---
def is_relevant(product_name, search_query):
    if not product_name or not search_query: return False
    
    p_name = product_name.lower()
    q_words = search_query.lower().split()

    junk_words = [
        "cover", "case", "casing", "protector", "glass", "tempered", 
        "cable", "charger", "adapter", "usb", "cord", "silicone", 
        "pouch", "strap", "band", "box", "dummy", "sticker", "skin"
    ]
    
    for junk in junk_words:
        if junk in p_name:
            return False 

    numbers_in_query = re.findall(r'\d+', search_query)
    for num in numbers_in_query:
        if num not in p_name:
            return False 

    for word in q_words:
        if word in p_name:
            return True
            
    return False

# --- 2. SMART PRICE CONVERTER ---
def extract_price(text, currency_symbol=""):
    """
    Ab ye function check karega ke currency symbol kya hai.
    Agar '$' hai to convert karega, agar 'Rs' hai to same rahega.
    """
    if not text: return 0
    try:
        # Cleaning
        clean = text.lower().replace(',', '').strip()
        
        # Check Currency from Symbol or Text
        is_usd = '$' in text or '$' in currency_symbol
        is_pkr = 'rs' in text.lower() or 'pkr' in text.lower()
        
        # Regex to find number
        matches = re.findall(r"(\d+(?:\.\d+)?)", clean)
        if not matches: return 0
        
        val = float(matches[0])
        
        # LOGIC:
        if is_usd:
            return int(val * 278) # USD to PKR
        else:
            return int(val) # Already PKR or Unknown (Safe to keep as is)
            
    except: return 0

# --- 3. BROWSER SETUP (STEALTH) ---
def setup_driver():
    options = Options()
    options.add_argument("--window-size=1280,800")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    
    return driver

# --- 4. DARAZ SCRAPER ---
def scrape_daraz(driver, query):
    print(f"\n🔵 [Daraz] Checking availability for '{query}'...")
    products = []
    try:
        driver.get(f"https://www.daraz.pk/catalog/?q={query}")
        time.sleep(5)
        
        items = driver.find_elements(By.XPATH, "//div[contains(@class, 'gridItem')] | //div[@data-qa-locator='product-item']")
        
        for item in items:
            if len(products) >= 5: break
            try:
                text_split = item.text.split('\n')
                name = text_split[0]
                
                if not is_relevant(name, query): continue 

                price = 0
                for line in text_split:
                    if 'Rs' in line or 'PKR' in line:
                        price = extract_price(line)
                        break
                
                try: image = item.find_element(By.TAG_NAME, "img").get_attribute("src")
                except: image = ""
                try: link = item.find_element(By.TAG_NAME, "a").get_attribute("href")
                except: link = "#"

                if price > 5000: 
                    products.append({
                        "name": name,
                        "display_price": f"Rs. {price:,}",
                        "numeric_price": price,
                        "image": image,
                        "platform": "Daraz",
                        "link": link
                    })
            except: continue
    except Exception as e: print(f"Daraz Error: {e}")
    return products

# --- 5. AMAZON SCRAPER (PRICE FIXED) ---
def scrape_amazon(driver, query):
    print(f"\n🟠 [Amazon] Checking availability for '{query}'...")
    products = []
    try:
        formatted_query = query.replace(" ", "+")
        url = f"https://www.amazon.com/s?k={formatted_query}"
        driver.get(url)
        time.sleep(random.uniform(3, 5))
        
        if "Something went wrong" in driver.page_source:
            driver.refresh()
            time.sleep(5)

        items = driver.find_elements(By.CSS_SELECTOR, "div[data-component-type='s-search-result']")
        
        for item in items:
            if len(products) >= 5: break
            try:
                try: name = item.find_element(By.TAG_NAME, "h2").text
                except: continue

                if not is_relevant(name, query): continue

                # --- PRICE EXTRACTION FIX ---
                price = 0
                try:
                    # Method 1: Get Symbol directly (e.g. $, Rs)
                    try:
                        currency_symbol = item.find_element(By.CSS_SELECTOR, ".a-price-symbol").text
                    except:
                        currency_symbol = "" # Default empty

                    # Method 2: Get Whole Number
                    price_whole = item.find_element(By.CSS_SELECTOR, ".a-price-whole").text
                    
                    # Pass both to extractor. 
                    # Note: We are NOT adding '$' manually anymore.
                    price = extract_price(price_whole, currency_symbol)
                    
                except:
                    # Fallback: Check if price text exists in raw text
                    price = 0

                try: image = item.find_element(By.CSS_SELECTOR, ".s-image").get_attribute("src")
                except: image = ""

                try: 
                    link_elem = item.find_element(By.TAG_NAME, "h2").find_element(By.TAG_NAME, "a")
                    link = link_elem.get_attribute("href")
                except: link = "#"

                # Filter Cheap Items
                if price > 15000: 
                    products.append({
                        "name": name,
                        "display_price": f"Rs. {price:,}",
                        "numeric_price": price,
                        "image": image,
                        "platform": "Amazon",
                        "link": link
                    })
            except: continue
    except Exception as e: print(f"Amazon Error: {e}")
    return products

# --- MAIN ---
def get_products(query):
    driver = setup_driver()
    driver.maximize_window()
    all_data = []
    
    all_data.extend(scrape_daraz(driver, query))
    all_data.extend(scrape_amazon(driver, query))
    
    driver.quit()
    
    # Sort
    sorted_data = sorted(all_data, key=lambda x: x['numeric_price'])
    if sorted_data: sorted_data[0]['is_best_deal'] = True
    
    print(f"📊 Total Products: {len(sorted_data)}")
    return sorted_data