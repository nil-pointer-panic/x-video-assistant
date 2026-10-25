"""Long-list UI regression: two scrollers and toolbar never hides video cards."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import ROOT, init, ID, VIDEO

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':440,'height':600},device_scale_factor=1)
    html=(ROOT/'popup.html').read_text().replace('<link rel="stylesheet" href="popup.css">','<style>'+(ROOT/'popup.css').read_text()+'</style>')
    html=html.replace('<script src="i18n.js"></script><script src="quality.js"></script><script src="popup.js"></script>','')
    page.route('https://pbs.twimg.com/**',lambda route:route.fulfill(status=200, content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="#e2e8f0" /></svg>'))
    page.set_content(html)
    init(page)
    page.add_script_tag(content=(ROOT/'popup.js').read_text())
    page.locator('#sniff').click()
    page.locator('.post-card').nth(1).wait_for(timeout=4000)
    # Clamp the dialog to the actual Chrome popup height while extending its content.
    page.evaluate('''() => {
      const list=document.querySelector('.result-list');
      const seed=list.querySelector('.post-card');
      for(let i=0;i<18;i++)list.appendChild(seed.cloneNode(true));
    }''')
    def metrics():
        return page.evaluate('''() => {
          const list=document.querySelector('.result-list');
          const bar=document.querySelector('.batchbar');
          const result=document.querySelector('#result');
          const last=list.lastElementChild;
          const a=list.getBoundingClientRect(), b=bar.getBoundingClientRect();
          return {barTop:b.top, barBottom:b.bottom, listTop:a.top, listBottom:a.bottom,
            listScroll:list.scrollTop, listMax:list.scrollHeight-list.clientHeight, listHeight:list.clientHeight, outerScroll:document.scrollingElement.scrollTop,
            resultScroll:result.scrollTop, rootOverflows:document.scrollingElement.scrollHeight>innerHeight,
            lastBottom:last.getBoundingClientRect().bottom, viewport:innerHeight,
            barPosition:getComputedStyle(bar).position, resultOverflow:getComputedStyle(result).overflowY};
        }''')
    page.evaluate('document.documentElement.scrollTop=document.documentElement.scrollHeight')
    first=metrics(); assert first['barPosition']=='static' and first['resultOverflow']=='visible',first
    assert first['listTop']>=first['barBottom']-1,first
    assert first['listTop']-first['barBottom']<=1,first
    assert first['listMax']>100,first
    assert first['rootOverflows'] and first['listHeight']>=440,first
    assert first['resultScroll']==0,first
    for ratio in [0.35,1,0.7,0,1,0]:
        page.evaluate('(ratio)=>{ const list=document.querySelector(".result-list"); list.scrollTop=(list.scrollHeight-list.clientHeight)*ratio;}',ratio)
        m=metrics()
        assert abs(m['barTop']-first['barTop'])<=1,m
        assert abs(m['barBottom']-first['barBottom'])<=1,m
        assert abs(m['listTop']-first['listTop'])<=1,m
        assert m['resultScroll']==0 and m['rootOverflows'],m
        assert abs(m['outerScroll']-first['outerScroll'])<=1,m
        assert 0<=m['listScroll']<=m['listMax']+1,m
        if ratio==1:
            assert m['lastBottom']<=m['listBottom']+1,m
    page.evaluate('document.querySelector(".result-list").scrollTop=0')
    page.screenshot(path='/mnt/data/X-Video-Quality-1.5.2-Toolbar.png')
    page.evaluate('document.querySelector(".result-list").scrollTop=650')
    page.screenshot(path='/mnt/data/X-Video-Quality-1.5.2-Scroll.png')
    # Ensure the bar still works after manual scroll: selecting a video updates header.
    page.locator('.video-check').first.check()
    assert '已选 1 个视频' in page.locator('.batch-count').inner_text()
    assert '打包 ZIP (1)' in page.locator('#batch').inner_text()
    page.locator('#select-all').check()
    assert page.locator('.video-check:checked').count()==20
    assert page.locator('#batch').is_disabled()==False
    print('PASS 20-item dual scroll: inner toolbar locked, outer page scroll, no gap, no overlap, last fully visible')
    print('layout',first)
    browser.close()
