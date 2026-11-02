const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  await page.goto('https://www.daraz.pk/catalog/?q=samsung+galaxy+s24', { waitUntil: 'domcontentloaded', timeout: 80000 });
  
  try { await page.waitForSelector('a[href*="/products/"]', { timeout: 40000 }); } catch(e) { console.log('selector timeout'); }
  await new Promise(r => setTimeout(r, 5000));
  
  const cards = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/products/"]')].slice(0, 3);
    return links.map((a, idx) => {
      let card = a;
      for (let i = 0; i < 5; i++) { if (card.parentElement) card = card.parentElement; }
      
      const hierarchy = [];
      let el = a;
      while (el && el !== document.body) {
        hierarchy.push({
          tag: el.tagName,
          cls: (typeof el.className === 'string' ? el.className : '').substring(0, 80)
        });
        el = el.parentElement;
      }
      
      return {
        idx,
        linkHref: a.href.substring(0, 120),
        cardHTML: card.outerHTML.substring(0, 1200),
        hierarchy: hierarchy.slice(0, 8)
      };
    });
  });
  
  cards.forEach(c => {
    console.log('\n=== Card', c.idx, '===');
    console.log('Link:', c.linkHref);
    console.log('Hierarchy:', JSON.stringify(c.hierarchy));
    console.log('HTML:', c.cardHTML.substring(0, 800));
  });
  
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
