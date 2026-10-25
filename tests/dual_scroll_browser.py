"""Regression: two natural scroll areas, large result list, live selected-byte totals."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import ROOT, init

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':440, 'height':600}, device_scale_factor=1)
    markup=(ROOT/'popup.html').read_text().replace('<link rel="stylesheet" href="popup.css">', '<style>'+(ROOT/'popup.css').read_text()+'</style>')
    markup=markup.replace('<script src="i18n.js"></script><script src="quality.js"></script><script src="popup.js"></script>', '')
    page.route('https://pbs.twimg.com/**', lambda route:route.fulfill(status=200, content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20" fill="#eee"/></svg>'))
    page.set_content(markup)
    init(page)
    page.add_script_tag(content=(ROOT/'popup.js').read_text())
    page.locator('#sniff').click()
    page.locator('.post-card').nth(1).wait_for(timeout=4000)
    page.wait_for_function('''() => [...document.querySelectorAll('.video-quality')].every(x => Number(x.dataset.sizeBytes) > 0 && x.dataset.sizeExact === 'true')''')
    # Two 360p videos use the mock GET_SIZES HEAD values: 1 MiB each.
    page.locator('#select-all').check()
    assert '已选 2 个视频' in page.locator('.batch-count').inner_text()
    assert '2.0 MB' in page.locator('.batch-size').inner_text(),page.locator('.batch-size').inner_text()
    assert '压缩前' in page.locator('.batch-size').inner_text()
    page.locator('.video-quality').first.select_option('1') # 720P -> 2 MiB
    assert '3.0 MB' in page.locator('.batch-size').inner_text()
    page.locator('.video-quality').last.select_option('2') # 1080P -> 3 MiB
    assert '5.0 MB' in page.locator('.batch-size').inner_text()
    page.locator('.video-check').first.uncheck()
    assert '3.0 MB' in page.locator('.batch-size').inner_text()
    page.locator('#defaultQuality').select_option('720')  # both should now use 2 MiB
    assert '2.0 MB' in page.locator('.batch-size').inner_text()
    page.locator('#select-all').check()
    assert '4.0 MB' in page.locator('.batch-size').inner_text()
    # The nonblocking fallback uses bitrate * duration, clearly marked as an estimate.
    page.evaluate('''() => { const s=document.querySelector('.video-quality');s.dataset.sizeBytes='12500000';s.dataset.sizeExact='false';s.dispatchEvent(new Event('change')); }''')
    # Dispatching change resets the value to measured HEAD data; simulate a metadata refresh directly.
    page.evaluate('''() => { const s=document.querySelector('.video-quality');s.dataset.sizeBytes='12500000';s.dataset.sizeExact='false';document.querySelector('.video-check').click();document.querySelector('.video-check').click(); }''')
    assert '约 ' in page.locator('.batch-size').inner_text()
    # Reset select to receive usual fresh metadata.
    page.locator('.video-quality').first.select_option('1')
    page.evaluate('''() => {
      const list=document.querySelector('.result-list');
      const template=list.querySelector('.post-card');
      for(let i=0;i<18;i++) list.append(template.cloneNode(true));
    }''')
    def measure():
        return page.evaluate('''() => {
          const l=document.querySelector('.result-list'), b=document.querySelector('.batchbar'), h=document.documentElement;
          const a=l.getBoundingClientRect(), bb=b.getBoundingClientRect();
          const last=l.lastElementChild.getBoundingClientRect();
          return {outerScroll:h.scrollTop,outerMax:h.scrollHeight-h.clientHeight,innerScroll:l.scrollTop,innerMax:l.scrollHeight-l.clientHeight,
            listH:l.clientHeight,barTop:bb.top,barBottom:bb.bottom,listTop:a.top,listBottom:a.bottom,lastBottom:last.bottom,documentHeight:h.clientHeight};
        }''')
    # Outer scroll reveals most of the new ~460px list viewport.
    page.evaluate('document.documentElement.scrollTop=0')
    before=measure()
    assert before['outerMax'] >= 150,before
    page.evaluate('document.documentElement.scrollTop=document.documentElement.scrollHeight')
    focused=measure()
    assert focused['outerScroll']>100 and focused['listH']>=440,focused
    assert focused['innerMax']>1000,focused
    assert focused['barTop'] < before['barTop']-100, (before,focused)
    assert focused['listTop'] >= focused['barBottom']-1,focused
    assert focused['listBottom']<=focused['documentHeight']+1,focused
    page.evaluate('document.querySelector(".result-list").scrollTop=0')
    top=measure()
    for ratio in (0.25,0.7,1,0.5,0,1):
        page.evaluate('(ratio) => {const l=document.querySelector(".result-list");l.scrollTop=(l.scrollHeight-l.clientHeight)*ratio}',ratio)
        m=measure()
        assert abs(m['barTop']-top['barTop'])<1,m
        assert abs(m['listTop']-top['listTop'])<1,m
        assert abs(m['outerScroll']-top['outerScroll'])<1,m
        assert m['listTop']>=m['barBottom']-1,m
        if ratio==1: assert m['lastBottom'] <= m['listBottom']+1,m
    page.evaluate('document.querySelector(".result-list").scrollTop=500')
    page.screenshot(path='/mnt/data/X-Video-Quality-1.5.2-Dual-Scroll.png')
    # Revalidate button controls after both scroll paths.
    page.locator('#select-all').uncheck(force=True)
    assert page.locator('#batch').is_disabled()
    assert '勾选后显示预计大小' in page.locator('.batch-size').inner_text()
    page.locator('#select-all').check(force=True)
    assert page.locator('.video-check:checked').count()==20
    assert page.locator('#batch').is_enabled()
    print('PASS quality-dependent total, unknown/estimated labeling, double scrollbar, long list last row, fixed nonoverlay toolbar, selection controls')
    print('layout', focused)
    browser.close()
