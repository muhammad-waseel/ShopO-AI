const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  await page.goto('https://www.daraz.pk/catalog/?q=samsung+galaxy+s24', { waitUntil: 'domcontentloaded', timeout: 80000 });
  
  try { await page.waitForSelector('[data-qa-locator="product-item"]', { timeout: 45000 }); console.log('Cards appeared!'); } catch(e) { console.log('selector timeout'); }
  await new Promise(r => setTimeout(r, 3000));
  
  const cardData = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-qa-locator="product-item"]')].slice(0, 2);
    return cards.map((card, i) => {
      // Full inner text
      const text = card.innerText;
      // Get first card's full HTML
      const html = card.innerHTML;
      // Get all class names
      const allClasses = new Set();
      card.querySelectorAll('*').forEach(el => {
        if (typeof el.className === 'string') {
          el.className.split(/\s+/).forEach(c => { if(c) allClasses.add(c); });
        }
      });
      return { idx: i, text: text.substring(0, 500), classes: [...allClasses], html: html.substring(0, 2000) };
    });
  });
  
  cardData.forEach(c => {
    console.log('\n=== Card', c.idx, '===');
    console.log('TEXT:', c.text);
    console.log('\nCLASSES:', c.classes.join(', '));
    console.log('\nHTML:', c.html.substring(0, 1200));
  });
  
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
